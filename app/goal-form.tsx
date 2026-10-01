import { useEffect, useState } from "react";
import { View, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ScreenHeader, Card, Field, Button, DateField, Label, IconCircle, Loading, Muted, SegBar } from "../components/UI";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import { GOAL_ICONS, PALETTE, type IconName } from "../constants/icons";
import { parseAmount, money, addMonths, toISODate } from "../lib/format";
import { t } from "../lib/i18n";
import { notify, errorMessage } from "../lib/alert";
import { getGoal, saveGoal, addContribution } from "../lib/queries";
import type { SavingsGoal } from "../lib/types";

export default function GoalForm() {
  useSettings();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(!!id);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [initial, setInitial] = useState("");
  const [date, setDate] = useState<string | null>(toISODate(addMonths(new Date(), 12)));
  const [icon, setIcon] = useState<IconName>(GOAL_ICONS[0]);
  const [color, setColor] = useState(PALETTE[1]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<SavingsGoal["status"]>("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getGoal(id).then((g) => {
      if (!g) return;
      setName(g.name); setTarget(String(g.target_amount)); setDate(g.target_date);
      setIcon((g.icon as IconName) ?? GOAL_ICONS[0]); setColor(g.color ?? PALETTE[1]); setNotes(g.notes ?? ""); setStatus(g.status);
    }).catch((e) => notify(errorMessage(e))).finally(() => setLoading(false));
  }, [id]);

  async function save() {
    const value = parseAmount(target);
    if (!name.trim()) return notify(t("Escribe un nombre"));
    if (!value) return notify(t("Escribe el valor objetivo"));
    setBusy(true);
    try {
      const goalId = await saveGoal({ id, name: name.trim(), target_amount: value, target_date: date, icon, color, notes: notes.trim() || null, status });
      const first = parseAmount(initial);
      if (!id && first > 0) await addContribution({ goal_id: goalId, amount: first, note: t("Aporte inicial") });
      router.back();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const value = parseAmount(target);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen header={<ScreenHeader title={id ? t("Editar meta") : t("Nueva meta de ahorro")} />}>
        {loading ? <Loading /> : (
          <>
            <Card style={{ alignItems: "center" }}><IconCircle name={icon} color={color} size={70} /></Card>
            <Card style={{ gap: 14 }}>
              <Field label={t("Nombre")} icon="flag-outline" value={name} onChangeText={setName} placeholder={t("Ej: Fondo de emergencia")} />
              <Field label={t("Valor objetivo")} icon="cash-outline" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" />
              {value > 0 && <Muted style={{ marginTop: -8 }}>{money(value)}</Muted>}
              <DateField label={t("Fecha objetivo")} value={date} onChange={setDate} clearable placeholder={t("Sin fecha límite")} />
              {!id && <Field label={t("Ya tengo ahorrado (opcional)")} icon="wallet-outline" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" />}
              <Field label={t("Notas")} icon="create-outline" value={notes} onChangeText={setNotes} placeholder={t("Opcional")} multiline />
            </Card>
            <Card style={{ gap: 10 }}>
              <Label>{t("Ícono")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {GOAL_ICONS.map((i) => (
                  <Pressable key={i} onPress={() => setIcon(i)} style={{ borderRadius: 24, borderWidth: 2, borderColor: icon === i ? color : "transparent" }}>
                    <IconCircle name={i} color={icon === i ? color : theme.muted} size={42} />
                  </Pressable>
                ))}
              </View>
              <Label>{t("Color")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {PALETTE.map((c) => (
                  <Pressable key={c} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, alignItems: "center", justifyContent: "center" }}>
                    {color === c && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </Pressable>
                ))}
              </View>
              {id && (
                <>
                  <Label>{t("Estado")}</Label>
                  <SegBar value={status} onChange={setStatus} options={[
                    { key: "active", label: t("Activa") }, { key: "completed", label: t("Cumplida") }, { key: "archived", label: t("Archivada") },
                  ]} />
                </>
              )}
            </Card>
            <Button label={id ? t("Guardar cambios") : t("Crear meta")} icon="checkmark" onPress={save} loading={busy} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
