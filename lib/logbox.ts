import { LogBox } from "react-native";

// Debe importarse antes que expo-notifications. En Expo Go (SDK 53+) solo se quitaron las
// notificaciones push remotas; los recordatorios locales que usa FinZen sí funcionan.
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "`expo-notifications` functionality is not fully supported in Expo Go",
]);
