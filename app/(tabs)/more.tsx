import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Title, Card, ListRow, Avatar } from "../../components/UI";
import { useSettings } from "../../components/settings";
import { useAuth } from "../../components/auth";
import { theme } from "../../constants/theme";
import { t } from "../../lib/i18n";
import { confirm } from "../../lib/alert";
import { supabase } from "../../lib/supabase";
import { cancelAllReminders } from "../../lib/notifications";

export default function More() {
  const { profile, avatarUri } = useSettings();
  const { session } = useAuth();
  const name = profile?.display_name ?? session?.user.email?.split("@")[0] ?? "";

  async function logout() {
    if (!(await confirm(t("¿Cerrar sesión en este dispositivo?"), { okLabel: t("Cerrar sesión") }))) return;
    await cancelAllReminders().catch(() => {});
    await supabase.auth.signOut();
  }

  return (
    <Screen>
      <Title>{t("Más")}</Title>
      <Pressable onPress={() => router.push("/profile")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar label={name || "?"} uri={avatarUri} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 17 }}>{name}</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{session?.user.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.mutedDim} />
        </Card>
      </Pressable>

      <Card style={{ paddingVertical: 8 }}>
        <ListRow icon="cafe-outline" color={theme.ant} label={t("Gastos hormiga")} sub={t("Registro rápido y métricas")} onPress={() => router.push("/ant")} />
        <ListRow icon="document-text-outline" label={t("Informes y estadísticas")} sub={t("Informe mensual, gráficos, PDF y Excel")} onPress={() => router.push("/reports")} />
        <ListRow icon="receipt-outline" color={theme.transfer} label={t("Facturas")} sub={t("Fotos y PDF de tus gastos")} onPress={() => router.push("/invoices")} />
        <ListRow icon="pricetags-outline" color={theme.warn} label={t("Categorías")} onPress={() => router.push("/categories")} />
      </Card>

      <Card style={{ paddingVertical: 8 }}>
        <ListRow icon="wallet-outline" color={theme.transfer} label={t("Cuentas y bancos")} onPress={() => router.push("/(tabs)/accounts")} />
        <ListRow icon="people-outline" color={theme.expense} label={t("Deudas")} onPress={() => router.push("/(tabs)/debts")} />
        <ListRow icon="trending-up-outline" color={theme.invest} label={t("Inversiones")} onPress={() => router.push("/(tabs)/investments")} />
        <ListRow icon="sparkles-outline" label={t("Asistente IA")} onPress={() => router.push("/(tabs)/assistant")} />
      </Card>

      <Card style={{ paddingVertical: 8 }}>
        <ListRow icon="person-circle-outline" label={t("Perfil")} sub={t("Foto, correo, contraseña, eliminar cuenta")} onPress={() => router.push("/profile")} />
        <ListRow icon="settings-outline" label={t("Configuración")} sub={t("Biometría, tema, moneda, idioma, respaldos")} onPress={() => router.push("/settings")} />
        <ListRow icon="log-out-outline" label={t("Cerrar sesión")} danger onPress={logout} />
      </Card>
      <Text style={{ color: theme.mutedDim, fontSize: 11, textAlign: "center" }}>FinZen 2.0 · {t("versión")} {process.env.EXPO_PUBLIC_BUILD_ID ?? "local"}</Text>
    </Screen>
  );
}
