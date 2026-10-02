import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import {
  Screen, ScreenHeader, Card, GradientCard, Field, Button, Chip, IconButton, StatTile, EmptyState, SectionHeader,
  Delta, FadeIn, Muted, withAlpha,
} from "../components/UI";
import { BarChart, RankBars } from "../components/Charts";
import { TransactionRow } from "../components/TransactionRow";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import { safeIcon } from "../constants/icons";
import {
  money, pct, monthLabel, monthShortLabel, addMonths, firstOfMonth, lastOfMonth, toISODate, parseAmount, todayISO,
} from "../lib/format";
import { t } from "../lib/i18n";
import { useAutoReload } from "../lib/dataEvents";
import { notify, errorMessage } from "../lib/alert";
import {
  getMonthlySummary, getCategoryBreakdown, getCashflow, getCategories, getAccountBalances, saveTransaction,
  getTransactionsBetween, getGoals,
} from "../lib/queries";
import { antMetrics, type AntMetrics } from "../lib/analytics";
import type { Category, AccountBalance, CategoryTotal, CashflowPoint, Transaction } from "../lib/types";

export default function AntExpenses() {
  useSettings();
  const [month, setMonth] = useState(firstOfMonth());
  const [metrics, setMetrics] = useState<AntMetrics | null>(null);
  const [byCat, setByCat] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<CashflowPoint[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<AccountBalance[]>([]);
  const [goalTarget, setGoalTarget] = useState(0);

  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const end = lastOfMonth(month);
      const [cur, prev, cb, tr, txs, c, a, g] = await Promise.all([
        getMonthlySummary(month), getMonthlySummary(addMonths(month, -1)),
        getCategoryBreakdown(month, end, "expense", true), getCashflow(addMonths(month, -5), end, "month"),
        getTransactionsBetween(toISODate(month), toISODate(end), { onlyAnt: true }), getCategories(), getAccountBalances(), getGoals(),
      ]);
      setMetrics(antMetrics(month, cur, prev)); setByCat(cb); setTrend(tr); setRecent(txs.slice(0, 15));
      const antCats = c.filter((x) => x.is_ant);
      setCats(antCats); setAccts(a);
      setGoalTarget(g.filter((x) => x.status === "active").reduce((s, x) => s + Math.max(0, x.target_amount - x.saved_amount), 0));
      if (!catId && antCats[0]) setCatId(antCats[0].id);
    } catch (e) { console.warn(e); }
  }, [month]);

  useAutoReload(load);
  useEffect(() => { load(); }, [month]);

  async function quickAdd() {
    const v = parseAmount(amount);
    if (!v) return notify(t("Escribe un valor válido"));
    if (!accts[0]) return notify(t("Primero crea una cuenta en Más → Cuentas"));
    setBusy(true);
    try {
      const cat = cats.find((c) => c.id === catId);
      await saveTransaction({
        type: "expense", expense_type: "casual", is_ant: true, amount: v, occurred_at: todayISO(),
        category_id: catId, account_id: accts[0].account_id, payment_method: "cash",
        description: desc.trim() || cat?.name || t("Gasto hormiga"),
      });
      setAmount(""); setDesc("");
      if (month.getTime() !== firstOfMonth().getTime()) setMonth(firstOfMonth()); else await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const trendMap = new Map(trend.map((p) => [p.bucket.slice(0, 7), p.ant]));
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const isCurrent = month.getTime() === firstOfMonth().getTime();
  const m = metrics;

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={`🐜 ${t("Gastos hormiga")}`} sub={t("Pequeños gastos que suman mucho")} />}>
      <Card style={{ gap: 12, borderColor: withAlpha(theme.ant, 0.4) }}>
        <SectionHeader title={t("Registro rápido")} icon="flash-outline" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {cats.map((c) => (
            <Chip key={c.id} label={c.name} icon={safeIcon(c.icon)} color={c.color ?? theme.ant} active={catId === c.id} onPress={() => setCatId(c.id)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Field icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t("Valor")} /></View>
          <View style={{ flex: 1.4 }}><Field icon="create-outline" value={desc} onChangeText={setDesc} placeholder={t("Detalle (opcional)")} /></View>
        </View>
        <Button label={t("Agregar gasto hormiga")} icon="add" onPress={quickAdd} loading={busy} />
        <Text style={{ color: theme.primary, fontSize: 12, textAlign: "center" }}
          onPress={() => router.push({ pathname: "/transaction-form", params: { ant: "1" } })}>
          {t("Registro completo (fecha, foto, ubicación…)")}
        </Text>
      </Card>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton name="chevron-back" onPress={() => setMonth(addMonths(month, -1))} />
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{monthLabel(month)}</Text>
        <IconButton name="chevron-forward" onPress={() => !isCurrent && setMonth(addMonths(month, 1))} color={isCurrent ? theme.mutedDim : theme.text} />
      </View>

      {m && (
        <>
          <FadeIn>
            <GradientCard colors={theme.gradients.warn}>
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{t("Total gastado")}</Text>
              <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900" }}>{money(m.total)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{t("vs. mes anterior ({amount})", { amount: money(m.prevTotal) })}</Text>
                <View style={{ backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Delta current={m.total} previous={m.prevTotal} goodWhenUp={false} />
                </View>
              </View>
            </GradientCard>
          </FadeIn>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <StatTile icon="calendar-outline" label={t("Promedio diario")} value={money(m.dailyAvg)} color={theme.ant} />
            <StatTile icon="cart-outline" label={t("Cantidad de compras")} value={String(m.count)}
              sub={m.prevCount ? t("{n} el mes anterior", { n: m.prevCount }) : undefined} />
            <StatTile icon="pricetag-outline" label={t("Ticket promedio")} value={money(m.avgTicket)} />
            <StatTile icon="trending-up-outline" label={isCurrent ? t("Proyección del mes") : t("Total del mes")} value={money(m.projectedMonth)} />
          </View>

          <Card style={{ gap: 10 }}>
            <SectionHeader title={t("Impacto sobre tu ahorro")} icon="pulse-outline" />
            <ImpactRow label={t("Del total de ingresos")} value={pct(m.shareOfIncome, 1)} />
            <ImpactRow label={t("Del total de gastos")} value={pct(m.shareOfExpense, 1)} />
            <ImpactRow label={t("Proyección anual a este ritmo")} value={money(m.projectedYear)} strong />
            {goalTarget > 0 && (
              <ImpactRow label={t("Equivale al % de lo que te falta para tus metas")} value={pct(m.projectedYear / goalTarget)} />
            )}
            <Muted>
              {m.total === 0 ? t("¡Sin gastos hormiga este mes! 🎉")
                : t("Si los reduces a la mitad podrías ahorrar {amount} al año.", { amount: money(m.projectedYear / 2) })}
            </Muted>
          </Card>
        </>
      )}

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Comparativo mensual")} icon="bar-chart-outline" />
        <BarChart labels={months.map(monthShortLabel)} series={[
          { name: t("Gastos hormiga"), color: theme.ant, values: months.map((x) => trendMap.get(toISODate(x).slice(0, 7)) ?? 0) },
        ]} height={150} />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title={t("¿En qué se va?")} icon="pie-chart-outline" />
        {byCat.length === 0
          ? <EmptyState icon="cafe-outline" title={t("Sin gastos hormiga en este mes")} />
          : <RankBars items={byCat.map((c) => ({ label: c.name, value: c.total, color: c.color ?? theme.ant, sub: t("{n} compras", { n: c.tx_count }) }))} />}
      </Card>

      {recent.length > 0 && (
        <Card style={{ gap: 2 }}>
          <SectionHeader title={t("Registros del mes")} icon="list-outline" actionLabel={t("Ver todos")}
            onAction={() => router.push({ pathname: "/(tabs)/transactions", params: { type: "ant" } })} />
          {recent.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.category_id ? catMap.get(tx.category_id) : undefined} />)}
        </Card>
      )}
    </Screen>
  );
}

function ImpactRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: theme.muted, flex: 1 }}>{label}</Text>
      <Text style={{ color: strong ? theme.ant : theme.text, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}
