import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Button, IconButton, Field, DateField, SegBar, StatTile, EmptyState, Loading, Muted, Badge,
  withAlpha,
} from "../../components/UI";
import { DonutChart, LineChart } from "../../components/Charts";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { money, pct, longDate, shortDate, parseAmount, todayISO, durationLabel, monthShortLabel, parseISODate, addMonths, firstOfMonth, toISODate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getGoal, getContributions, addContribution, deleteContribution, deleteGoal, saveGoal } from "../../lib/queries";
import { goalStats, linearProjection } from "../../lib/analytics";
import type { SavingsGoal, GoalContribution } from "../../lib/types";

export default function GoalDetail() {
  useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [items, setItems] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([getGoal(id), getContributions(id)]);
      setGoal(g); setItems(c);
      // Marca la meta como cumplida automáticamente
      if (g && g.status === "active" && g.saved_amount >= g.target_amount) {
        await saveGoal({ id: g.id, status: "completed" });
        setGoal({ ...g, status: "completed" });
      }
    } catch (e) { notify(errorMessage(e)); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function contribute() {
    const v = parseAmount(amount);
    if (!v) return notify(t("Escribe un valor válido"));
    if (mode === "out" && goal && v > goal.saved_amount) return notify(t("No puedes retirar más de lo ahorrado"));
    setBusy(true);
    try {
      await addContribution({ goal_id: id, amount: mode === "in" ? v : -v, contributed_at: date, note: note.trim() || null });
      setAmount(""); setNote("");
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function removeContribution(c: GoalContribution) {
    if (!(await confirm(t("¿Eliminar este movimiento de la meta?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteContribution(c.id); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  async function remove() {
    if (!(await confirm(t("¿Eliminar la meta y todos sus aportes?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteGoal(id); router.back(); } catch (e) { notify(errorMessage(e)); }
  }

  if (loading || !goal) return <Screen header={<ScreenHeader title={t("Meta")} />}>{loading ? <Loading /> : <Muted>{t("No encontrada")}</Muted>}</Screen>;

  const s = goalStats(goal);
  const color = goal.color ?? theme.savings;

  // Evolución del ahorro: acumulado por mes + proyección hasta la fecha objetivo
  const sorted = [...items].sort((a, b) => a.contributed_at.localeCompare(b.contributed_at));
  const start = sorted.length ? firstOfMonth(parseISODate(sorted[0].contributed_at)) : firstOfMonth();
  const months: Date[] = [];
  for (let m = start; m <= firstOfMonth(); m = addMonths(m, 1)) months.push(m);
  let acc = 0;
  const cumulative = months.map((m) => {
    const key = toISODate(m).slice(0, 7);
    acc += sorted.filter((c) => c.contributed_at.slice(0, 7) === key).reduce((a, c) => a + c.amount, 0);
    return acc;
  });
  const ahead = goal.target_date ? Math.min(24, Math.max(1, Math.ceil((s.daysLeft ?? 0) / 30.4))) : 6;
  const proj = s.remaining > 0 ? linearProjection(cumulative, ahead) : [];
  const allMonths = [...months, ...proj.map((_, i) => addMonths(firstOfMonth(), i + 1))];
  const labels = allMonths.map((m) => monthShortLabel(m));
  const real = [...cumulative, ...proj.map(() => null)];
  const projected = proj.length ? [...cumulative.map((v, i) => (i === cumulative.length - 1 ? v : null)), ...proj] : [];

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={goal.name} right={
      <View style={{ flexDirection: "row", gap: 8 }}>
        <IconButton name="create-outline" onPress={() => router.push({ pathname: "/goal-form", params: { id } })} />
        <IconButton name="trash-outline" color={theme.expense} onPress={remove} />
      </View>
    } />}>
      <Card style={{ gap: 12 }}>
        <DonutChart size={170} strokeWidth={22}
          segments={[{ label: t("Ahorrado"), value: goal.saved_amount, color }, { label: t("Faltante"), value: s.remaining, color: withAlpha(color, 0.18) }]} />
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color, fontWeight: "900", fontSize: 26 }}>{pct(s.progress, 1)}</Text>
          <Text style={{ color: theme.muted }}>{t("{saved} de {target}", { saved: money(goal.saved_amount), target: money(goal.target_amount) })}</Text>
          {goal.status === "completed" && <Badge label={t("¡Meta cumplida!")} icon="trophy" color={theme.income} />}
        </View>
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatTile icon="hourglass-outline" label={t("Valor restante")} value={money(s.remaining)} />
        <StatTile icon="time-outline" label={t("Tiempo restante")} value={s.daysLeft == null ? t("Sin fecha") : durationLabel(s.daysLeft)}
          sub={goal.target_date ? longDate(goal.target_date) : undefined} />
        <StatTile icon="trending-up-outline" label={t("Ritmo actual")} value={`${money(s.monthlyRate)}/${t("mes")}`} />
        <StatTile icon="speedometer-outline" label={t("Necesitas ahorrar")}
          value={s.requiredMonthly == null ? "—" : `${money(s.requiredMonthly)}/${t("mes")}`}
          color={s.onTrack === false ? theme.warn : theme.text} />
      </View>

      <Card style={{ gap: 6, borderColor: withAlpha(s.onTrack === false ? theme.warn : theme.income, 0.4) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="analytics-outline" size={18} color={s.onTrack === false ? theme.warn : theme.income} />
          <Text style={{ color: theme.text, fontWeight: "800" }}>{t("Proyección estimada")}</Text>
        </View>
        <Text style={{ color: theme.textDim, lineHeight: 20 }}>
          {s.remaining === 0 ? t("¡Ya alcanzaste esta meta!")
            : !s.projectedDate ? t("Haz tu primer aporte para calcular cuándo cumplirás la meta.")
              : s.onTrack === false
                ? t("A tu ritmo actual la cumplirías el {date}, después de la fecha objetivo. Ahorra {amount} al mes para llegar a tiempo.", { date: longDate(s.projectedDate), amount: money(s.requiredMonthly ?? 0) })
                : t("A tu ritmo actual ({rate}/mes) la cumplirías el {date}.", { rate: money(s.monthlyRate), date: longDate(s.projectedDate) })}
        </Text>
      </Card>

      {items.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{t("Evolución del ahorro")}</Text>
          <LineChart labels={labels} series={[
            { name: t("Ahorrado"), color, values: real },
            ...(projected.length ? [{ name: t("Proyección"), color: theme.muted, values: projected, dashed: true }] : []),
            { name: t("Meta"), color: withAlpha(theme.income, 0.6), values: labels.map(() => goal.target_amount), dashed: true },
          ]} />
        </Card>
      )}

      <Card style={{ gap: 12 }}>
        <SegBar value={mode} onChange={setMode} options={[
          { key: "in", label: t("Aportar"), icon: "add-circle-outline" }, { key: "out", label: t("Retirar"), icon: "remove-circle-outline" },
        ]} />
        <Field label={t("Valor")} icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <DateField label={t("Fecha")} value={date} onChange={(d) => d && setDate(d)} />
        <Field label={t("Nota")} icon="create-outline" value={note} onChangeText={setNote} placeholder={t("Opcional")} />
        <Button label={mode === "in" ? t("Registrar aporte") : t("Registrar retiro")} icon="checkmark" onPress={contribute} loading={busy} />
      </Card>

      <Card style={{ gap: 2 }}>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>{t("Historial")}</Text>
        {items.length === 0 && <EmptyState icon="wallet-outline" title={t("Sin aportes todavía")} />}
        {items.map((c) => (
          <Pressable key={c.id} onLongPress={() => removeContribution(c)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Ionicons name={c.amount > 0 ? "arrow-down-circle" : "arrow-up-circle"} size={22} color={c.amount > 0 ? theme.income : theme.expense} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text }}>{c.note || (c.amount > 0 ? t("Aporte") : t("Retiro"))}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{shortDate(c.contributed_at)}</Text>
            </View>
            <Text style={{ color: c.amount > 0 ? theme.income : theme.expense, fontWeight: "800" }}>
              {c.amount > 0 ? "+" : "-"}{money(Math.abs(c.amount))}
            </Text>
          </Pressable>
        ))}
        {items.length > 0 && <Text style={{ color: theme.mutedDim, fontSize: 11, marginTop: 6 }}>{t("Mantén presionado un registro para eliminarlo")}</Text>}
      </Card>
    </Screen>
  );
}
