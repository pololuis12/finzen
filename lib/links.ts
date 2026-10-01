import { Platform } from "react-native";
import * as Linking from "expo-linking";

// Enlaces que van en los correos de Supabase (confirmar cuenta, recuperar contraseña, cambiar correo).
// En web: https://pololuis12.github.io/finzen/<ruta>  ·  En la app: finzen://<ruta>
export const WEB_BASE_PATH = "/finzen";
export const WEB_URL = "https://pololuis12.github.io/finzen";

export function appLink(path: string) {
  const clean = path.replace(/^\//, "");
  if (Platform.OS === "web") return `${window.location.origin}${WEB_BASE_PATH}/${clean}`;
  return Linking.createURL(clean);
}
