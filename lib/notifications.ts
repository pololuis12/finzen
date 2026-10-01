import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { t } from "./i18n";
import { addMonths, money, monthLabel, parseISODate, longDate } from "./format";
import { upcomingDueDates, reminderLabel } from "./recurring";
import { getRecurringPayments, getDebts } from "./queries";
import type { RecurringPayment } from "./types";

// Recordatorios locales: se programan en el propio dispositivo (funcionan sin internet
// y en Expo Go). Se reprograman cada vez que cambian los pagos.

const CHANNEL = "reminders";
const MAX_SCHEDULED = 200;
const supported = Platform.OS !== "web";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: t("Recordatorios de pagos"),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7c6bff",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export async function notificationPermissionGranted() {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

async function cancelKind(kind: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all
    .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === kind)
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

function at(dateISO: string, hour: number, daysBefore: number) {
  const d = parseISODate(dateISO);
  d.setDate(d.getDate() - daysBefore);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function scheduleAt(date: Date, title: string, body: string, data: Record<string, string>) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
  });
}

/** Programa los recordatorios (p. ej. 7, 3, 1 días antes y el mismo día) de las próximas 3 fechas de cada pago. */
export async function scheduleRecurringReminders(payments: RecurringPayment[]) {
  if (!supported || !(await notificationPermissionGranted())) return 0;
  await cancelKind("recurring");
  const now = Date.now();
  let count = 0;
  for (const p of payments) {
    if (p.status !== "active" || !p.reminders_enabled) continue;
    for (const due of upcomingDueDates(p, 3)) {
      for (const days of [...new Set(p.reminder_days)].sort((a, b) => b - a)) {
        const when = at(due, p.reminder_hour, days);
        if (when.getTime() <= now) continue;
        // Android limita a 500 alarmas por app: dejamos margen y no saturamos el sistema
        if (count >= MAX_SCHEDULED) return count;
        const title = days === 0 ? t("Hoy vence: {name}", { name: p.name }) : t("Próximo pago: {name}", { name: p.name });
        const body = t("{amount} · vence el {date} ({when})", {
          amount: money(Number(p.amount), p.currency), date: longDate(due), when: reminderLabel(days).toLowerCase(),
        });
        await scheduleAt(when, title, body, { kind: "recurring", id: p.id });
        count++;
      }
    }
  }
  return count;
}

/** Recordatorios de deudas que yo debo y tienen fecha límite. */
async function scheduleDebtReminders() {
  await cancelKind("debt");
  const debts = await getDebts();
  const now = Date.now();
  for (const d of debts) {
    if (d.status !== "open" || d.direction !== "i_owe_them" || !d.due_date) continue;
    for (const days of [3, 0]) {
      const when = at(d.due_date, 9, days);
      if (when.getTime() <= now) continue;
      await scheduleAt(when, t("Deuda por pagar: {name}", { name: d.counterparty }),
        t("{amount} · vence el {date}", { amount: money(d.principal, d.currency), date: longDate(d.due_date) }),
        { kind: "debt", id: d.id });
    }
  }
}

/** Aviso el día 1 de cada mes: "tu informe de X está listo". */
export async function scheduleMonthlyReportReminder(enabled: boolean) {
  if (!supported) return;
  await cancelKind("report");
  if (!enabled || !(await notificationPermissionGranted())) return;
  const next = addMonths(new Date(), 1);
  next.setHours(9, 0, 0, 0);
  const reported = addMonths(next, -1);
  await scheduleAt(next, t("Tu informe mensual está listo"),
    t("Revisa cómo te fue en {month}: ingresos, gastos, ahorro y gastos hormiga.", { month: monthLabel(reported) }),
    { kind: "report", month: reported.toISOString() });
}

/** Reprograma todo a partir de los datos en la nube. */
export async function syncReminders(reportEnabled = true) {
  if (!supported || !(await notificationPermissionGranted())) return;
  try {
    await scheduleRecurringReminders(await getRecurringPayments());
    await scheduleDebtReminders();
    await scheduleMonthlyReportReminder(reportEnabled);
  } catch (e) { console.warn("syncReminders", e); }
}

export async function sendTestNotification() {
  if (!(await ensureNotificationPermission())) throw new Error(t("Las notificaciones están desactivadas"));
  await scheduleAt(new Date(Date.now() + 5000), t("Recordatorio de prueba"),
    t("Así te avisaremos antes de cada vencimiento."), { kind: "test" });
}

export async function cancelAllReminders() {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync();
}

export { Notifications, supported as notificationsSupported };
