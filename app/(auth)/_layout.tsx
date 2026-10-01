import { Stack } from "expo-router";
import { theme } from "../../constants/theme";
import { useSettings } from "../../components/settings";

export default function AuthLayout() {
  useSettings();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />;
}
