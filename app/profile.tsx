import { useEffect, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, PasswordField, Button, Avatar, SectionHeader, PromptModal, Muted, ActionSheet, ListRow,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { useAuth } from "../components/auth";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";
import { notify, confirm, errorMessage } from "../lib/alert";
import { supabase } from "../lib/supabase";
import { uploadAvatar, deleteAllUserFiles } from "../lib/attachments";
import { updateBiometricPassword, disableBiometric, biometricInfo, isBiometricEnabled } from "../lib/biometric";
import { router } from "expo-router";
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
  const [photoSheet, setPhotoSheet] = useState(false);
  const [bio, setBio] = useState<{ label: string; on: boolean } | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      const info = await biometricInfo();
      if (info.available) setBio({ label: info.label, on: await isBiometricEnabled() });
    })().catch(() => {});
  }, []);

  useEffect(() => { setName(profile?.display_name ?? ""); }, [profile?.display_name]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { notify(errorMessage(e)); } finally { setBusy(null); }
  }

  // En la web no hay cámara integrada: se abre directo el selector de archivos
  const changePhoto = () => Platform.OS === "web" ? setPhoto("library") : setPhotoSheet(true);

  const setPhoto = (source: "camera" | "library") => run("photo", async () => {
    const previous = profile?.avatar_url ?? null;
    const path = await uploadAvatar(source);
    if (!path) return;
    try { await update({ avatar_url: path }); }
    catch (e) { await supabase.storage.from("avatars").remove([path]); throw e; }
    // La foto anterior se borra solo cuando la nueva ya quedó guardada en el perfil
    if (previous) await supabase.storage.from("avatars").remove([previous]).catch(() => {});
    notify(t("Foto de perfil actualizada"));
  });

  const removePhoto = async () => {
    if (!(await confirm(t("¿Quitar tu foto de perfil?"), { destructive: true, okLabel: t("Quitar") }))) return;
    run("photo", async () => {
      const previous = profile?.avatar_url;
      await update({ avatar_url: null });
      if (previous) await supabase.storage.from("avatars").remove([previous]).catch(() => {});
    });
  };

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
          <Button label={profile?.avatar_url ? t("Cambiar foto") : t("Agregar foto")} icon="camera-outline" tone="soft" compact loading={busy === "photo"} onPress={changePhoto} />
          {profile?.avatar_url && <Button label={t("Quitar")} tone="ghost" compact onPress={removePhoto} />}
        </View>
      </Card>

      {bio && (
        <Card style={{ paddingVertical: 4 }}>
          <ListRow icon="finger-print" label={t("Ingreso con {method}", { method: bio.label })}
            sub={bio.on ? t("Activado · toca para administrarlo") : t("Desactivado · toca para activarlo")}
            onPress={() => router.push("/settings")} />
        </Card>
      )}

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
      <ActionSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title={t("Foto de perfil")} options={[
        { label: t("Tomar foto"), icon: "camera-outline", onPress: () => setPhoto("camera") },
        { label: t("Elegir de la galería"), icon: "image-outline", onPress: () => setPhoto("library") },
      ]} />
    </Screen>
  );
}
