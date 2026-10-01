import "../lib/logbox";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../components/auth";
import { SettingsProvider, useSettings } from "../components/settings";
import { InactivityGuard } from "../components/InactivityGuard";
import { theme } from "../constants/theme";
import { supabase } from "../lib/supabase";
import { Notifications, notificationsSupported } from "../lib/notifications";
import { consumeRecoveryRequest } from "../lib/recovery";
import { cleanupExports } from "../lib/export";
import { notify } from "../lib/alert";
import { t } from "../lib/i18n";

/** Lee los tokens del enlace de recuperación (#access_token=… o ?code=…). */
function useRecoveryLink() {
  const url = Linking.useURL();
  const { startRecovery } = useAuth();
  useEffect(() => {
    if (!url) return;
    const [, hash = ""] = url.split("#");
    const params = new URLSearchParams(hash || url.split("?")[1] || "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const code = params.get("code");
    const isRecovery = params.get("type") === "recovery" || url.includes("reset-password");
    if (!isRecovery || !((access_token && refresh_token) || code)) return;
    (async () => {
      if (!(await consumeRecoveryRequest())) {
        notify(t("Este enlace no fue solicitado desde este dispositivo. Pide la recuperación desde la app."));
        return;
      }
      if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
      else await supabase.auth.exchangeCodeForSession(code!);
      startRecovery();
    })().catch((e) => console.warn("recovery link", e));
  }, [url]);
}

/** Al tocar una notificación se abre la pantalla relacionada. */
function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    if (!notificationsSupported) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as { kind?: string; id?: string };
      if (data?.kind === "recurring" && data.id) router.push({ pathname: "/recurring-form", params: { id: data.id } });
      else if (data?.kind === "report") router.push("/reports");
      else if (data?.kind === "debt") router.push("/(tabs)/debts");
    });
    return () => sub.remove();
  }, []);
}

function Gate() {
  const { session, loading, recovering } = useAuth();
  // Borra informes y respaldos exportados que hayan quedado en caché
  useEffect(() => { cleanupExports(); }, [session?.user.id]);
  useSettings(); // re-render al cambiar tema / idioma
  const segments = useSegments();
  const router = useRouter();
  useRecoveryLink();
  useNotificationRouting();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === "(auth)";
    const inReset = first === "reset-password";
    const inCallback = first === "auth-callback";
    if (recovering && !inReset) router.replace("/reset-password");
    else if (!session && !inAuth && !inReset && !inCallback) router.replace("/(auth)/login");
    else if (session && inAuth) router.replace("/(tabs)");
  }, [session, loading, segments, recovering]);

  return (
    <>
      <StatusBar style={theme.mode === "light" ? "dark" : "light"} />
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
        animation: Platform.OS === "android" ? "fade_from_bottom" : "default",
      }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transaction-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="recurring-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="goal-form" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <InactivityGuard>
            <Gate />
          </InactivityGuard>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
