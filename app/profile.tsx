import { useEffect, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, PasswordField, Button, Avatar, SectionHeader, PromptModal, Muted,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { useAuth } from "../components/auth";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";
import { notify, confirm, errorMessage } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { uploadAvatar, deleteAllUserFiles } from "../lib/attachments";
import { updateBiometricPassword, disableBiometric } from "../lib/biometric";
import { cancelAllReminders } from "../lib/notifications";
import { dateTime } from "../lib/format";
import { appLink } from "../lib/links";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Profile() {
  const { profile, avatarUri, update } = useSettings();
  const { session } = useAuth();
  const email = session?.user.email ?? "";
  const [name, setName] = useState(profile?.display_name ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => { setName(profile?.display_name ?? ""); }, [profile?.display_name]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { notify(errorMessage(e)); } finally { setBusy(null); }
  }

  const changePhoto = () => run("photo", async () => {
    const path = await uploadAvatar(profile?.avatar_url ?? null);
    if (path) await update({ avatar_url: path });
  });

  const removePhoto = () => run("photo", async () => {
    if (profile?.avatar_url) await supabase.storage.from("avatars").remove([profile.avatar_url]);
    await update({ avatar_url: null });
  });

  const saveName = () => run("name", async () => {
    if (!name.trim()) throw new Error(t("Escribe tu nombre"));
    await update({ display_name: name.trim() });
    await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    notify(t("Nombre actualizado"));
  });

  const changeEmail = () => run("email", async () => {
    const mail = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) throw new Error(t("Escribe un correo válido"));
    if (mail === email) throw new Error(t("Es el mismo correo actual"));
    const { error } = await supabase.auth.updateUser({ email: mail }, { emailRedirectTo: appLink("auth-callback") });
    if (error) throw error;
    setNewEmail("");
    notify(t("Te enviamos un enlace de confirmación a {email}. El cambio se aplica cuando lo abras.", { email: mail }));
  });

  const changePassword = () => run("pass", async () => {
    if (!current) throw new Error(t("Escribe tu contraseña actual"));
    if (pass.length < 8) throw new Error(t("La contraseña debe tener al menos 8 caracteres"));
    if (pass !== pass2) throw new Error(t("Las contraseñas no coinciden"));
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new Error(t("La contraseña actual no es correcta"));
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) throw error;
    await updateBiometricPassword(email, pass);
    setCurrent(""); setPass(""); setPass2("");
    notify(t("Contraseña actualizada"));
  });

  async function deleteAccount(word: string) {
    if (word.trim().toUpperCase() !== t("ELIMINAR")) return notify(t("Escribe ELIMINAR para confirmar"));
    setDeleteOpen(false);
    await run("delete", async () => {
      await deleteAllUserFiles();
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await disableBiometric();
      await cancelAllReminders();
      await supabase.auth.signOut({ scope: "local" });
      notify(t("Tu cuenta y todos tus datos fueron eliminados."));
    });
  }

  return (
    <Screen header={<ScreenHeader title={t("Perfil")} />}>
      <Card style={{ alignItems: "center", gap: 10 }}>
        <Pressable onPress={changePhoto}>
          <Avatar label={profile?.display_name || email || "?"} uri={avatarUri} size={96} />
          <View style={{ position: "absolute", right: 0, bottom: 0, backgroundColor: theme.primary, borderRadius: 16, padding: 7 }}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}>{profile?.display_name}</Text>
        <Text style={{ color: theme.muted }}>{email}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label={t("Cambiar foto")} icon="image-outline" tone="soft" compact loading={busy === "photo"} onPress={changePhoto} />
          {profile?.avatar_url && <Button label={t("Quitar")} tone="ghost" compact onPress={removePhoto} />}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title={t("Nombre")} icon="person-outline" />
        <Field value={name} onChangeText={setName} placeholder={t("Tu nombre")} />
        <Button label={t("Guardar nombre")} tone="soft" loading={busy === "name"} onPress={saveName} />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title={t("Correo electrónico")} icon="mail-outline" />
        <Muted>{t("Actual: {email}", { email })}</Muted>
        <Field value={newEmail} onChangeText={setNewEmail} placeholder={t("Nuevo correo")} autoCapitalize="none" keyboardType="email-address" />
        <Button label={t("Cambiar correo")} tone="soft" loading={busy === "email"} onPress={changeEmail} />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title={t("Cambiar contraseña")} icon="lock-closed-outline" />
        <PasswordField label={t("Contraseña actual")} value={current} onChangeText={setCurrent} />
        <PasswordField label={t("Nueva contraseña")} value={pass} onChangeText={setPass} placeholder={t("Mínimo 8 caracteres")} />
        <PasswordField label={t("Confirmar contraseña")} value={pass2} onChangeText={setPass2} />
        <Button label={t("Actualizar contraseña")} tone="soft" loading={busy === "pass"} onPress={changePassword} />
      </Card>

      <Card style={{ gap: 10, borderColor: theme.expense }}>
        <SectionHeader title={t("Zona de peligro")} icon="warning-outline" />
        <Muted>{t("Eliminar tu cuenta borra de forma permanente todos tus movimientos, facturas, metas, respaldos y tu perfil. Esta acción no se puede deshacer.")}</Muted>
        {session?.user.created_at && <Muted>{t("Cuenta creada: {date}", { date: dateTime(session.user.created_at) })}</Muted>}
        <Button label={t("Eliminar mi cuenta")} icon="trash-outline" tone="danger" loading={busy === "delete"}
          onPress={async () => { if (await confirm(t("¿Seguro que quieres eliminar tu cuenta y todos tus datos?"), { destructive: true, okLabel: t("Continuar") })) setDeleteOpen(true); }} />
      </Card>

      <PromptModal visible={deleteOpen} title={t("Confirmar eliminación")}
        message={t("Escribe ELIMINAR para borrar tu cuenta definitivamente.")} placeholder={t("ELIMINAR")}
        confirmLabel={t("Eliminar")} onCancel={() => setDeleteOpen(false)} onSubmit={deleteAccount} />
    </Screen>
  );
}
