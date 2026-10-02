import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, GradientCard, Card, FadeIn, SectionHeader, IconCircle, IconButton, EmptyState, ProgressBar,
  StatTile, Avatar, Badge, withAlpha,
} from "../../components/UI";
import { BarChart, DonutChart } from "../../components/Charts";
import { TransactionRow } from "../../components/TransactionRow";
import { useSettings } from "../../components/settings";
import { useAuth } from "../../components/auth";
import { theme } from "../../constants/theme";
import type { IconName } from "../../constants/icons";
import {
  money, shortDate, monthLabel, monthShortLabel, addMonths, firstOfMonth, lastOfMonth, daysUntil, relativeDays, pct, toISODate,
} from "../../lib/format";
import { t } from "../../lib/i18n";
import { canPayNow, payableFrom } from "../../lib/recurring";
import { useAutoReload } from "../../lib/dataEvents";
import {
  getMonthlySummary, getAccountBalances, getCashflow, getCategoryBreakdown, getGoals, getRecurringPayments,
  getDebts, searchTransactions, getCategories, markRecurringPaid, payingAccount,
} from "../../lib/queries";
import { notify, confirm, errorMessage } from "../../lib/alert";
import type { MonthlySummary, CashflowPoint, CategoryTotal, SavingsGoal, Transaction, Category, RecurringPayment } from "../../lib/types";

type Upcoming = {
  key: string; title: string; amount: number; currency: string; date: string; kind: "recurring" | "debt"; id: string;
  recurring?: RecurringPayment;
};

// Si una consulta falla, las demás igual actualizan la pantalla
const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => { console.warn(e); return fallback; });

export default function Dashboard() {
  const { profile, avatarUri } = useSettings();
  const { session } = useAuth();
  const [sum, setSum] = useState<MonthlySummary | null>(null);
  const [balance, setBalance] = useState(0);
  const [accountsCount, setAccountsCount] = useState(0);
  const [flow, setFlow] = useState<CashflowPoint[]>([]);
  const [cats, setCats] = useState<CategoryTotal[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [catMap, setCatMap] = useState<Map<string, Category>>(new Map());
  const [paying, setPaying] = useState<string | null>(null);

  const name = profile?.display_name ?? session?.user.email?.split("@")[0] ?? "";

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const from = addMonths(firstOfMonth(now), -5);
      const [s, accts, cf, cb, g, rec, debts, txs, allCats] = await Promise.all([
        safe(getMonthlySummary(now), null), safe(getAccountBalances(), []),
        safe(getCashflow(from, lastOfMonth(now), "month"), []),
        safe(getCategoryBreakdown(firstOfMonth(now), lastOfMonth(now), "expense"), []), safe(getGoals(), []),
        safe(getRecurringPayments(), []), safe(getDebts(), []), safe(searchTransactions({}, 0, 5), { rows: [], count: 0 }),
        safe(getCategories(), []),
      ]);
      if (s) setSum(s);
      setBalance(accts.reduce((a, b) => a + b.current_balance, 0));
      setAccountsCount(accts.length);
      setFlow(cf); setCats(cb); setGoals(g.filter((x) => x.status !== "archived"));
      setRecent(txs.rows); setCatMap(new Map(allCats.map((c) => [c.id, c])));
      const items: Upcoming[] = [
        ...rec.filter((r) => r.status === "active" && daysUntil(r.due_date) <= 30)
          .map((r) => ({ key: `r${r.id}`, id: r.id, title: r.name, amount: r.amount, currency: r.currency, date: r.due_date, kind: "recurring" as const, recurring: r })),
        ...debts.filter((d) => d.status === "open" && d.direction === "i_owe_them" && d.due_date && daysUntil(d.due_date) <= 30)
          .map((d) => ({ key: `d${d.id}`, id: d.id, title: d.counterparty, amount: d.principal, currency: d.currency, date: d.due_date!, kind: "debt" as const })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      setUpcoming(items);
    } catch (e) { console.warn(e); }
  }, []);

  useAutoReload(load);

  async function pay(p: RecurringPayment) {
    const account = await safe(payingAccount(p), null);
    if (!account) return notify(t("Selecciona una cuenta (créala en Más → Cuentas)"));
    const ok = await confirm(t("¿Confirmas que pagaste {name} por {amount}? Se descontará de {account} (quedarán {left}) y el próximo vencimiento pasará al siguiente periodo.", {
      name: p.name, amount: money(p.amount, p.currency), account: account.name, left: money(account.current_balance - p.amount, account.currency),
    }), { okLabel: t("Sí, ya pagué") });
    if (!ok) return;
    setPaying(p.id);
    try { await markRecurringPaid(p); await load(); }
    catch (e) { notify(errorMessage(e)); }
    finally { setPaying(null); }
  }

  // 6 meses completos (rellena los meses sin movimientos)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(firstOfMonth(), i - 5));
  const byMonth = new Map(flow.map((p) => [p.bucket.slice(0, 7), p]));
  const saved = goals.reduce((a, g) => a + g.saved_amount, 0);
  const target = goals.reduce((a, g) => a + g.target_amount, 0);
  const alerts = upcoming.filter((u) => daysUntil(u.date) <= 7).length;
  const showReportBanner = new Date().getDate() <= 7;
  const prevMonth = addMonths(firstOfMonth(), -1);

  return (
    <Screen onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.push("/profile")}>
          <Avatar label={name || "?"} uri={avatarUri} size={44} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>{monthLabel()}</Text>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: "900" }} numberOfLines={1}>
            {t("Hola")}{name ? `, ${name}` : ""} 👋
          </Text>
        </View>
        <IconButton name="notifications-outline" badge={alerts} onPress={() => router.push("/(tabs)/recurring")} />
      </View>

      <FadeIn>
        <GradientCard colors={theme.gradients.hero}>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" }}>{t("Saldo disponible")}</Text>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900", marginTop: 2, letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
            {money(balance)}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{t("{n} cuentas activas", { n: accountsCount })}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <HeroStat label={t("Ingresos del mes")} value={money(sum?.total_income ?? 0)} icon="arrow-down-circle" />
            <HeroStat label={t("Gastos del mes")} value={money(sum?.total_expense ?? 0)} icon="arrow-up-circle" />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{t("Balance del mes")}</Text>
            <Text style={{ color: "#fff", fontWeight: "800" }}>{(sum?.net ?? 0) >= 0 ? "+" : ""}{money(sum?.net ?? 0)}</Text>
          </View>
        </GradientCard>
      </FadeIn>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <QuickAction icon="add-circle-outline" label={t("Ingreso")} color={theme.income}
          onPress={() => router.push({ pathname: "/transaction-form", params: { type: "income" } })} />
        <QuickAction icon="remove-circle-outline" label={t("Gasto")} color={theme.expense}
          onPress={() => router.push({ pathname: "/transaction-form", params: { type: "expense" } })} />
        <QuickAction icon="cafe-outline" label={t("Hormiga")} color={theme.ant} onPress={() => router.push("/ant")} />
        <QuickAction icon="document-text-outline" label={t("Informe")} color={theme.primary} onPress={() => router.push("/reports")} />
      </View>

      {showReportBanner && (
        <Pressable onPress={() => router.push({ pathname: "/reports", params: { month: toISODate(prevMonth) } })}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderColor: withAlpha(theme.primary, 0.4) }}>
            <IconCircle name="document-text" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "800" }}>{t("Tu informe de {month} está listo", { month: monthLabel(prevMonth) })}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Ingresos, gastos, ahorro, hormiga y recomendaciones")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Card>
        </Pressable>
      )}

      <FadeIn delay={60}>
        <Pressable onPress={() => router.push("/(tabs)/goals")}>
          <Card style={{ gap: 10 }}>
            <SectionHeader title={t("Ahorro")} icon="flag-outline" actionLabel={t("Metas")} onAction={() => router.push("/(tabs)/goals")} />
            {goals.length === 0 ? (
              <EmptyState icon="flag-outline" title={t("Define tu primera meta de ahorro")}
                sub={t("Elige un valor y una fecha; te mostraremos tu progreso y proyección.")}
                action={{ label: t("Crear meta"), onPress: () => router.push("/goal-form") }} />
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <View>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Ahorro acumulado")}</Text>
                    <Text style={{ color: theme.savings, fontSize: 24, fontWeight: "900" }}>{money(saved)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Meta de ahorro")}</Text>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>{money(target)}</Text>
                  </View>
                </View>
                <ProgressBar value={target ? saved / target : 0} color={theme.savings} />
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  {t("{pct} completado · faltan {amount} · {n} metas", { pct: pct(target ? saved / target : 0), amount: money(Math.max(0, target - saved)), n: goals.length })}
                </Text>
              </>
            )}
          </Card>
        </Pressable>
      </FadeIn>

      <FadeIn delay={100}>
        <Card style={{ gap: 6 }}>
          <SectionHeader title={t("Próximos pagos y recordatorios")} icon="alarm-outline" actionLabel={t("Ver todos")} onAction={() => router.push("/(tabs)/recurring")} />
          {upcoming.length === 0 ? (
            <EmptyState icon="calendar-outline" title={t("Sin pagos en los próximos 30 días")}
              action={{ label: t("Agregar pago recurrente"), onPress: () => router.push("/recurring-form") }} />
          ) : upcoming.slice(0, 5).map((u) => {
            const d = daysUntil(u.date);
            const color = d < 0 ? theme.expense : d <= 3 ? theme.warn : theme.muted;
            return (
              <Pressable key={u.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
                onPress={() => u.kind === "recurring" ? router.push({ pathname: "/recurring-form", params: { id: u.id } }) : router.push("/(tabs)/debts")}>
                <IconCircle name={u.kind === "debt" ? "people-outline" : "repeat-outline"} color={color === theme.muted ? theme.primary : color} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={1}>{u.title}</Text>
                  <Text style={{ color, fontSize: 12, fontWeight: "600" }}>
                    {d < 0 ? `${t("Vencido")} · ${relativeDays(u.date)}` : relativeDays(u.date)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: theme.text, fontWeight: "800" }}>{money(u.amount, u.currency)}</Text>
                  {u.recurring && !canPayNow(u.recurring) && (
                    <Text style={{ color: theme.mutedDim, fontSize: 11 }}>{t("Pagar desde {date}", { date: shortDate(payableFrom(u.recurring)) })}</Text>
                  )}
                  {u.recurring && canPayNow(u.recurring) && (
                    <Pressable onPress={() => pay(u.recurring!)} disabled={paying === u.id} hitSlop={6}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4,
                        borderRadius: 999, backgroundColor: withAlpha(theme.income, 0.16), opacity: pressed || paying === u.id ? 0.6 : 1,
                      })}>
                      <Ionicons name={paying === u.id ? "hourglass-outline" : "checkmark-circle-outline"} size={14} color={theme.income} />
                      <Text style={{ color: theme.income, fontSize: 12, fontWeight: "800" }}>{paying === u.id ? t("Pagando…") : t("Pagar")}</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Card>
      </FadeIn>

      <FadeIn delay={140}>
        <Card style={{ gap: 10 }}>
          <SectionHeader title={t("Ingresos vs. gastos")} icon="bar-chart-outline" actionLabel={t("Gráficos")} onAction={() => router.push({ pathname: "/reports", params: { tab: "charts" } })} />
          <BarChart
            labels={months.map((m) => monthShortLabel(m))}
            series={[
              { name: t("Ingresos"), color: theme.income, values: months.map((m) => byMonth.get(toISODate(m).slice(0, 7))?.income ?? 0) },
              { name: t("Gastos"), color: theme.expense, values: months.map((m) => byMonth.get(toISODate(m).slice(0, 7))?.expense ?? 0) },
            ]} />
        </Card>
      </FadeIn>

      <FadeIn delay={180}>
        <Card style={{ gap: 12 }}>
          <SectionHeader title={t("Gastos por categoría")} icon="pie-chart-outline" />
          {cats.length === 0
            ? <EmptyState icon="pie-chart-outline" title={t("Sin gastos este mes")} sub={t("Cuando registres gastos verás aquí el desglose.")} />
            : <DonutChart segments={cats.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.mutedDim }))} maxLegend={6} />}
        </Card>
      </FadeIn>

      <FadeIn delay={220}>
        <Card style={{ gap: 12 }}>
          <SectionHeader title={t("Resumen mensual")} icon="document-text-outline" actionLabel={t("Informe")} onAction={() => router.push("/reports")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <StatTile label={t("Gastos fijos")} value={money(sum?.fixed_expense ?? 0)} color={theme.expenseTypes.fixed} icon="lock-closed-outline" />
            <StatTile label={t("Gastos normales")} value={money(sum?.normal_expense ?? 0)} color={theme.expenseTypes.normal} icon="cart-outline" />
            <StatTile label={t("Gastos casuales")} value={money(sum?.casual_expense ?? 0)} color={theme.expenseTypes.casual} icon="sparkles-outline" />
            <StatTile label={t("Gastos hormiga")} value={money(sum?.ant_expense ?? 0)} color={theme.ant} icon="cafe-outline"
              sub={t("{n} compras", { n: sum?.ant_count ?? 0 })} />
          </View>
          {!!sum?.total_income && (
            <Badge icon={sum.net >= 0 ? "trending-up" : "trending-down"} color={sum.net >= 0 ? theme.income : theme.expense}
              label={t("Tasa de ahorro: {pct}", { pct: pct(sum.net / sum.total_income) })} />
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={260}>
        <Card style={{ gap: 2 }}>
          <SectionHeader title={t("Últimos movimientos")} icon="time-outline" actionLabel={t("Ver todos")} onAction={() => router.push("/(tabs)/transactions")} />
          {recent.length === 0
            ? <EmptyState icon="receipt-outline" title={t("Aún no hay movimientos")}
              action={{ label: t("Registrar movimiento"), onPress: () => router.push("/transaction-form") }} />
            : recent.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.category_id ? catMap.get(tx.category_id) : undefined} />)}
        </Card>
      </FadeIn>
    </Screen>
  );
}

function HeroStat({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 14, padding: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Ionicons name={icon} size={13} color="#fff" />
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{
      flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 16,
      backgroundColor: theme.card, borderWidth: 1, borderColor: theme.borderSoft, opacity: pressed ? 0.7 : 1,
    }]}>
      <IconCircle name={icon} color={color} size={36} />
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
