import { t } from "./i18n";
import {
  addMonths, firstOfMonth, lastOfMonth, toISODate, money, pct, daysBetween, parseISODate, monthLabel,
} from "./format";
import {
  getMonthlySummary, getCategoryBreakdown, getContributions, getAccountBalances, getDebts,
  getRecurringPayments, getGoals, getCashflow,
} from "./queries";
import { monthlyEquivalent } from "./recurring";
import type { CategoryTotal, MonthlySummary, SavingsGoal } from "./types";
import type { IconName } from "../constants/icons";

// ---------------- Proyección (regresión lineal) ----------------

export function linearProjection(values: number[], ahead: number): number[] {
  const n = values.length;
  if (n === 0) return Array(ahead).fill(0);
  if (n === 1) return Array(ahead).fill(values[0]);
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (values[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  return Array.from({ length: ahead }, (_, k) => Math.max(0, intercept + slope * (n + k)));
}

// ---------------- Metas ----------------

export type GoalStats = {
  progress: number; remaining: number; daysLeft: number | null; monthlyRate: number;
  requiredMonthly: number | null; projectedDate: string | null; onTrack: boolean | null;
};

export function goalStats(g: SavingsGoal): GoalStats {
  const saved = Number(g.saved_amount), target = Number(g.target_amount);
  const remaining = Math.max(0, target - saved);
  const progress = target > 0 ? Math.min(1, saved / target) : 0;
  const today = new Date();
  const daysLeft = g.target_date ? daysBetween(today, parseISODate(g.target_date)) : null;
  const start = parseISODate(g.first_contribution_at ?? g.created_at.slice(0, 10));
  const monthsElapsed = Math.max(1, daysBetween(start, today) / 30.4);
  const monthlyRate = saved > 0 ? saved / monthsElapsed : 0;
  const requiredMonthly = daysLeft != null ? (daysLeft > 0 ? remaining / Math.max(1, daysLeft / 30.4) : remaining) : null;
  let projectedDate: string | null = null;
  if (remaining === 0) projectedDate = toISODate(today);
  else if (monthlyRate > 0) {
    const d = new Date(today);
    d.setDate(d.getDate() + Math.ceil((remaining / monthlyRate) * 30.4));
    projectedDate = toISODate(d);
  }
  const onTrack = remaining === 0 ? true
    : g.target_date && projectedDate ? projectedDate <= g.target_date
      : g.target_date ? false : null;
  return { progress, remaining, daysLeft, monthlyRate, requiredMonthly, projectedDate, onTrack };
}

// ---------------- Gastos hormiga ----------------

export type AntMetrics = {
  total: number; count: number; dailyAvg: number; avgTicket: number;
  prevTotal: number; prevCount: number; change: number | null;
  projectedMonth: number; projectedYear: number; shareOfIncome: number; shareOfExpense: number;
  savingsImpact: number;
};

export function antMetrics(month: Date, cur: MonthlySummary, prev: MonthlySummary): AntMetrics {
  const now = new Date();
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const days = isCurrent ? now.getDate() : lastOfMonth(month).getDate();
  const daysInMonth = lastOfMonth(month).getDate();
  const total = cur.ant_expense, count = cur.ant_count;
  const dailyAvg = days ? total / days : 0;
  const projectedMonth = isCurrent ? dailyAvg * daysInMonth : total;
  return {
    total, count, dailyAvg,
    avgTicket: count ? total / count : 0,
    prevTotal: prev.ant_expense, prevCount: prev.ant_count,
    change: prev.ant_expense ? (total - prev.ant_expense) / prev.ant_expense : null,
    projectedMonth,
    projectedYear: projectedMonth * 12,
    shareOfIncome: cur.total_income ? total / cur.total_income : 0,
    shareOfExpense: cur.total_expense ? total / cur.total_expense : 0,
    // Cuánto más habrías ahorrado este mes sin gastos hormiga (en % del ahorro actual)
    savingsImpact: cur.net > 0 ? total / cur.net : cur.total_income ? total / cur.total_income : 0,
  };
}

// ---------------- Informe mensual ----------------

export type Level = "good" | "warn" | "bad" | "info";
export type Indicator = { key: string; label: string; value: string; level: Level; hint: string };
export type Recommendation = { level: Level; icon: IconName; text: string };

export type MonthlyReport = {
  month: Date;
  summary: MonthlySummary;
  prev: MonthlySummary;
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  antCategories: CategoryTotal[];
  prevExpenseCategories: CategoryTotal[];
  savedInGoals: number;
  prevSavedInGoals: number;
  totalBalance: number;
  avgExpense3m: number;
  goals: { saved: number; target: number; count: number };
  debtOwed: number;
  debtOwedToMe: number;
  recurringMonthly: number;
  ant: AntMetrics;
  indicators: Indicator[];
  recommendations: Recommendation[];
};

export async function buildMonthlyReport(month: Date): Promise<MonthlyReport> {
  const m = firstOfMonth(month), end = lastOfMonth(month);
  const pm = addMonths(m, -1), pend = lastOfMonth(pm);
  const [summary, prev, expenseCategories, incomeCategories, antCategories, prevExpenseCategories,
    contributions, balances, debts, recurring, goals, last3] = await Promise.all([
    getMonthlySummary(m), getMonthlySummary(pm),
    getCategoryBreakdown(m, end, "expense"), getCategoryBreakdown(m, end, "income"),
    getCategoryBreakdown(m, end, "expense", true), getCategoryBreakdown(pm, pend, "expense"),
    getContributions(), getAccountBalances(), getDebts(), getRecurringPayments(), getGoals(),
    getCashflow(addMonths(m, -2), end, "month"),
  ]);

  const inRange = (d: string, a: Date, b: Date) => d >= toISODate(a) && d <= toISODate(b);
  const savedInGoals = contributions.filter((c) => inRange(c.contributed_at, m, end)).reduce((a, c) => a + c.amount, 0);
  const prevSavedInGoals = contributions.filter((c) => inRange(c.contributed_at, pm, pend)).reduce((a, c) => a + c.amount, 0);
  const totalBalance = balances.reduce((a, b) => a + b.current_balance, 0);
  const avgExpense3m = last3.length ? last3.reduce((a, p) => a + p.expense, 0) / last3.length : summary.total_expense;
  const open = debts.filter((d) => d.status === "open");
  const debtOwed = open.filter((d) => d.direction === "i_owe_them").reduce((a, d) => a + d.principal, 0);
  const debtOwedToMe = open.filter((d) => d.direction === "they_owe_me").reduce((a, d) => a + d.principal, 0);
  const recurringMonthly = recurring.filter((r) => r.status === "active").reduce((a, r) => a + monthlyEquivalent(r), 0);
  const activeGoals = goals.filter((g) => g.status !== "archived");

  const base = {
    month: m, summary, prev, expenseCategories, incomeCategories, antCategories, prevExpenseCategories,
    savedInGoals, prevSavedInGoals, totalBalance, avgExpense3m, debtOwed, debtOwedToMe, recurringMonthly,
    goals: {
      saved: activeGoals.reduce((a, g) => a + g.saved_amount, 0),
      target: activeGoals.reduce((a, g) => a + g.target_amount, 0),
      count: activeGoals.length,
    },
    ant: antMetrics(m, summary, prev),
  };
  return { ...base, indicators: indicators(base), recommendations: recommendations(base) };
}

type ReportBase = Omit<MonthlyReport, "indicators" | "recommendations">;

function indicators(r: ReportBase): Indicator[] {
  const inc = r.summary.total_income;
  const savingsRate = inc ? r.summary.net / inc : 0;
  const expenseRatio = inc ? r.summary.total_expense / inc : 0;
  const fixedRatio = inc ? Math.max(r.summary.fixed_expense, r.recurringMonthly) / inc : 0;
  const antShare = r.summary.total_expense ? r.summary.ant_expense / r.summary.total_expense : 0;
  const emergency = r.avgExpense3m ? r.totalBalance / r.avgExpense3m : 0;
  const debtRatio = inc ? r.debtOwed / inc : 0;
  const goalProgress = r.goals.target ? r.goals.saved / r.goals.target : 0;
  const lvl = (v: number, good: (x: number) => boolean, warn: (x: number) => boolean): Level => good(v) ? "good" : warn(v) ? "warn" : "bad";
  const noIncome = !inc;

  return [
    { key: "savings", label: t("Tasa de ahorro"), value: noIncome ? "—" : pct(savingsRate), hint: t("Ideal: 20% o más del ingreso"),
      level: noIncome ? "info" : lvl(savingsRate, (x) => x >= 0.2, (x) => x >= 0.05) },
    { key: "expense", label: t("Gasto / ingreso"), value: noIncome ? "—" : pct(expenseRatio), hint: t("Ideal: 80% o menos"),
      level: noIncome ? "info" : lvl(expenseRatio, (x) => x <= 0.8, (x) => x <= 1) },
    { key: "fixed", label: t("Gastos fijos / ingreso"), value: noIncome ? "—" : pct(fixedRatio), hint: t("Regla 50/30/20: máximo 50%"),
      level: noIncome ? "info" : lvl(fixedRatio, (x) => x <= 0.5, (x) => x <= 0.65) },
    { key: "ant", label: t("Peso gastos hormiga"), value: pct(antShare, 1), hint: t("Ideal: menos del 5% del gasto"),
      level: lvl(antShare, (x) => x <= 0.05, (x) => x <= 0.1) },
    { key: "emergency", label: t("Fondo de emergencia"), value: r.avgExpense3m ? t("{n} meses", { n: emergency.toFixed(1) }) : "—",
      hint: t("Ideal: 3 a 6 meses de gastos"), level: r.avgExpense3m ? lvl(emergency, (x) => x >= 6, (x) => x >= 3) : "info" },
    { key: "debt", label: t("Deudas / ingreso mensual"), value: noIncome ? money(r.debtOwed) : `${debtRatio.toFixed(1)}x`,
      hint: t("Ideal: menos de 1 ingreso mensual"), level: !r.debtOwed ? "good" : noIncome ? "warn" : lvl(debtRatio, (x) => x <= 1, (x) => x <= 3) },
    { key: "goals", label: t("Avance de metas"), value: r.goals.target ? pct(goalProgress) : "—", hint: t("Ahorrado sobre el total de tus metas"),
      level: r.goals.target ? lvl(goalProgress, (x) => x >= 0.5, (x) => x >= 0.2) : "info" },
  ];
}

function recommendations(r: ReportBase): Recommendation[] {
  const out: Recommendation[] = [];
  const s = r.summary, inc = s.total_income;
  if (!s.tx_count) {
    out.push({ level: "info", icon: "create-outline", text: t("Registra tus ingresos y gastos de {month} para recibir recomendaciones personalizadas.", { month: monthLabel(r.month) }) });
    return out;
  }
  if (inc && s.net < 0) out.push({ level: "bad", icon: "warning-outline", text: t("Gastaste {amount} más de lo que ganaste. Revisa las categorías con mayor gasto y pon un tope semanal.", { amount: money(-s.net) }) });
  else if (inc && s.net / inc < 0.2) out.push({ level: "warn", icon: "trending-up-outline", text: t("Tu tasa de ahorro es {rate}. Intenta separar el 20% ({amount}) apenas recibas tu ingreso.", { rate: pct(s.net / inc), amount: money(inc * 0.2) }) });
  else if (inc) out.push({ level: "good", icon: "trophy-outline", text: t("¡Buen trabajo! Ahorraste el {rate} de tus ingresos este mes.", { rate: pct(s.net / inc) }) });

  if (r.ant.total > 0) {
    out.push({
      level: r.ant.shareOfExpense > 0.1 ? "bad" : r.ant.shareOfExpense > 0.05 ? "warn" : "info", icon: "cafe-outline",
      text: t("Tus gastos hormiga suman {amount} ({count} compras). A este ritmo son {year} al año; reducirlos a la mitad te ahorraría {half}.", {
        amount: money(r.ant.total), count: r.ant.count, year: money(r.ant.projectedYear), half: money(r.ant.projectedYear / 2),
      }),
    });
  }

  const top = r.expenseCategories[0];
  if (top && s.total_expense) {
    const prevTop = r.prevExpenseCategories.find((c) => c.category_id === top.category_id);
    const grew = prevTop && top.total > prevTop.total * 1.15;
    out.push({
      level: grew ? "warn" : "info", icon: "pie-chart-outline",
      text: grew
        ? t("{cat} subió {pct} frente al mes anterior y es tu mayor gasto ({amount}).", { cat: top.name, pct: pct((top.total - prevTop!.total) / prevTop!.total), amount: money(top.total) })
        : t("Tu mayor gasto fue {cat}: {amount} ({share} del total).", { cat: top.name, amount: money(top.total), share: pct(top.total / s.total_expense) }),
    });
  }

  if (r.prev.total_expense && s.total_expense > r.prev.total_expense * 1.1)
    out.push({ level: "warn", icon: "arrow-up-circle-outline", text: t("Tus gastos aumentaron {pct} respecto al mes anterior.", { pct: pct((s.total_expense - r.prev.total_expense) / r.prev.total_expense) }) });
  else if (r.prev.total_expense && s.total_expense < r.prev.total_expense * 0.9)
    out.push({ level: "good", icon: "arrow-down-circle-outline", text: t("Redujiste tus gastos {pct} frente al mes anterior. ¡Sigue así!", { pct: pct((r.prev.total_expense - s.total_expense) / r.prev.total_expense) }) });

  const emergency = r.avgExpense3m ? r.totalBalance / r.avgExpense3m : 0;
  if (r.avgExpense3m && emergency < 3)
    out.push({ level: "warn", icon: "shield-outline", text: t("Tu saldo cubre {n} meses de gastos. Crea una meta de fondo de emergencia de {amount} (3 meses).", { n: emergency.toFixed(1), amount: money(r.avgExpense3m * 3) }) });

  if (inc && r.recurringMonthly > inc * 0.5)
    out.push({ level: "warn", icon: "repeat-outline", text: t("Tus pagos recurrentes ({amount}/mes) superan el 50% de tus ingresos. Revisa suscripciones que no uses.", { amount: money(r.recurringMonthly) }) });

  if (!r.goals.count) out.push({ level: "info", icon: "flag-outline", text: t("Aún no tienes metas de ahorro. Definir una meta con fecha aumenta la probabilidad de cumplirla.") });
  if (r.debtOwedToMe > 0) out.push({ level: "info", icon: "people-outline", text: t("Te deben {amount}. Haz seguimiento para recuperar ese dinero.", { amount: money(r.debtOwedToMe) }) });
  return out;
}

export const LEVEL_COLOR: Record<Level, string> = {
  good: "#22d3a5", warn: "#f5a623", bad: "#fb5779", info: "#7c6bff",
};
