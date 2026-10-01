import { useEffect, useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, Button, SegBar, Chip, ChipRow, DateField, ToggleRow, Label, Loading, Muted,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import {
  safeIcon, frequencyLabel, FREQUENCIES, paymentMethodLabel, PAYMENT_METHOD_ICON, EXPENSE_METHODS,
} from "../constants/icons";
import { parseAmount, todayISO, longDate, money } from "../lib/format";
import { t } from "../lib/i18n";
import { notify, confirm, errorMessage } from "../lib/alert";
import {
  getCategories, getAccountBalances, getRecurringPayment, saveRecurringPayment, deleteRecurringPayment,
  markRecurringPaid, getRecurringPayments,
} from "../lib/queries";
import { reminderLabel, upcomingDueDates } from "../lib/recurring";
import {
  scheduleRecurringReminders, ensureNotificationPermission, sendTestNotification,
} from "../lib/notifications";
import type { Category, AccountBalance, Frequency, PaymentMethod, RecurringPayment } from "../lib/types";

const DAY_OPTIONS = [30, 15, 7, 5, 3, 2, 1, 0];
const HOURS = [7, 8, 9, 12, 15, 18, 20];

export default function RecurringForm() {
  useSettings();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<AccountBalance[]>([]);
  const [current, setCurrent] = useState<RecurringPayment | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [status, setStatus] = useState<RecurringPayment["status"]>("active");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [notes, setNotes] = useState("");
  const [remOn, setRemOn] = useState(true);
  const [days, setDays] = useState<number[]>([7, 3, 1, 0]);
  const [hour, setHour] = useState(9);
  const [customDay, setCustomDay] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([getCategories(), getAccountBalances()]);
        setCats(c.filter((x) => x.kind === "expense" && !x.is_ant)); setAccts(a);
        if (id) {
          const p = await getRecurringPayment(id);
          if (p) {
            setCurrent(p); setName(p.name); setAmount(String(p.amount)); setDueDate(p.due_date);
            setFrequency(p.frequency); setStatus(p.status); setCategoryId(p.category_id); setAccountId(p.account_id);
            setMethod(p.payment_method); setNotes(p.notes ?? ""); setRemOn(p.reminders_enabled);
            setDays(p.reminder_days); setHour(p.reminder_hour);
          }
        } else if (a[0]) setAccountId(a[0].account_id);
      } catch (e) { notify(errorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, [id]);

  function toggleDay(d: number) {
    setDays((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => b - a));
  }
  function addCustomDay() {
    const d = Math.round(Number(customDay));
    if (!isFinite(d) || d < 0 || d > 90) return notify(t("Escribe un número de días entre 0 y 90"));
    if (!days.includes(d)) setDays((x) => [...x, d].sort((a, b) => b - a));
    setCustomDay("");
  }

  async function save() {
    const value = parseAmount(amount);
    if (!name.trim()) return notify(t("Escribe un nombre"));
    if (!value) return notify(t("Escribe un valor válido"));
    if (remOn && days.length === 0) return notify(t("Elige al menos un recordatorio"));
    setBusy(true);
    try {
      if (remOn) await ensureNotificationPermission();
      await saveRecurringPayment({
        id, name: name.trim(), amount: value, due_date: dueDate, frequency, status,
        category_id: categoryId, account_id: accountId, payment_method: method, notes: notes.trim() || null,
        reminders_enabled: remOn, reminder_days: days, reminder_hour: hour,
      });
      await scheduleRecurringReminders(await getRecurringPayments());
      router.back();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!id || !(await confirm(t("¿Eliminar este pago recurrente? Los gastos ya registrados se conservan."), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteRecurringPayment(id); await scheduleRecurringReminders(await getRecurringPayments()); router.back(); }
    catch (e) { notify(errorMessage(e)); }
  }

  async function payNow() {
    if (!current) return;
    try { await markRecurringPaid(current); await scheduleRecurringReminders(await getRecurringPayments()); router.back(); }
    catch (e) { notify(errorMessage(e)); }
  }

  const next = upcomingDueDates({ due_date: dueDate, frequency }, 3);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen header={<ScreenHeader title={id ? t("Editar pago") : t("Nuevo pago recurrente")}
        right={id ? <Pressable onPress={remove} hitSlop={8}><Ionicons name="trash-outline" size={22} color={theme.expense} /></Pressable> : undefined} />}>
        {loading ? <Loading /> : (
          <>
            <Card style={{ gap: 14 }}>
              <Field label={t("Nombre")} icon="pricetag-outline" value={name} onChangeText={setName} placeholder={t("Ej: Arriendo, Netflix, Seguro del carro")} />
              <Field label={t("Valor")} icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
              <DateField label={t("Próximo vencimiento")} value={dueDate} onChange={(d) => d && setDueDate(d)} />
            </Card>

            <Card style={{ gap: 10 }}>
              <Label>{t("Frecuencia")}</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {FREQUENCIES.map((f) => <Chip key={f} label={frequencyLabel(f)} active={frequency === f} onPress={() => setFrequency(f)} />)}
              </View>
              {next.length > 0 && (
                <Muted>{t("Próximas fechas: {dates}", { dates: next.map((d) => longDate(d)).join(" · ") })}</Muted>
              )}
              <Label>{t("Estado")}</Label>
              <SegBar value={status} onChange={setStatus} options={[
                { key: "active", label: t("Activo") }, { key: "paused", label: t("Pausado") }, { key: "finished", label: t("Finalizado") },
              ]} />
            </Card>

            <Card style={{ gap: 10 }}>
              <Label>{t("Categoría")}</Label>
              <ChipRow>
                {cats.map((c) => <Chip key={c.id} label={c.name} icon={safeIcon(c.icon)} color={c.color ?? theme.primary}
                  active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />)}
              </ChipRow>
              <Label>{t("Cuenta de pago")}</Label>
              <ChipRow>
                {accts.map((a) => <Chip key={a.account_id} label={a.name} icon="wallet-outline"
                  active={accountId === a.account_id} onPress={() => setAccountId(a.account_id)} />)}
              </ChipRow>
              <Label>{t("Forma de pago")}</Label>
              <ChipRow>
                {EXPENSE_METHODS.map((m) => <Chip key={m} label={paymentMethodLabel(m)} icon={PAYMENT_METHOD_ICON[m]}
                  active={method === m} onPress={() => setMethod(method === m ? null : m)} />)}
              </ChipRow>
              <Field label={t("Observaciones")} icon="chatbox-ellipses-outline" value={notes} onChangeText={setNotes} placeholder={t("Opcional")} multiline />
            </Card>

            <Card style={{ gap: 10 }}>
              <ToggleRow icon="notifications-outline" label={t("Recordatorios")} sub={t("Notificación en este dispositivo antes de cada vencimiento")}
                value={remOn} onChange={setRemOn} />
              {remOn && (
                <>
                  <Label>{t("¿Cuándo avisarte?")}</Label>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[...new Set([...DAY_OPTIONS, ...days])].sort((a, b) => b - a).map((d) => (
                      <Chip key={d} label={reminderLabel(d)} active={days.includes(d)} onPress={() => toggleDay(d)} />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                      <Field label={t("Personalizado (días antes)")} value={customDay} onChangeText={setCustomDay} keyboardType="number-pad" placeholder="10" />
                    </View>
                    <Button label={t("Agregar")} tone="soft" compact onPress={addCustomDay} />
                  </View>
                  <Label>{t("Hora del aviso")}</Label>
                  <ChipRow>
                    {HOURS.map((h) => <Chip key={h} label={`${String(h).padStart(2, "0")}:00`} active={hour === h} onPress={() => setHour(h)} />)}
                  </ChipRow>
                  {Platform.OS !== "web" && (
                    <Button label={t("Probar notificación")} icon="notifications-circle-outline" tone="ghost" compact
                      onPress={() => sendTestNotification().then(() => notify(t("Recibirás una notificación de prueba en 5 segundos."))).catch((e) => notify(errorMessage(e)))} />
                  )}
                </>
              )}
            </Card>

            <Button label={id ? t("Guardar cambios") : t("Guardar pago")} icon="checkmark" onPress={save} loading={busy} />
            {current?.status === "active" && (
              <Button label={t("Marcar pagado ({amount})", { amount: money(current.amount, current.currency) })} icon="checkmark-done-outline" tone="soft" onPress={payNow} />
            )}
            {current?.last_paid_at && <Muted style={{ textAlign: "center" }}>{t("Último pago: {date}", { date: longDate(current.last_paid_at) })}</Muted>}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
