import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Card, GradientCard, Title, EmptyState, IconCircle, ProgressBar, Fab, FadeIn, Badge, Chip, ChipRow,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { safeIcon } from "../../constants/icons";
import { money, pct, durationLabel, longDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAutoReload } from "../../lib/dataEvents";
import { getGoals } from "../../lib/queries";
import { goalStats } from "../../lib/analytics";
import type { SavingsGoal } from "../../lib/types";

export default function Goals() {
  useSettings();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "archived">("active");

  const load = useCallback(async () => {
    try { setGoals(await getGoals()); } catch (e) { console.warn(e); }
  }, []);
  useAutoReload(load);

  const live = goals.filter((g) => g.status !== "archived");
  const saved = live.reduce((a, g) => a + g.saved_amount, 0);
  const target = live.reduce((a, g) => a + g.target_amount, 0);
  const shown = goals.filter((g) => g.status === filter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.muted} />}>
        <Title sub={t("Define metas y sigue tu progreso")}>{t("Metas de ahorro")}</Title>

        <FadeIn>
          <GradientCard colors={theme.gradients.savings}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{t("Ahorro acumulado")}</Text>
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900" }}>{money(saved)}</Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 10 }}>
              {t("de {amount} en {n} metas", { amount: money(target), n: live.length })}
            </Text>
            <ProgressBar value={target ? saved / target : 0} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", marginTop: 6 }}>{pct(target ? saved / target : 0)}</Text>
          </GradientCard>
        </FadeIn>

        <ChipRow>
          {([["active", t("Activas")], ["completed", t("Cumplidas")], ["archived", t("Archivadas")]] as const).map(([k, l]) => (
            <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />
          ))}
        </ChipRow>

        {shown.length === 0 && (
          <Card>
            <EmptyState icon="flag-outline" title={filter === "active" ? t("Crea tu primera meta") : t("Nada por aquí")}
              sub={filter === "active" ? t("Ej: Fondo de emergencia, viaje, carro… con valor y fecha objetivo.") : undefined}
              action={filter === "active" ? { label: t("Nueva meta"), onPress: () => router.push("/goal-form") } : undefined} />
          </Card>
        )}

        {shown.map((g, i) => {
          const s = goalStats(g);
          const color = g.color ?? theme.savings;
          return (
            <FadeIn key={g.id} delay={i * 40}>
              <Pressable onPress={() => router.push({ pathname: "/goal/[id]", params: { id: g.id } })}>
                <Card style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconCircle name={safeIcon(g.icon, "flag-outline")} color={color} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{g.name}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }}>
                        {money(g.saved_amount)} / {money(g.target_amount)}
                      </Text>
                    </View>
                    <Text style={{ color, fontWeight: "900", fontSize: 18 }}>{pct(s.progress)}</Text>
                  </View>
                  <ProgressBar value={s.progress} color={color} />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Faltan {amount}", { amount: money(s.remaining) })}</Text>
                    {s.daysLeft != null && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="time-outline" size={12} color={theme.muted} />
                        <Text style={{ color: theme.muted, fontSize: 12 }}>{durationLabel(s.daysLeft)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    {g.status === "completed" || s.remaining === 0
                      ? <Badge label={t("¡Cumplida!")} icon="trophy" color={theme.income} />
                      : s.onTrack === true ? <Badge label={t("A tiempo")} icon="checkmark-circle" color={theme.income} />
                        : s.onTrack === false ? <Badge label={t("Atrasada")} icon="alert-circle" color={theme.warn} />
                          : null}
                  </View>
                  {s.projectedDate && s.remaining > 0 && (
                    <Text style={{ color: theme.mutedDim, fontSize: 11 }}>
                      {t("Proyección: la cumplirías el {date}", { date: longDate(s.projectedDate) })}
                    </Text>
                  )}
                </Card>
              </Pressable>
            </FadeIn>
          );
        })}
      </ScrollView>
      <Fab onPress={() => router.push("/goal-form")} />
    </SafeAreaView>
  );
}
