import { useState } from "react";
import { View, Text, Platform } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Screen, ScreenHeader, Card, Field, Button, IconCircle, Muted } from "../../components/UI";
import { useSettings } from "../../components/settings";
import { supabase } from "../../lib/supabase";
import { theme } from "../../constants/theme";
import { t } from "../../lib/i18n";
import { notify, errorMessage } from "../../lib/alert";
import { markRecoveryRequested } from "../../lib/recovery";
import { appLink } from "../../lib/links";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  useSettings();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return notify(t("Escribe un correo válido"));
    setBusy(true);
    try {
      // El enlace lleva un token temporal de un solo uso (vence según la config. de Supabase, 1 h por defecto)
      const redirectTo = appLink("reset-password");
      const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo });
      if (error) throw error;
      await markRecoveryRequested();
      setSent(true);
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen header={<ScreenHeader title={t("Recuperar contraseña")} />}>
      <Card style={{ gap: 14 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <IconCircle name={sent ? "mail-open-outline" : "key-outline"} size={60} />
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18, textAlign: "center" }}>
            {sent ? t("Revisa tu correo") : t("¿Olvidaste tu contraseña?")}
          </Text>
          <Muted style={{ textAlign: "center" }}>
            {sent
              ? t("Si {email} tiene una cuenta, te enviamos un enlace seguro para crear una nueva contraseña. El enlace vence en 1 hora y solo se puede usar una vez.", { email: email.trim() })
              : t("Escribe el correo de tu cuenta y te enviaremos un enlace seguro con un token temporal.")}
          </Muted>
        </View>
        {!sent && (
          <Field label={t("Correo")} icon="mail-outline" value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" placeholder="tucorreo@mail.com" />
        )}
        {sent ? (
          <>
            <Button label={t("Ya tengo el código")} icon="keypad-outline" tone="soft"
              onPress={() => router.push({ pathname: "/reset-password", params: { email: email.trim().toLowerCase() } })} />
            <Button label={t("Volver al inicio de sesión")} tone="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <Button label={t("Enviar enlace")} icon="send-outline" onPress={send} loading={busy} />
        )}
      </Card>
    </Screen>
  );
}
