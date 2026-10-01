import { View, ActivityIndicator, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../constants/theme";
import { useSettings } from "../components/settings";

// El redireccionamiento real lo maneja el "Gate" en app/_layout.tsx
export default function Index() {
  useSettings();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", gap: 16 }}>
      <LinearGradient colors={theme.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: 76, height: 76, borderRadius: 24, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 34 }}>💸</Text>
      </LinearGradient>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}
