import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import { t } from "./i18n";

// Ingreso biométrico. La contraseña se guarda en el Keystore/Keychain con
// requireAuthentication: el propio sistema exige huella/rostro para descifrarla, y la llave
// se invalida si se registran nuevas huellas en el teléfono. El correo va aparte (sin
// biometría) solo para precargarlo en el login.

const KEY = "finzen_bio_secret";
const EMAIL_KEY = "finzen_bio_email";

const secureOpts = (prompt: string): SecureStore.SecureStoreOptions => ({
  requireAuthentication: true,
  authenticationPrompt: prompt,
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
});

export type BiometricInfo = { available: boolean; enrolled: boolean; label: string };

export async function biometricInfo(): Promise<BiometricInfo> {
  if (Platform.OS === "web") return { available: false, enrolled: false, label: "" };
  const available = await LocalAuthentication.hasHardwareAsync();
  const enrolled = available && (await LocalAuthentication.isEnrolledAsync());
  const types = available ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const label = Platform.OS === "ios" && face ? "Face ID" : finger ? t("huella digital") : face ? t("reconocimiento facial") : t("biometría");
  return { available, enrolled, label };
}

export async function isBiometricEnabled() {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(EMAIL_KEY)) != null;
}

export async function enableBiometric(email: string, password: string) {
  try {
    await SecureStore.setItemAsync(KEY, password, secureOpts(t("Confirma tu identidad para activar el ingreso biométrico")));
  } catch {
    throw new Error(t("No se pudo verificar tu identidad"));
  }
  await SecureStore.setItemAsync(EMAIL_KEY, email);
}

export async function updateBiometricPassword(email: string, password: string) {
  if (await isBiometricEnabled()) await enableBiometric(email, password).catch(() => disableBiometric());
}

export async function disableBiometric() {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  await SecureStore.deleteItemAsync(EMAIL_KEY).catch(() => {});
}

export async function biometricEmail(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(EMAIL_KEY);
}

export async function signInWithBiometrics() {
  const email = await biometricEmail();
  if (!email) throw new Error(t("El ingreso biométrico no está activado"));
  let password: string | null;
  try {
    password = await SecureStore.getItemAsync(KEY, secureOpts(t("Ingresa a FinZen")));
  } catch (e) {
    // Cancelado por el usuario → sin error; llave invalidada (huellas nuevas) → desactivar
    if (/cancel/i.test(String(e))) return false;
    await disableBiometric();
    throw new Error(t("Tus datos biométricos cambiaron. Ingresa con tu contraseña y vuelve a activar la huella."));
  }
  if (!password) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid/i.test(error.message)) await disableBiometric();
    throw error;
  }
  return true;
}
