import { useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen, ScreenHeader, Card, Field, PasswordField, Button, IconCircle, Muted } from "../components/UI";
import { useAuth } from "../components/auth";
import { useSettings } from "../components/settings";
import { supabase } from "../lib/supabase";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";
import { notify, errorMessage } from "../lib/alert";
import { updateBiometricPassword } from "../lib/biometric";

// Llega aquí desde el enlace del correo (sesión temporal de recuperación) o escribiendo
// el código de 6 dígitos que también trae el correo.

export default function ResetPassword() {
  useSettings();
  const { session, endRecovery } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  async function verifyCode() {
    if (!email || code.trim().length < 6) return notify(t("Escribe tu correo y el código recibido"));
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "recovery" });
      if (error) throw error;
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (pass.length < 8) return notify(t("La contraseña debe tener al menos 8 caracteres"));
    if (pass !== pass2) return notify(t("Las contraseñas no coinciden"));
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      if (data.user?.email) await updateBiometricPassword(data.user.email, pass);
      endRecovery();
      notify(t("Tu contraseña se actualizó correctamente."));
      router.replace("/(tabs)");
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen header={<ScreenHeader title={t("Nueva contraseña")} onBack={() => { endRecovery(); router.replace(session ? "/(tabs)" : "/(auth)/login"); }} />}>
      <Card style={{ gap: 14 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <IconCircle name="shield-checkmark-outline" size={60} />
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}>
            {session ? t("Crea tu nueva contraseña") : t("Verifica tu identidad")}
          </Text>
          {!session && <Muted style={{ textAlign: "center" }}>{t("Abre el enlace del correo en este dispositivo o escribe el código que recibiste.")}</Muted>}
        </View>
        {session ? (
          <>
            <PasswordField label={t("Nueva contraseña")} value={pass} onChangeText={setPass} placeholder="••••••••" />
            <PasswordField label={t("Confirmar contraseña")} value={pass2} onChangeText={setPass2} placeholder="••••••••" />
            <Button label={t("Guardar contraseña")} icon="checkmark" onPress={save} loading={busy} />
          </>
        ) : (
          <>
            <Field label={t("Correo")} icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field label={t("Código")} icon="keypad-outline" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} placeholder="123456" />
            <Button label={t("Verificar código")} icon="arrow-forward" onPress={verifyCode} loading={busy} />
          </>
        )}
      </Card>
    </Screen>
  );
}
