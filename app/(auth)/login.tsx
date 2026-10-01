import { useEffect, useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Card, Field, PasswordField, Button, SegBar, FadeIn, withAlpha } from "../../components/UI";
import { useSettings } from "../../components/settings";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { theme } from "../../constants/theme";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { appLink } from "../../lib/links";
import {
  biometricInfo, isBiometricEnabled, enableBiometric, signInWithBiometrics, biometricEmail, type BiometricInfo,
} from "../../lib/biometric";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  useSettings();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState<BiometricInfo | null>(null);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const info = await biometricInfo();
      setBio(info);
      const enabled = info.enrolled && (await isBiometricEnabled());
      setBioEnabled(enabled);
      const saved = await biometricEmail();
      if (saved) setEmail(saved);
      if (enabled) loginBio(); // ofrece la huella apenas se abre
    })().catch(() => {});
  }, []);

  async function loginBio() {
    setBioBusy(true);
    try { await signInWithBiometrics(); }
    catch (e) { notify(errorMessage(e)); }
    finally { setBioBusy(false); }
  }

  async function submit() {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return notify(t("Escribe un correo válido"));
    if (!password) return notify(t("Escribe tu contraseña"));
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        await offerBiometric(mail, password);
      } else {
        if (!name.trim()) throw new Error(t("Escribe tu nombre"));
        if (password.length < 8) throw new Error(t("La contraseña debe tener al menos 8 caracteres"));
        if (password !== password2) throw new Error(t("Las contraseñas no coinciden"));
        const { data, error } = await supabase.auth.signUp({
          email: mail, password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: appLink("auth-callback") },
        });
        if (error) throw /registered|exists/i.test(error.message) ? new Error(t("Ya existe una cuenta con ese correo")) : error;
        // Con confirmación de correo activa, Supabase no revela si el correo existe: identities vacío = ya registrado
        if (data.user && data.user.identities?.length === 0) throw new Error(t("Ya existe una cuenta con ese correo"));
        if (!data.session) notify(t("Cuenta creada. Revisa tu correo para confirmarla y luego ingresa."));
        else await offerBiometric(mail, password);
        setMode("login");
      }
    } catch (e) {
      const msg = errorMessage(e);
      notify(/invalid login/i.test(msg) ? t("Correo o contraseña incorrectos") : msg);
    } finally {
      setBusy(false);
    }
  }

  async function offerBiometric(mail: string, pass: string) {
    if (!bio?.enrolled || bioEnabled) return;
    const yes = await confirm(t("¿Quieres ingresar la próxima vez con tu {method}?", { method: bio.label }), { okLabel: t("Activar") });
    if (yes) await enableBiometric(mail, pass).catch((e) => notify(errorMessage(e)));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <LinearGradient colors={theme.gradients.loginTop} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 40, gap: 18, flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled">
          <FadeIn style={{ alignItems: "center", marginBottom: 8, gap: 10 }}>
            <LinearGradient colors={theme.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 32 }}>💸</Text>
            </LinearGradient>
            <Text style={{ color: theme.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 }}>FinZen</Text>
            <Text style={{ color: theme.muted, fontSize: 14 }}>{t("Tus finanzas, en un solo lugar")}</Text>
          </FadeIn>

          {!isSupabaseConfigured && (
            <Card style={{ borderColor: theme.warn, backgroundColor: withAlpha(theme.warn, 0.1), gap: 4 }}>
              <Text style={{ color: theme.warn, fontWeight: "800" }}>{t("Falta configurar Supabase")}</Text>
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {t("Crea el archivo .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY y reinicia la app.")}
              </Text>
            </Card>
          )}

          <FadeIn delay={100}>
            <Card style={{ gap: 14 }}>
              <SegBar value={mode} onChange={setMode}
                options={[{ key: "login", label: t("Ingresar") }, { key: "register", label: t("Crear cuenta") }]} />
              {mode === "register" && (
                <Field label={t("Nombre")} icon="person-outline" value={name} onChangeText={setName} placeholder={t("Tu nombre")} />
              )}
              <Field label={t("Correo")} icon="mail-outline" value={email} onChangeText={setEmail}
                autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="tucorreo@mail.com" />
              <PasswordField label={t("Contraseña")} value={password} onChangeText={setPassword} placeholder="••••••••" />
              {mode === "register" && (
                <PasswordField label={t("Confirmar contraseña")} value={password2} onChangeText={setPassword2} placeholder="••••••••" />
              )}
              <Button label={mode === "login" ? t("Ingresar") : t("Registrarme")} icon="arrow-forward" onPress={submit} loading={busy} />

              {mode === "login" && bioEnabled && bio && (
                <Pressable onPress={loginBio} disabled={bioBusy}
                  style={({ pressed }) => [{
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 12,
                    borderRadius: theme.radiusSm, borderWidth: 1, borderColor: theme.border, opacity: pressed || bioBusy ? 0.6 : 1,
                  }]}>
                  <Ionicons name={bio.label === "Face ID" ? "scan-outline" : "finger-print"} size={22} color={theme.primary} />
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{t("Ingresar con {method}", { method: bio.label })}</Text>
                </Pressable>
              )}

              {mode === "login" && (
                <Pressable onPress={() => router.push("/(auth)/forgot-password")} hitSlop={8} style={{ alignSelf: "center" }}>
                  <Text style={{ color: theme.primary, fontWeight: "700" }}>{t("¿Olvidaste tu contraseña?")}</Text>
                </Pressable>
              )}
            </Card>
          </FadeIn>

          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <Ionicons name="lock-closed" size={12} color={theme.mutedDim} />
            <Text style={{ color: theme.mutedDim, textAlign: "center", fontSize: 12 }}>
              {t("Tus datos se sincronizan en la nube y solo tú puedes verlos.")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
