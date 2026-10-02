import type { Frequency, RecurringPayment } from "./types";
import { addDays, daysUntil, parseISODate, toISODate } from "./format";
import { t } from "./i18n";

const MONTHS: Partial<Record<Frequency, number>> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
};

/** Siguiente fecha según la frecuencia (conserva el día del mes cuando es posible). */
export function nextDueDate(iso: string, freq: Frequency): string | null {
  const d = parseISODate(iso);
  if (freq === "once") return null;
  if (freq === "weekly") return toISODate(addDays(d, 7));
  if (freq === "biweekly") return toISODate(addDays(d, 14));
  const m = MONTHS[freq]!;
  const target = new Date(d.getFullYear(), d.getMonth() + m, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toISODate(target);
}

/** Próximas `count` fechas de vencimiento a partir de due_date (incluida). */
export function upcomingDueDates(p: Pick<RecurringPayment, "due_date" | "frequency">, count: number): string[] {
  const out: string[] = [];
  let cur: string | null = p.due_date;
  while (cur && out.length < count) {
    out.push(cur);
    cur = nextDueDate(cur, p.frequency);
  }
  return out;
}

/** Equivalente mensual del valor (para sumar obligaciones de distinta frecuencia). */
export function monthlyEquivalent(p: Pick<RecurringPayment, "amount" | "frequency">) {
  const a = Number(p.amount);
  switch (p.frequency) {
    case "weekly": return (a * 52) / 12;
    case "biweekly": return (a * 26) / 12;
    case "monthly": return a;
    case "bimonthly": return a / 2;
    case "quarterly": return a / 3;
    case "semiannual": return a / 6;
    case "annual": return a / 12;
    default: return 0;
  }
}

/** Desde qué fecha se puede marcar pagado: un pago mensual (o más largo) solo dentro del mes en que vence;
 *  uno semanal/quincenal, pocos días antes. Así no se paga dos veces el mismo periodo ni periodos futuros. */
export function payableFrom(p: Pick<RecurringPayment, "due_date" | "frequency">): string {
  const d = parseISODate(p.due_date);
  if (p.frequency === "once") return toISODate(new Date(0));
  if (p.frequency === "weekly") return toISODate(addDays(d, -2));
  if (p.frequency === "biweekly") return toISODate(addDays(d, -5));
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function canPayNow(p: Pick<RecurringPayment, "due_date" | "frequency" | "status">) {
  return p.status === "active" && daysUntil(payableFrom(p)) <= 0;
}

export type DueState = "overdue" | "today" | "soon" | "ok" | "paused" | "finished";

export function dueState(p: Pick<RecurringPayment, "due_date" | "status">): DueState {
  if (p.status === "paused") return "paused";
  if (p.status === "finished") return "finished";
  const d = daysUntil(p.due_date);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "ok";
}

export const dueStateLabel = (s: DueState) => ({
  overdue: t("Vencido"), today: t("Vence hoy"), soon: t("Próximo"), ok: t("Al día"),
  paused: t("Pausado"), finished: t("Finalizado"),
})[s];

export function reminderLabel(days: number) {
  if (days === 0) return t("El mismo día");
  if (days === 1) return t("1 día antes");
  return t("{n} días antes", { n: days });
}
