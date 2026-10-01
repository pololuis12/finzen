import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, GradientCard, SegBar, IconButton, SectionHeader, StatTile, Delta, Button, ActionSheet,
  Loading, EmptyState, Muted, withAlpha, type SheetOption,
} from "../components/UI";
import { BarChart, LineChart, DonutChart, RankBars } from "../components/Charts";
import { useSettings } from "../components/settings";
import { useAuth } from "../components/auth";
import { theme } from "../constants/theme";
import {
  money, pct, monthLabel, monthShortLabel, addMonths, firstOfMonth, lastOfMonth, parseISODate, toISODate, getCurrency,
} from "../lib/format";
import { t, locale } from "../lib/i18n";
import { notify, errorMessage } from "../lib/alert";
import { buildMonthlyReport, linearProjection, LEVEL_COLOR, type MonthlyReport } from "../lib/analytics";
import { getCashflow, getCategoryBreakdown, getContributions } from "../lib/queries";
import {
  exportReportPdf, exportReportXlsx, shareFile, emailFile, saveToDevice, type ExportedFile,
} from "../lib/export";
import type { CashflowPoint, CategoryTotal, GoalContribution } from "../lib/types";

type Period = "day" | "month" | "year";

export default function Reports() {
  const { profile } = useSettings();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ month?: string; tab?: string }>();
  const [tab, setTab] = useState<"report" | "charts">(params.tab === "charts" ? "charts" : "report");
  const [month, setMonth] = useState(params.month ? firstOfMonth(parseISODate(params.month)) : firstOfMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<"pdf" | "xlsx" | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await buildMonthlyReport(month)); }
    catch (e) { notify(errorMessage(e)); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const isCurrent = month.getTime() === firstOfMonth().getTime();
  const userName = profile?.display_name ?? session?.user.email ?? "";

  async function doExport(kind: "pdf" | "xlsx", action: "save" | "share" | "mail") {
    if (!report) return;
    setExporting(true);
    try {
      const file: ExportedFile | null = kind === "pdf" ? await exportReportPdf(report, userName) : await exportReportXlsx(report);
      if (!file) return; // en web ya se descargó
      if (action === "share") await shareFile(file);
      else if (action === "mail") await emailFile(file, t("Informe financiero {month}", { month: monthLabel(month) }));
      else if (await saveToDevice(file)) notify(t("Archivo guardado: {name}", { name: file.name }));
    } catch (e) { notify(errorMessage(e)); }
    finally { setExporting(false); }
  }

  function startExport(kind: "pdf" | "xlsx") {
    if (Platform.OS === "web") doExport(kind, "save");
    else setSheet(kind);
  }

  const sheetOptions: SheetOption[] = sheet ? [
    { label: t("Descargar en el dispositivo"), icon: "download-outline", onPress: () => doExport(sheet, "save") },
    { label: t("Compartir (WhatsApp, Drive, OneDrive…)"), icon: "share-social-outline", onPress: () => doExport(sheet, "share") },
    { label: t("Enviar por correo"), icon: "mail-outline", onPress: () => doExport(sheet, "mail") },
  ] : [];

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Informes y estadísticas")} />}>
      <SegBar value={tab} onChange={setTab} options={[
        { key: "report", label: t("Informe mensual"), icon: "document-text-outline" },
        { key: "charts", label: t("Gráficos"), icon: "stats-chart-outline" },
      ]} />

      {tab === "report" ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <IconButton name="chevron-back" onPress={() => setMonth(addMonths(month, -1))} />
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{monthLabel(month)}</Text>
            <IconButton name="chevron-forward" onPress={() => !isCurrent && setMonth(addMonths(month, 1))} color={isCurrent ? theme.mutedDim : theme.text} />
          </View>
          {loading || !report ? <Loading /> : <ReportBody r={report} />}
          {report && (
            <Card style={{ gap: 10 }}>
              <SectionHeader title={t("Exportar y compartir")} icon="share-outline" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Button label="PDF" icon="document-text-outline" tone="soft" loading={exporting && sheet === null} onPress={() => startExport("pdf")} /></View>
                <View style={{ flex: 1 }}><Button label="Excel" icon="grid-outline" tone="soft" loading={exporting && sheet === null} onPress={() => startExport("xlsx")} /></View>
              </View>
              <Muted>{t("Descarga el informe o compártelo por WhatsApp, correo, Google Drive u OneDrive.")}</Muted>
            </Card>
          )}
        </>
      ) : <ChartsTab month={month} />}

      <ActionSheet visible={!!sheet} onClose={() => setSheet(null)} options={sheetOptions}
        title={sheet === "pdf" ? t("Informe en PDF") : t("Informe en Excel")} />
    </Screen>
  );
}

// ---------------- Informe ----------------

function ReportBody({ r }: { r: MonthlyReport }) {
  const s = r.summary, p = r.prev;
  const lowest = [...r.expenseCategories].reverse().slice(0, 3);
  const savingsRate = s.total_income ? s.net / s.total_income : 0;

  return (
    <>
      <GradientCard colors={theme.gradients.hero}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{t("Saldo del mes")}</Text>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900" }}>{s.net >= 0 ? "+" : ""}{money(s.net)}</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>
          {s.total_income ? t("Tasa de ahorro: {pct}", { pct: pct(savingsRate) }) : t("Sin ingresos registrados")} · {t("Saldo en cuentas: {amount}", { amount: money(r.totalBalance) })}
        </Text>
      </GradientCard>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <KPI label={t("Ingresos")} value={s.total_income} prev={p.total_income} color={theme.income} up />
        <KPI label={t("Gastos")} value={s.total_expense} prev={p.total_expense} color={theme.expense} />
        <KPI label={t("Ahorro en metas")} value={r.savedInGoals} prev={r.prevSavedInGoals} color={theme.savings} up />
        <KPI label={t("Gastos hormiga")} value={s.ant_expense} prev={p.ant_expense} color={theme.ant} />
      </View>

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Comparativo con el mes anterior")} icon="git-compare-outline" />
        {([
          [t("Ingresos"), s.total_income, p.total_income, true],
          [t("Gastos"), s.total_expense, p.total_expense, false],
          [t("Saldo"), s.net, p.net, true],
          [t("Gastos fijos"), s.fixed_expense, p.fixed_expense, false],
          [t("Gastos normales"), s.normal_expense, p.normal_expense, false],
          [t("Gastos casuales"), s.casual_expense, p.casual_expense, false],
          [t("Movimientos"), s.tx_count, p.tx_count, true],
        ] as [string, number, number, boolean][]).map(([l, c, pr, up]) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.muted, flex: 1 }}>{l}</Text>
            <Text style={{ color: theme.text, fontWeight: "700", minWidth: 100, textAlign: "right" }}>{l === t("Movimientos") ? c : money(c)}</Text>
            <View style={{ width: 54, alignItems: "flex-end" }}><Delta current={c} previous={pr} goodWhenUp={up} /></View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title={t("Gastos por categoría")} icon="pie-chart-outline" />
        {r.expenseCategories.length === 0 ? <EmptyState icon="pie-chart-outline" title={t("Sin gastos este mes")} /> : (
          <>
            <DonutChart segments={r.expenseCategories.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.mutedDim }))} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: withAlpha(theme.expense, 0.12), borderRadius: 12, padding: 10 }}>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{t("Mayor gasto")}</Text>
                <Text style={{ color: theme.text, fontWeight: "800" }} numberOfLines={1}>{r.expenseCategories[0].name}</Text>
                <Text style={{ color: theme.expense, fontSize: 12 }}>{money(r.expenseCategories[0].total)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: withAlpha(theme.income, 0.12), borderRadius: 12, padding: 10 }}>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{t("Menor gasto")}</Text>
                <Text style={{ color: theme.text, fontWeight: "800" }} numberOfLines={1}>{lowest.map((c) => c.name).join(", ")}</Text>
                <Text style={{ color: theme.income, fontSize: 12 }}>{money(lowest[0]?.total ?? 0)}</Text>
              </View>
            </View>
          </>
        )}
      </Card>

      {r.incomeCategories.length > 0 && (
        <Card style={{ gap: 12 }}>
          <SectionHeader title={t("Ingresos por categoría")} icon="cash-outline" />
          <RankBars items={r.incomeCategories.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.income }))} />
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <SectionHeader title={`🐜 ${t("Gastos hormiga")}`} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <StatTile label={t("Total")} value={money(r.ant.total)} color={theme.ant} />
          <StatTile label={t("Compras")} value={String(r.ant.count)} />
          <StatTile label={t("Promedio diario")} value={money(r.ant.dailyAvg)} />
          <StatTile label={t("Proyección anual")} value={money(r.ant.projectedYear)} />
        </View>
        {r.antCategories.length > 0 && <RankBars items={r.antCategories.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.ant }))} />}
      </Card>

      <Card style={{ gap: 4 }}>
        <SectionHeader title={t("Indicadores financieros")} icon="speedometer-outline" />
        {r.indicators.map((i) => (
          <View key={i.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LEVEL_COLOR[i.level] }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>{i.label}</Text>
              <Text style={{ color: theme.mutedDim, fontSize: 11 }}>{i.hint}</Text>
            </View>
            <Text style={{ color: LEVEL_COLOR[i.level], fontWeight: "900" }}>{i.value}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Recomendaciones")} icon="bulb-outline" />
        {r.recommendations.map((x, i) => (
          <View key={i} style={{
            flexDirection: "row", gap: 10, padding: 12, borderRadius: 12,
            backgroundColor: withAlpha(LEVEL_COLOR[x.level], 0.1), borderLeftWidth: 4, borderLeftColor: LEVEL_COLOR[x.level],
          }}>
            <Ionicons name={x.icon} size={18} color={LEVEL_COLOR[x.level]} />
            <Text style={{ color: theme.text, flex: 1, lineHeight: 19 }}>{x.text}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function KPI({ label, value, prev, color, up }: { label: string; value: number; prev: number; color: string; up?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: theme.card, borderRadius: 16, padding: 12, gap: 4, borderWidth: 1, borderColor: theme.borderSoft }}>
      <Text style={{ color: theme.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: "900" }} numberOfLines={1} adjustsFontSizeToFit>{money(value)}</Text>
      <Delta current={value} previous={prev} goodWhenUp={!!up} />
    </View>
  );
}

// ---------------- Gráficos ----------------

function ChartsTab({ month }: { month: Date }) {
  const [period, setPeriod] = useState<Period>("month");
  const [flow, setFlow] = useState<CashflowPoint[]>([]);
  const [cats, setCats] = useState<CategoryTotal[]>([]);
  const [contrib, setContrib] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (period === "day") return { from: firstOfMonth(month), to: lastOfMonth(month), ahead: 7 };
    if (period === "month") return { from: addMonths(firstOfMonth(month), -11), to: lastOfMonth(month), ahead: 3 };
    return { from: new Date(month.getFullYear() - 4, 0, 1), to: new Date(month.getFullYear(), 11, 31), ahead: 2 };
  }, [period, month]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCashflow(range.from, range.to, period), getCategoryBreakdown(range.from, range.to, "expense"), getContributions()])
      .then(([f, c, g]) => { setFlow(f); setCats(c); setContrib(g); })
      .catch((e) => notify(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [range, period]);

  // Buckets completos del periodo (incluye los vacíos)
  const buckets = useMemo(() => {
    const out: Date[] = [];
    const d = new Date(range.from);
    while (d <= range.to) {
      out.push(new Date(d));
      if (period === "day") d.setDate(d.getDate() + 1);
      else if (period === "month") d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
    }
    // En el periodo diario del mes actual, solo hasta hoy
    const today = new Date();
    return period === "day" ? out.filter((x) => x <= today || month < firstOfMonth()) : out;
  }, [range, period, month]);

  const key = (d: Date) => period === "day" ? toISODate(d) : period === "month" ? toISODate(d).slice(0, 7) : String(d.getFullYear());
  const fkey = (s: string) => period === "day" ? s.slice(0, 10) : period === "month" ? s.slice(0, 7) : s.slice(0, 4);
  const map = new Map(flow.map((p) => [fkey(p.bucket), p]));
  const label = (d: Date) => period === "day" ? String(d.getDate()) : period === "month" ? monthShortLabel(d) : String(d.getFullYear());

  const income = buckets.map((b) => map.get(key(b))?.income ?? 0);
  const expense = buckets.map((b) => map.get(key(b))?.expense ?? 0);
  const net = income.map((v, i) => v - expense[i]);

  // Proyección lineal de los próximos periodos
  const projInc = linearProjection(income, range.ahead);
  const projExp = linearProjection(expense, range.ahead);
  const future = Array.from({ length: range.ahead }, (_, i) => {
    const d = new Date(buckets[buckets.length - 1] ?? range.to);
    if (period === "day") d.setDate(d.getDate() + i + 1);
    else if (period === "month") d.setMonth(d.getMonth() + i + 1);
    else d.setFullYear(d.getFullYear() + i + 1);
    return d;
  });
  const trendLabels = [...buckets, ...future].map(label);
  const pad = (arr: number[]) => [...arr, ...Array(range.ahead).fill(null)];
  const projSeries = (real: number[], proj: number[]) => [...real.map((v, i) => (i === real.length - 1 ? v : null)), ...proj];

  // Evolución del ahorro: saldo neto acumulado + aportes a metas acumulados
  let accNet = 0, accGoals = 0;
  const cumNet = net.map((v) => (accNet += v));
  const cumGoals = buckets.map((b) => {
    accGoals += contrib.filter((c) => fkey(c.contributed_at) === key(b)).reduce((a, c) => a + c.amount, 0);
    return accGoals;
  });
  const priorGoals = contrib.filter((c) => c.contributed_at < toISODate(range.from)).reduce((a, c) => a + c.amount, 0);

  const totalInc = income.reduce((a, b) => a + b, 0), totalExp = expense.reduce((a, b) => a + b, 0);
  const periodLabel = period === "day" ? monthLabel(month) : period === "month" ? t("Últimos 12 meses") : t("Últimos 5 años");

  return (
    <>
      <SegBar value={period} onChange={setPeriod} options={[
        { key: "day", label: t("Diario") }, { key: "month", label: t("Mensual") }, { key: "year", label: t("Anual") },
      ]} />
      <Muted style={{ textAlign: "center" }}>{periodLabel} · {t("Toca las barras o puntos para ver el detalle")}</Muted>
      {loading ? <Loading /> : (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatTile label={t("Ingresos")} value={money(totalInc)} color={theme.income} />
            <StatTile label={t("Gastos")} value={money(totalExp)} color={theme.expense} />
          </View>

          <Card style={{ gap: 8 }}>
            <SectionHeader title={t("Ingresos vs. gastos")} icon="bar-chart-outline" />
            <BarChart labels={buckets.map(label)} series={[
              { name: t("Ingresos"), color: theme.income, values: income },
              { name: t("Gastos"), color: theme.expense, values: expense },
            ]} />
          </Card>

          <Card style={{ gap: 8 }}>
            <SectionHeader title={t("Tendencias y proyecciones")} icon="trending-up-outline" />
            <LineChart labels={trendLabels} series={[
              { name: t("Ingresos"), color: theme.income, values: pad(income) },
              { name: t("Gastos"), color: theme.expense, values: pad(expense) },
              { name: t("Proyección ingresos"), color: theme.income, values: projSeries(income, projInc), dashed: true },
              { name: t("Proyección gastos"), color: theme.expense, values: projSeries(expense, projExp), dashed: true },
            ]} />
            <Muted>{t("Proyección por regresión lineal de los datos del periodo.")}</Muted>
          </Card>

          <Card style={{ gap: 8 }}>
            <SectionHeader title={t("Evolución del ahorro")} icon="wallet-outline" />
            <LineChart labels={buckets.map(label)} series={[
              { name: t("Saldo neto acumulado"), color: theme.primary, values: cumNet },
              { name: t("Ahorro en metas"), color: theme.savings, values: cumGoals.map((v) => v + priorGoals) },
            ]} />
          </Card>

          <Card style={{ gap: 12 }}>
            <SectionHeader title={t("Gastos por categoría")} icon="pie-chart-outline" />
            {cats.length === 0 ? <EmptyState icon="pie-chart-outline" title={t("Sin gastos en el periodo")} />
              : <DonutChart segments={cats.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.mutedDim }))} />}
          </Card>
        </>
      )}
    </>
  );
}
