import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as aesjs from "aes-js";

// Almacenamiento cifrado para la sesión de Supabase (patrón recomendado por Supabase).
// La sesión supera el límite de 2 KB de SecureStore, así que:
//   - una llave AES-256 aleatoria por clave vive en SecureStore (Android Keystore / iOS Keychain)
//   - el contenido cifrado (AES-CTR) se guarda en AsyncStorage
// Si alguien copia el almacenamiento de la app, sin la llave del Keystore no puede leer el token.

const keyName = (key: string) => `finzen_k_${key.replace(/[^\w.-]/g, "_")}`;

async function encrypt(key: string, value: string) {
  const encryptionKey = Crypto.getRandomBytes(256 / 8);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(encryptionKey));
  return aesjs.utils.hex.fromBytes(encrypted);
}

async function decrypt(key: string, value: string) {
  const hexKey = await SecureStore.getItemAsync(keyName(key));
  if (!hexKey) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
}

export const secureSessionStorage = Platform.OS === "web" ? AsyncStorage : {
  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try { return await decrypt(key, encrypted); }
    catch { return null; } // sesión antigua sin cifrar o llave inválida → pedir login de nuevo
  },
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, await encrypt(key, value));
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key));
  },
};
