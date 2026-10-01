import AsyncStorage from "@react-native-async-storage/async-storage";

// Protección contra fijación de sesión: un enlace finzen://…#access_token=… solo se acepta
// si el usuario pidió recuperar su contraseña en ESTE dispositivo hace menos de 2 horas.
// Así nadie puede mandarte un enlace que abra la app con la sesión de otra cuenta.

const KEY = "finzen_recovery_requested_at";
const WINDOW_MS = 2 * 60 * 60 * 1000;

export async function markRecoveryRequested() {
  await AsyncStorage.setItem(KEY, String(Date.now()));
}

export async function consumeRecoveryRequest(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  await AsyncStorage.removeItem(KEY);
  return !!raw && Date.now() - Number(raw) < WINDOW_MS;
}
