import { Alert, Platform } from "react-native";
import { t } from "./i18n";

export function notify(message: string, title = "FinZen") {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert(title, message);
}

export function confirm(message: string, opts: { title?: string; okLabel?: string; destructive?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert(opts.title ?? "FinZen", message, [
      { text: t("Cancelar"), style: "cancel", onPress: () => resolve(false) },
      { text: opts.okLabel ?? t("Aceptar"), style: opts.destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return t("Ocurrió un error");
}
