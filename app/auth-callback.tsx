import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Screen, Card, Button, IconCircle, Muted } from "../components/UI";
import { useAuth } from "../components/auth";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";

// Destino de los enlaces de confirmación de Supabase (registro y cambio de correo).
// Supabase ya confirmó la cuenta en su servidor antes de redirigir aquí: esta página solo
// informa el resultado. No inicia sesión con los tokens del enlace (evita fijación de sesión).

type Result = "ok" | "error" | "loading";

function readParams(url: string | null) {
  const href = Platform.OS === "web" ? window.location.href : url ?? "";
  const [, hash = ""] = href.split("#");
  const query = href.split("?")[1]?.split("#")[0] ?? "";
  return new URLSearchParams(`${query}&${hash}`);
}

export default function AuthCallback() {
  useSettings();
  const { session } = useAuth();
  const url = Linking.useURL();
  const [result, setResult] = useState<Result>("loading");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState<string | null>(null);

  useEffect(() => {
    const p = readParams(url);
    const err = p.get("error_description") ?? p.get("error");
    setKind(p.get("type"));
    if (err) { setDetail(err.replace(/\+/g, " ")); setResult("error"); }
    else setResult("ok");
    // Quita los tokens de la barra de direcciones en web
    if (Platform.OS === "web" && window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, [url]);

  const expired = /expired|invalid/i.test(detail);
  const emailChange = kind === "email_change";

  return (
    <Screen>
      <View style={{ flex: 1, minHeight: 520, justifyContent: "center", gap: 18 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <LinearGradient colors={theme.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 30 }}>💸</Text>
          </LinearGradient>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: "900" }}>FinZen</Text>
        </View>

        {result !== "loading" && (
          <Card style={{ alignItems: "center", gap: 12 }}>
            <IconCircle name={result === "ok" ? "checkmark-circle" : "alert-circle"} size={64}
              color={result === "ok" ? theme.income : theme.expense} />
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 20, textAlign: "center" }}>
              {result === "ok"
                ? (emailChange ? t("Correo actualizado") : t("¡Cuenta confirmada!"))
                : expired ? t("El enlace venció o ya fue usado") : t("No pudimos confirmar tu cuenta")}
            </Text>
            <Muted style={{ textAlign: "center" }}>
              {result === "ok"
                ? t("Ya puedes ingresar a FinZen desde la app o desde esta página con tu correo y contraseña.")
                : expired
                  ? t("Si ya confirmaste antes, simplemente ingresa. Si no, regístrate de nuevo para recibir otro enlace.")
                  : detail}
            </Muted>
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 4 }}>
              <Button label={session ? t("Ir al inicio") : t("Ingresar")} icon="arrow-forward"
                onPress={() => router.replace(session ? "/(tabs)" : "/(auth)/login")} />
            </View>
          </Card>
        )}
      </View>
    </Screen>
  );
}
