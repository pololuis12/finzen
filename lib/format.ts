import { locale, t } from "./i18n";

let currentCurrency = "COP";
export function setCurrency(c: string) { currentCurrency = c; }
export function getCurrency() { return currentCurrency; }

export const CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "CLP", "PEN", "BRL", "GBP"] as const;
const NO_DECIMALS = new Set(["COP", "CLP", "ARS"]);

export function money(value: number, currency = currentCurrency) {
  const digits = NO_DECIMALS.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale(), {
      style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: 0,
    }).format(value ?? 0);
  } catch {
    return `$${Math.round(value ?? 0).toLocaleString(locale())}`;
  }
}

export function compactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${Math.round(value)}`;
}

export function pct(value: number, digits = 0) {
  if (!isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

// Acepta "1.500.000", "1,500,000", "1500000.50", "1.500,50"
export function parseAmount(input: string): number {
  let s = (input ?? "").replace(/[^\d.,]/g, "");
  if (!s) return 0;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else {
    const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
    if (sep) {
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      s = parts.length > 2 || tail.length === 3 ? parts.join("") : parts.join(".");
    }
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

export function formatBytes(n?: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------- Fechas (siempre en hora local, formato YYYY-MM-DD) ----------------

export function toISODate(d: Date) {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, "0"), day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function parseISODate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
export function todayISO() { return toISODate(new Date()); }
export function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function lastOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
export function firstOfMonthISO(d = new Date()) { return toISODate(firstOfMonth(d)); }
export function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
export function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function daysBetween(a: Date, b: Date) {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
    - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  return Math.round(ms / 86_400_000);
}
export function daysUntil(iso: string) { return daysBetween(new Date(), parseISODate(iso)); }
export function isValidISODate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function monthLabel(d = new Date()) {
  return cap(d.toLocaleDateString(locale(), { month: "long", year: "numeric" }));
}
export function monthShortLabel(d: Date) {
  return cap(d.toLocaleDateString(locale(), { month: "short" }).replace(".", ""));
}
export function shortDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(locale(), { day: "2-digit", month: "short" });
}
export function longDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
}
export function weekdayDate(iso: string) {
  return cap(parseISODate(iso).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" }));
}
export function dateTime(ts: string) {
  return new Date(ts).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeDays(iso: string) {
  const d = daysUntil(iso);
  if (d === 0) return t("Hoy");
  if (d === 1) return t("Mañana");
  if (d === -1) return t("Ayer");
  if (d < 0) return t("Hace {n} días", { n: -d });
  return t("En {n} días", { n: d });
}

export function durationLabel(days: number) {
  if (days < 0) return t("Vencida");
  if (days < 31) return t("{n} días", { n: days });
  const months = Math.round(days / 30.4);
  if (months < 24) return t("{n} meses", { n: months });
  return t("{n} años", { n: (months / 12).toFixed(1) });
}
