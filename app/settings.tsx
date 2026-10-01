import { useCallback, useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Screen, ScreenHeader, Card, SectionHeader, ToggleRow, SegBar, Chip, Button, Label, Muted, PromptModal, ListRow,
  ActionSheet, Loading, type SheetOption,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { useAuth } from "../components/auth";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";
import { CURRENCIES, dateTime, formatBytes } from "../lib/format";
import { notify, confirm, errorMessage } from "../lib/alert";
import { supabase } from "../lib/supabase";
import {
  biometricInfo, isBiometricEnabled, enableBiometric, disableBiometric, type BiometricInfo,
} from "../lib/biometric";
import {
  ensureNotificationPermission, notificationPermissionGranted, sendTestNotification, syncReminders,
  scheduleMonthlyReportReminder, notificationsSupported,
} from "../lib/notifications";
import { runBackup, listBackups, downloadBackup, deleteBackup, type BackupFile } from "../lib/backup";
import { exportAllData, shareFile, saveToDevice, emailFile, type ExportedFile } from "../lib/export";
import type { ThemePref, BackupFrequency } from "../lib/types";

const LOGOUT_OPTIONS = [0, 1, 5, 15, 30, 60];

export default function Settings() {
  const { profile, update, reload } = useSettings();
  const { session } = useAuth();
  const [bio, setBio] = useState<BiometricInfo | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [askPass, setAskPass] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportSheet, setExportSheet] = useState<ExportedFile | null>(null);

  const refresh = useCallback(async () => {
    const info = await biometricInfo();
    setBio(info);
    setBioOn(await isBiometricEnabled());
    setNotifOn(await notificationPermissionGranted());
    listBackups().then(setBackups).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { notify(errorMessage(e)); } finally { setBusy(null); }
  }

  const set = (patch: Parameters<typeof update>[0]) => run("pref", () => update(patch));

  async function toggleBio(v: boolean) {
    if (!v) { await disableBiometric(); setBioOn(false); return; }
    setAskPass(true);
  }

  async function confirmBio(password: string) {
    const email = session?.user.email ?? "";
    const check = await supabase.auth.signInWithPassword({ email, password });
    if (check.error) return notify(t("La contraseña no es correcta"));
    setAskPass(false);
    try { await enableBiometric(email, password); setBioOn(true); }
    catch (e) { notify(errorMessage(e)); }
  }

  async function toggleNotifications(v: boolean) {
    if (!v) return notify(t("Para desactivarlas por completo usa los ajustes del sistema. Puedes apagar recordatorios por pago."));
    const ok = await ensureNotificationPermission();
    setNotifOn(ok);
    if (ok) await syncReminders(profile?.report_notifications ?? true);
    else notify(t("Activa las notificaciones de FinZen en los ajustes del sistema."));
  }

  async function exportData(format: "xlsx" | "json") {
    await run("export", async () => {
      const f = await exportAllData(format);
      if (f) setExportSheet(f);
    });
  }

  if (!profile) return <Screen header={<ScreenHeader title={t("Configuración")} />}><Loading /></Screen>;

  const exportOptions: SheetOption[] = exportSheet ? [
    { label: t("Descargar en el dispositivo"), icon: "download-outline", onPress: () => saveToDevice(exportSheet).then((ok) => ok && notify(t("Archivo guardado: {name}", { name: exportSheet.name }))).catch((e) => notify(errorMessage(e))) },
    { label: t("Compartir (WhatsApp, Drive, OneDrive…)"), icon: "share-social-outline", onPress: () => shareFile(exportSheet).catch((e) => notify(errorMessage(e))) },
    { label: t("Enviar por correo"), icon: "mail-outline", onPress: () => emailFile(exportSheet, t("Mis datos de FinZen")).catch((e) => notify(errorMessage(e))) },
  ] : [];

  return (
    <Screen header={<ScreenHeader title={t("Configuración")} />}>
      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Seguridad")} icon="shield-checkmark-outline" />
        {Platform.OS === "web" ? <Muted>{t("La biometría está disponible en la app móvil.")}</Muted> : (
          <ToggleRow icon="finger-print" label={t("Ingreso con {method}", { method: bio?.label ?? t("biometría") })}
            sub={!bio?.available ? t("Este dispositivo no tiene sensor biométrico") : !bio.enrolled ? t("Registra una huella o rostro en los ajustes del teléfono") : t("Ingresa sin escribir tu contraseña")}
            value={bioOn} onChange={toggleBio} disabled={!bio?.enrolled} />
        )}
        <Label>{t("Cierre automático por inactividad")}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {LOGOUT_OPTIONS.map((m) => (
            <Chip key={m} label={m === 0 ? t("Nunca") : `${m} min`} active={profile.auto_logout_minutes === m}
              onPress={() => set({ auto_logout_minutes: m })} />
          ))}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Apariencia y región")} icon="color-palette-outline" />
        <Label>{t("Tema")}</Label>
        <SegBar value={profile.theme} onChange={(v: ThemePref) => set({ theme: v })} options={[
          { key: "dark", label: t("Oscuro"), icon: "moon-outline" }, { key: "light", label: t("Claro"), icon: "sunny-outline" },
          { key: "system", label: t("Sistema"), icon: "phone-portrait-outline" },
        ]} />
        <Label>{t("Idioma")}</Label>
        <SegBar value={profile.language} onChange={(v) => set({ language: v })} options={[
          { key: "es", label: "Español" }, { key: "en", label: "English" },
        ]} />
        <Label>{t("Moneda")}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CURRENCIES.map((c) => <Chip key={c} label={c} active={profile.currency === c} onPress={() => set({ currency: c })} />)}
        </View>
        <Muted>{t("La moneda se usa para mostrar valores y para los nuevos registros; no convierte montos existentes.")}</Muted>
      </Card>

      {notificationsSupported && (
        <Card style={{ gap: 10 }}>
          <SectionHeader title={t("Notificaciones")} icon="notifications-outline" />
          <ToggleRow icon="alarm-outline" label={t("Recordatorios de pagos")} sub={t("Se configuran en cada pago recurrente (7, 3, 1 día antes…)")}
            value={notifOn} onChange={toggleNotifications} />
          <ToggleRow icon="document-text-outline" label={t("Aviso de informe mensual")} sub={t("El día 1 de cada mes")}
            value={profile.report_notifications} disabled={!notifOn}
            onChange={(v) => run("pref", async () => { await update({ report_notifications: v }); await scheduleMonthlyReportReminder(v); })} />
          <Button label={t("Enviar notificación de prueba")} tone="ghost" compact icon="notifications-circle-outline"
            onPress={() => sendTestNotification().then(() => notify(t("Recibirás una notificación de prueba en 5 segundos."))).catch((e) => notify(errorMessage(e)))} />
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Respaldos")} icon="cloud-upload-outline" />
        <Muted>{t("Tus datos ya viven en la nube. Los respaldos guardan además una copia completa (JSON) que puedes descargar.")}</Muted>
        <ToggleRow icon="sync-outline" label={t("Respaldo automático")} value={profile.auto_backup} onChange={(v) => set({ auto_backup: v })} />
        {profile.auto_backup && (
          <SegBar value={profile.backup_frequency} onChange={(v: BackupFrequency) => set({ backup_frequency: v })} options={[
            { key: "daily", label: t("Diario") }, { key: "weekly", label: t("Semanal") }, { key: "monthly", label: t("Mensual") },
          ]} />
        )}
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          {t("Último respaldo: {date}", { date: profile.last_backup_at ? dateTime(profile.last_backup_at) : t("nunca") })}
        </Text>
        <Button label={t("Respaldar ahora")} icon="cloud-upload-outline" tone="soft" loading={busy === "backup"}
          onPress={() => run("backup", async () => { await runBackup(); await refresh(); await reload(); notify(t("Respaldo creado")); })} />
        {backups.map((b) => (
          <ListRow key={b.path} icon="document-outline" label={dateTime(b.created_at)} sub={formatBytes(b.size)}
            onPress={() => run("dl", async () => { const f = await downloadBackup(b); if (f) setExportSheet(f); })}
            right={<Text style={{ color: theme.expense, fontSize: 12, fontWeight: "700" }}
              onPress={async () => { if (await confirm(t("¿Eliminar este respaldo?"), { destructive: true })) { await deleteBackup(b); refresh(); } }}>
              {t("Eliminar")}</Text>} />
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <SectionHeader title={t("Exportar mi información")} icon="download-outline" />
        <Muted>{t("Todos tus movimientos, cuentas, metas, pagos, deudas e inversiones.")}</Muted>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button label="Excel" icon="grid-outline" tone="soft" loading={busy === "export"} onPress={() => exportData("xlsx")} /></View>
          <View style={{ flex: 1 }}><Button label="JSON" icon="code-slash-outline" tone="soft" loading={busy === "export"} onPress={() => exportData("json")} /></View>
        </View>
      </Card>

      <PromptModal visible={askPass} secure title={t("Confirma tu contraseña")}
        message={t("La guardaremos cifrada en este dispositivo para ingresar con {method}.", { method: bio?.label ?? "" })}
        onCancel={() => setAskPass(false)} onSubmit={confirmBio} />
      <ActionSheet visible={!!exportSheet} title={exportSheet?.name} options={exportOptions} onClose={() => setExportSheet(null)} />
    </Screen>
  );
}
