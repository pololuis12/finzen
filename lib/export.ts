import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { t } from "./i18n";
import { money, pct, monthLabel, toISODate, lastOfMonth, todayISO, longDate } from "./format";
import { getTransactionsBetween, getCategories, getAccountBalances, getAllUserData } from "./queries";
import type { MonthlyReport } from "./analytics";
import { LEVEL_COLOR } from "./analytics";
import { paymentMethodLabel, txTypeLabel } from "../constants/icons";

// Exportación: genera PDF / Excel y permite guardarlos, compartirlos (WhatsApp, Drive,
// OneDrive… vía hoja de compartir del sistema) o enviarlos por correo.

export type ExportedFile = { uri: string; name: string; mime: string };

export const MIME = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

const isWeb = Platform.OS === "web";

async function writeBase64(name: string, base64: string): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

function webDownload(name: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Borra de la caché los informes/respaldos generados (contienen datos financieros). */
export async function cleanupExports() {
  if (isWeb || !FileSystem.cacheDirectory) return;
  try {
    const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
    await Promise.all(names
      .filter((n) => /^(FinZen-|finzen-backup-)/.test(n))
      .map((n) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${n}`, { idempotent: true })));
  } catch { /* la caché puede no existir aún */ }
}

// ---------------- Acciones sobre un archivo ----------------

export async function shareFile(f: ExportedFile) {
  if (!(await Sharing.isAvailableAsync())) throw new Error(t("Compartir no está disponible en este dispositivo"));
  await Sharing.shareAsync(f.uri, {
    mimeType: f.mime, dialogTitle: t("Compartir {name}", { name: f.name }),
    UTI: f.mime === MIME.pdf ? "com.adobe.pdf" : undefined,
  });
}

export async function emailFile(f: ExportedFile, subject: string) {
  if (!(await MailComposer.isAvailableAsync())) {
    // Sin app de correo configurada: la hoja de compartir también ofrece Gmail/Outlook.
    return shareFile(f);
  }
  await MailComposer.composeAsync({ subject, body: t("Adjunto el archivo generado con FinZen."), attachments: [f.uri] });
}

/** Guarda en una carpeta elegida por el usuario (Android) o vía "Guardar en Archivos" (iOS). */
export async function saveToDevice(f: ExportedFile): Promise<boolean> {
  if (Platform.OS === "android") {
    const SAF = FileSystem.StorageAccessFramework;
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm.granted) return false;
    const base64 = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 });
    const dest = await SAF.createFileAsync(perm.directoryUri, f.name.replace(/\.\w+$/, ""), f.mime);
    await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
    return true;
  }
  await shareFile(f);
  return true;
}

// ---------------- Informe mensual: PDF ----------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function variation(cur: number, prev: number, goodWhenUp: boolean) {
  if (!prev) return `<span class="muted">—</span>`;
  const ch = (cur - prev) / Math.abs(prev);
  const good = ch >= 0 === goodWhenUp;
  return `<span style="color:${good ? "#0e9f6e" : "#e11d48"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(0)}%</span>`;
}

export function reportHtml(r: MonthlyReport, userName: string) {
  const s = r.summary, p = r.prev;
  const rows: [string, number, number, boolean][] = [
    [t("Ingresos"), s.total_income, p.total_income, true],
    [t("Gastos"), s.total_expense, p.total_expense, false],
    [t("Saldo del mes"), s.net, p.net, true],
    [t("Ahorro en metas"), r.savedInGoals, r.prevSavedInGoals, true],
    [t("Gastos hormiga"), s.ant_expense, p.ant_expense, false],
    [t("Gastos fijos"), s.fixed_expense, p.fixed_expense, false],
  ];
  const catRows = (cats: typeof r.expenseCategories, total: number) => cats.map((c) =>
    `<tr><td><span class="dot" style="background:${c.color ?? "#94a3b8"}"></span>${esc(c.name)}</td><td class="n">${c.tx_count}</td><td class="n">${money(c.total)}</td><td class="n">${total ? pct(c.total / total) : "—"}</td></tr>`).join("");
  const lowest = [...r.expenseCategories].reverse().slice(0, 3);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#121630;margin:28px;font-size:12px}
  h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 8px;color:#4c3fd6}
  .muted{color:#666e91}.hero{background:linear-gradient(135deg,#4c3fd6,#a855f7);color:#fff;border-radius:14px;padding:16px 18px;margin:14px 0}
  .grid{display:flex;gap:10px;flex-wrap:wrap}.kpi{flex:1;min-width:120px;background:#f3f4fa;border-radius:10px;padding:10px}
  .kpi b{display:block;font-size:15px;margin-top:3px}table{width:100%;border-collapse:collapse}
  td,th{padding:6px 4px;border-bottom:1px solid #e3e6f2;text-align:left}th{color:#666e91;font-weight:600}
  .n{text-align:right}.dot{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:6px}
  .rec{padding:8px 10px;border-left:4px solid;border-radius:6px;background:#f8f9fd;margin-bottom:6px}
  </style></head><body>
  <h1>${t("Informe financiero")} · ${esc(monthLabel(r.month))}</h1>
  <div class="muted">${esc(userName)} · ${t("Generado el {date}", { date: longDate(todayISO()) })}</div>
  <div class="hero"><div>${t("Saldo del mes")}</div><div style="font-size:26px;font-weight:800">${money(s.net)}</div>
  <div>${t("Saldo total en cuentas")}: ${money(r.totalBalance)}</div></div>
  <div class="grid">
    <div class="kpi">${t("Ingresos")}<b style="color:#0e9f6e">${money(s.total_income)}</b></div>
    <div class="kpi">${t("Gastos")}<b style="color:#e11d48">${money(s.total_expense)}</b></div>
    <div class="kpi">${t("Ahorro en metas")}<b>${money(r.savedInGoals)}</b></div>
    <div class="kpi">${t("Gastos hormiga")}<b style="color:#d97706">${money(s.ant_expense)}</b></div>
  </div>
  <h2>${t("Comparativo con el mes anterior")}</h2>
  <table><tr><th>${t("Concepto")}</th><th class="n">${esc(monthLabel(r.month))}</th><th class="n">${t("Mes anterior")}</th><th class="n">${t("Variación")}</th></tr>
  ${rows.map(([l, c, pr, up]) => `<tr><td>${l}</td><td class="n">${money(c)}</td><td class="n">${money(pr)}</td><td class="n">${variation(c, pr, up)}</td></tr>`).join("")}</table>
  <h2>${t("Gastos por categoría")}</h2>
  <table><tr><th>${t("Categoría")}</th><th class="n">${t("Mov.")}</th><th class="n">${t("Total")}</th><th class="n">%</th></tr>${catRows(r.expenseCategories, s.total_expense) || `<tr><td colspan="4" class="muted">${t("Sin gastos")}</td></tr>`}</table>
  <p class="muted">${t("Mayor gasto")}: <b>${esc(r.expenseCategories[0]?.name ?? "—")}</b> · ${t("Menor gasto")}: <b>${esc(lowest.map((c) => c.name).join(", ") || "—")}</b></p>
  <h2>${t("Ingresos por categoría")}</h2>
  <table><tr><th>${t("Categoría")}</th><th class="n">${t("Mov.")}</th><th class="n">${t("Total")}</th><th class="n">%</th></tr>${catRows(r.incomeCategories, s.total_income) || `<tr><td colspan="4" class="muted">${t("Sin ingresos")}</td></tr>`}</table>
  <h2>${t("Gastos hormiga")}</h2>
  <div class="grid">
    <div class="kpi">${t("Total")}<b>${money(r.ant.total)}</b></div>
    <div class="kpi">${t("Compras")}<b>${r.ant.count}</b></div>
    <div class="kpi">${t("Promedio diario")}<b>${money(r.ant.dailyAvg)}</b></div>
    <div class="kpi">${t("Proyección anual")}<b>${money(r.ant.projectedYear)}</b></div>
  </div>
  <table style="margin-top:8px">${catRows(r.antCategories, r.ant.total)}</table>
  <h2>${t("Indicadores financieros")}</h2>
  <table>${r.indicators.map((i) => `<tr><td><span class="dot" style="background:${LEVEL_COLOR[i.level]}"></span>${esc(i.label)}</td><td class="n"><b>${esc(i.value)}</b></td><td class="muted">${esc(i.hint)}</td></tr>`).join("")}</table>
  <h2>${t("Recomendaciones")}</h2>
  ${r.recommendations.map((x) => `<div class="rec" style="border-color:${LEVEL_COLOR[x.level]}">${esc(x.text)}</div>`).join("")}
  <p class="muted" style="margin-top:24px">FinZen</p>
  </body></html>`;
}

export async function exportReportPdf(r: MonthlyReport, userName: string): Promise<ExportedFile | null> {
  const html = reportHtml(r, userName);
  if (isWeb) { await Print.printAsync({ html }); return null; }
  const { uri } = await Print.printToFileAsync({ html });
  const name = `FinZen-informe-${toISODate(r.month).slice(0, 7)}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: dest });
  return { uri: dest, name, mime: MIME.pdf };
}

// ---------------- Informe mensual: Excel ----------------

export async function exportReportXlsx(r: MonthlyReport): Promise<ExportedFile | null> {
  const [txs, cats, accts] = await Promise.all([
    getTransactionsBetween(toISODate(r.month), toISODate(lastOfMonth(r.month))), getCategories(), getAccountBalances(),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const acctName = new Map(accts.map((a) => [a.account_id, a.name]));
  const s = r.summary, p = r.prev;
  const wb = XLSX.utils.book_new();

  const summary = [
    [t("Informe financiero"), monthLabel(r.month)],
    [],
    [t("Concepto"), t("Este mes"), t("Mes anterior"), t("Variación")],
    ...([
      [t("Ingresos"), s.total_income, p.total_income],
      [t("Gastos"), s.total_expense, p.total_expense],
      [t("Saldo del mes"), s.net, p.net],
      [t("Ahorro en metas"), r.savedInGoals, r.prevSavedInGoals],
      [t("Gastos fijos"), s.fixed_expense, p.fixed_expense],
      [t("Gastos normales"), s.normal_expense, p.normal_expense],
      [t("Gastos casuales"), s.casual_expense, p.casual_expense],
      [t("Gastos hormiga"), s.ant_expense, p.ant_expense],
    ] as [string, number, number][]).map(([l, c, pr]) => [l, c, pr, pr ? (c - pr) / Math.abs(pr) : null]),
    [],
    [t("Saldo total en cuentas"), r.totalBalance],
    [t("Pagos recurrentes (mensual)"), r.recurringMonthly],
    [t("Deudas por pagar"), r.debtOwed],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), t("Resumen"));

  const catSheet = (rows: typeof r.expenseCategories, total: number) => XLSX.utils.json_to_sheet(rows.map((c) => ({
    [t("Categoría")]: c.name, [t("Movimientos")]: c.tx_count, [t("Total")]: c.total, ["%"]: total ? c.total / total : 0,
  })));
  XLSX.utils.book_append_sheet(wb, catSheet(r.expenseCategories, s.total_expense), t("Gastos por categoría"));
  XLSX.utils.book_append_sheet(wb, catSheet(r.incomeCategories, s.total_income), t("Ingresos por categoría"));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [t("Total"), r.ant.total], [t("Compras"), r.ant.count], [t("Promedio diario"), r.ant.dailyAvg],
    [t("Ticket promedio"), r.ant.avgTicket], [t("Mes anterior"), r.ant.prevTotal],
    [t("Proyección anual"), r.ant.projectedYear], [t("% del ingreso"), r.ant.shareOfIncome], [],
    [t("Categoría"), t("Compras"), t("Total")],
    ...r.antCategories.map((c) => [c.name, c.tx_count, c.total]),
  ]), t("Gastos hormiga"));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [t("Indicador"), t("Valor"), t("Referencia")],
    ...r.indicators.map((i) => [i.label, i.value, i.hint]), [],
    [t("Recomendaciones")], ...r.recommendations.map((x) => [x.text]),
  ]), t("Indicadores"));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txs.map((x) => ({
    [t("Fecha")]: x.occurred_at, [t("Tipo")]: txTypeLabel(x.type), [t("Descripción")]: x.description ?? "",
    [t("Categoría")]: x.category_id ? catName.get(x.category_id) ?? "" : "", [t("Cuenta")]: x.account_id ? acctName.get(x.account_id) ?? "" : "",
    [t("Forma de pago")]: x.payment_method ? paymentMethodLabel(x.payment_method) : "", [t("Valor")]: Number(x.amount),
    [t("Hormiga")]: x.is_ant ? t("Sí") : "", [t("Observaciones")]: x.notes ?? "", [t("Ubicación")]: x.location_name ?? "",
  }))), t("Movimientos"));

  return writeWorkbook(wb, `FinZen-informe-${toISODate(r.month).slice(0, 7)}.xlsx`);
}

async function writeWorkbook(wb: XLSX.WorkBook, name: string): Promise<ExportedFile | null> {
  if (isWeb) { XLSX.writeFile(wb, name); return null; }
  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return { uri: await writeBase64(name, base64), name, mime: MIME.xlsx };
}

// ---------------- Exportar toda la información del usuario ----------------

export async function exportAllData(format: "xlsx" | "json"): Promise<ExportedFile | null> {
  const data = await getAllUserData();
  const stamp = todayISO();
  if (format === "json") {
    const json = JSON.stringify({ exported_at: new Date().toISOString(), app: "FinZen", data }, null, 2);
    const name = `FinZen-datos-${stamp}.json`;
    if (isWeb) { webDownload(name, json, MIME.json); return null; }
    const uri = `${FileSystem.cacheDirectory}${name}`;
    await FileSystem.writeAsStringAsync(uri, json);
    return { uri, name, mime: MIME.json };
  }
  const wb = XLSX.utils.book_new();
  for (const [table, rows] of Object.entries(data)) {
    const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v) : v])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat.length ? flat : [{}]), table.slice(0, 31));
  }
  return writeWorkbook(wb, `FinZen-datos-${stamp}.xlsx`);
}
