import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, Button, SegBar, Avatar, Badge, IconButton, EmptyState, FadeIn, DateField,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { money, parseAmount, longDate, relativeDays, daysUntil } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getDebts, createDebt, settleDebt } from "../../lib/queries";
import { syncReminders } from "../../lib/notifications";
import type { Debt, DebtDirection } from "../../lib/types";

export default function Debts() {
  const { profile } = useSettings();
  const [items, setItems] = useState<Debt[]>([]);
  const [show, setShow] = useState(false);
  const [dir, setDir] = useState<DebtDirection>("they_owe_me");
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getDebts()); } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = items.filter((d) => d.status === "open");
  const theyOwe = useMemo(() => open.filter((d) => d.direction === "they_owe_me").reduce((s, d) => s + d.principal, 0), [open]);
  const iOwe = useMemo(() => open.filter((d) => d.direction === "i_owe_them").reduce((s, d) => s + d.principal, 0), [open]);

  async function save() {
    const value = parseAmount(amount);
    if (!who.trim() || !value) return notify(t("Completa persona y valor"));
    setBusy(true);
    try {
      await createDebt({ counterparty: who.trim(), direction: dir, principal: value, description: desc.trim() || null, due_date: due });
      setWho(""); setAmount(""); setDesc(""); setDue(null); setShow(false);
      await load();
      syncReminders(profile?.report_notifications ?? true);
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function settle(d: Debt) {
    if (!(await confirm(t("¿Marcar como saldada la deuda con {name}?", { name: d.counterparty }), { okLabel: t("Saldar") }))) return;
    try { await settleDebt(d.id); await load(); syncReminders(profile?.report_notifications ?? true); }
    catch (e) { notify(errorMessage(e)); }
  }

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Deudas")}
      right={<IconButton name={show ? "close" : "add"} onPress={() => setShow((v) => !v)} bg={theme.primary} color="#fff" />} />}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-down-circle-outline" size={14} color={theme.income} />
            <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Me deben")}</Text>
          </View>
          <Text style={{ color: theme.income, fontSize: 20, fontWeight: "900" }} adjustsFontSizeToFit numberOfLines={1}>{money(theyOwe)}</Text>
        </Card>
        <Card style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-up-circle-outline" size={14} color={theme.expense} />
            <Text style={{ color: theme.muted, fontSize: 12 }}>{t("Yo debo")}</Text>
          </View>
          <Text style={{ color: theme.expense, fontSize: 20, fontWeight: "900" }} adjustsFontSizeToFit numberOfLines={1}>{money(iOwe)}</Text>
        </Card>
      </View>

      {show && (
        <FadeIn>
          <Card style={{ gap: 12 }}>
            <SegBar value={dir} onChange={setDir} options={[
              { key: "they_owe_me", label: t("Me deben") }, { key: "i_owe_them", label: t("Yo debo") },
            ]} />
            <Field label={t("Persona")} icon="person-outline" value={who} onChangeText={setWho} placeholder={t("Nombre")} />
            <Field label={t("Valor")} icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
            <DateField label={t("Fecha límite (opcional)")} value={due} onChange={setDue} clearable placeholder={t("Sin fecha")} />
            <Field label={t("Detalle")} icon="create-outline" value={desc} onChangeText={setDesc} placeholder={t("Opcional")} />
            <Button label={t("Registrar deuda")} icon="checkmark" onPress={save} loading={busy} />
          </Card>
        </FadeIn>
      )}

      {open.length === 0 && (
        <Card><EmptyState icon="people-outline" title={t("Sin deudas abiertas")} sub={t("Registra lo que te deben o lo que debes para no perderle el rastro.")} /></Card>
      )}

      {open.map((d, i) => {
        const color = d.direction === "they_owe_me" ? theme.income : theme.expense;
        const late = d.due_date && daysUntil(d.due_date) < 0;
        return (
          <FadeIn key={d.id} delay={i * 40}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar label={d.counterparty} color={color} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{d.counterparty}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {d.description || (d.direction === "they_owe_me" ? t("Te debe") : t("Le debes"))}
                  </Text>
                  {d.due_date && (
                    <Text style={{ color: late ? theme.expense : theme.muted, fontSize: 12 }}>
                      {longDate(d.due_date)} · {relativeDays(d.due_date)}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Badge label={money(d.principal, d.currency)} color={color} />
                  <Pressable onPress={() => settle(d)} hitSlop={6}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>{t("Marcar saldada")}</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          </FadeIn>
        );
      })}
    </Screen>
  );
}
