import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../constants/theme";
import { useSettings } from "../../components/settings";
import { withAlpha } from "../../components/UI";
import { t } from "../../lib/i18n";

type IconName = ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={{
      width: 40, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center",
      backgroundColor: focused ? withAlpha(theme.primary, 0.16) : "transparent",
    }}>
      <Ionicons name={name} size={21} color={focused ? theme.primary : theme.muted} />
    </View>
  );
}

const icon = (on: IconName, off: IconName) =>
  ({ focused }: { focused: boolean }) => <TabIcon name={focused ? on : off} focused={focused} />;

export default function TabsLayout() {
  useSettings(); // re-render con tema / idioma
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.borderSoft, borderTopWidth: 1 },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("Inicio"), tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen name="transactions" options={{ title: t("Movimientos"), tabBarIcon: icon("swap-horizontal", "swap-horizontal-outline") }} />
      <Tabs.Screen name="recurring" options={{ title: t("Pagos"), tabBarIcon: icon("calendar", "calendar-outline") }} />
      <Tabs.Screen name="goals" options={{ title: t("Metas"), tabBarIcon: icon("flag", "flag-outline") }} />
      <Tabs.Screen name="more" options={{ title: t("Más"), tabBarIcon: icon("grid", "grid-outline") }} />
      {/* Accesibles desde "Más" pero fuera de la barra */}
      <Tabs.Screen name="accounts" options={{ href: null }} />
      <Tabs.Screen name="debts" options={{ href: null }} />
      <Tabs.Screen name="investments" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null }} />
    </Tabs>
  );
}
