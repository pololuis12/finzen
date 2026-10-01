import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Card, GradientCard, Title, Chip, ChipRow, EmptyState, Badge, IconCircle, Fab, FadeIn, Button,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { frequencyLabel, safeIcon } from "../../constants/icons";
import { money, longDate, relativeDays } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getRecurringPayments, getCategories, markRecurringPaid } from "../../lib/queries";
import { dueState, dueStateLabel, monthlyEquivalent, type DueState } from "../../lib/recurring";
import { scheduleRecurringReminders } from "../../lib/notifications";
import type { RecurringPayment, Category } from "../../lib/types";

const STATE_COLOR: Record<DueState, string> = {
  overdue: "#fb5779", today: "#f5a623", soon: "#f5a623", ok: "#22d3a5", paused: "#8891b8", finished: "#5c6489",
};

export default function Recurring() {
  const { profile } = useSettings();
  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [cats, setCats] = useState<Map<string, Category>>(new Map());
  const [filter, setFilter] = useState<"active" | "paused" | "finished" | "all">("active");
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([getRecurringPayments(), getCategories()]);
      setItems(r); setCats(new Map(c.map((x) => [x.id, x])));
      scheduleRecurringReminders(r).catch(() => {});
    } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = items.filter((p) => p.status === "active");
  const monthly = active.reduce((a, p) => a + monthlyEquivalent(p), 0);
  const overdue = active.filter((p) => dueState(p) === "overdue");
  const next7 = active.filter((p) => ["today", "soon"].includes(dueState(p)));
  const shown = useMemo(() => items.filter((p) => filter === "all" || p.status === filter), [items, filter]);

  async function pay(p: RecurringPayment) {
    const ok = await confirm(t("¿Registrar el pago de {name} por {amount}? Se creará el gasto y el vencimiento pasará al siguiente periodo.", {
      name: p.name, amount: money(p.amount, p.currency),
    }), { okLabel: t("Marcar pagado") });
    if (!ok) return;
    setPaying(p.id);
    try { await markRecurringPaid(p); await load(); }
    catch (e) { notify(errorMessage(e)); }
    finally { setPaying(null); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.muted} />}>
        <Title sub={t("Arriendo, suscripciones, seguros, créditos…")}>{t("Pagos recurrentes")}</Title>

        <FadeIn>
          <GradientCard colors={theme.gradients.dark}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{t("Obligaciones al mes")}</Text>
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: "900" }}>{money(monthly)}</Text>
            {!!profile && (
              <Text style={{ color: theme.muted, fontSize: 12 }}>{t("{n} pagos activos", { n: active.length })}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Badge icon="alert-circle" color={overdue.length ? theme.expense : theme.income}
                label={overdue.length ? t("{n} vencidos", { n: overdue.length }) : t("Nada vencido")} />
              <Badge icon="time-outline" color={theme.warn} label={t("{n} esta semana", { n: next7.length })} />
            </View>
          </GradientCard>
        </FadeIn>

        <ChipRow>
          {([["active", t("Activos")], ["paused", t("Pausados")], ["finished", t("Finalizados")], ["all", t("Todos")]] as const).map(([k, l]) => (
            <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />
          ))}
        </ChipRow>

        {shown.length === 0 && (
          <Card>
            <EmptyState icon="repeat-outline" title={t("Sin pagos recurrentes")}
              sub={t("Registra tus obligaciones y te recordaremos 7, 3 y 1 día antes y el mismo día del vencimiento.")}
              action={{ label: t("Agregar pago"), onPress: () => router.push("/recurring-form") }} />
          </Card>
        )}

        {shown.map((p, i) => {
          const st = dueState(p);
          const cat = p.category_id ? cats.get(p.category_id) : undefined;
          const color = STATE_COLOR[st];
          return (
            <FadeIn key={p.id} delay={i * 40}>
              <Pressable onPress={() => router.push({ pathname: "/recurring-form", params: { id: p.id } })}>
                <Card style={{ gap: 12, borderColor: st === "overdue" ? color : theme.borderSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconCircle name={safeIcon(cat?.icon, "repeat-outline")} color={cat?.color ?? theme.primary} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>
                        {frequencyLabel(p.frequency)} · {longDate(p.due_date)}
                      </Text>
                    </View>
                    <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{money(p.amount, p.currency)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Badge label={dueStateLabel(st)} color={color} />
                    {p.status === "active" && <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{relativeDays(p.due_date)}</Text>}
                    <View style={{ flex: 1 }} />
                    {p.reminders_enabled && p.status === "active" && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="notifications-outline" size={13} color={theme.muted} />
                        <Text style={{ color: theme.muted, fontSize: 11 }}>{[...p.reminder_days].sort((a, b) => b - a).join(" · ")}</Text>
                      </View>
                    )}
                  </View>
                  {p.status === "active" && (
                    <Button label={t("Marcar pagado")} icon="checkmark-done-outline" tone="soft" compact
                      loading={paying === p.id} onPress={() => pay(p)} />
                  )}
                  {p.notes ? <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={2}>{p.notes}</Text> : null}
                </Card>
              </Pressable>
            </FadeIn>
          );
        })}
      </ScrollView>
      <Fab onPress={() => router.push("/recurring-form")} />
    </SafeAreaView>
  );
}
