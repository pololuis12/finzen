import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { decode } from "base64-arraybuffer";
import { supabase, currentUserId } from "./supabase";
import { t } from "./i18n";
import { notifyDataChanged } from "./dataEvents";
import type { Attachment } from "./types";

/** Archivo elegido localmente, aún sin subir. */
export type LocalFile = {
  uri: string;
  name: string;
  mime: string;
  kind: Attachment["kind"];
  size?: number;
  originalSize?: number;
};

const MAX_WIDTH = 1600;
const QUALITY = 0.6;

async function fileSize(uri: string): Promise<number | undefined> {
  try {
    if (Platform.OS === "web") return (await (await fetch(uri)).blob()).size;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size : undefined;
  } catch { return undefined; }
}

/** Compresión automática: redimensiona a máx. 1600px de ancho y recomprime a JPEG 60%. */
export async function compressImage(uri: string, width?: number, maxWidth = MAX_WIDTH): Promise<{ uri: string; size?: number; originalSize?: number }> {
  const originalSize = await fileSize(uri);
  const ctx = ImageManipulator.manipulate(uri);
  if (!width || width > maxWidth) ctx.resize({ width: maxWidth });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  return { uri: result.uri, size: await fileSize(result.uri), originalSize };
}

async function fromImageResult(res: ImagePicker.ImagePickerResult, kind: "photo" | "image"): Promise<LocalFile | null> {
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const c = await compressImage(a.uri, a.width);
  return { uri: c.uri, name: `${kind === "photo" ? "foto" : "imagen"}-${Date.now()}.jpg`, mime: "image/jpeg", kind, size: c.size, originalSize: c.originalSize ?? a.fileSize };
}

export async function takePhoto(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error(t("Debes permitir el acceso a la cámara"));
  return fromImageResult(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 }), "photo");
}

// Galería: usa el selector de fotos del sistema, que no requiere permiso de lectura de
// toda la galería (la app solo recibe la imagen elegida).
export async function pickImage(): Promise<LocalFile | null> {
  return fromImageResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }), "image");
}

export async function pickDocument(): Promise<LocalFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mime = a.mimeType ?? (a.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  if (mime.startsWith("image/")) {
    const c = await compressImage(a.uri);
    return { uri: c.uri, name: a.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", kind: "image", size: c.size, originalSize: a.size ?? c.originalSize };
  }
  return { uri: a.uri, name: a.name, mime, kind: mime === "application/pdf" ? "pdf" : "file", size: a.size ?? undefined, originalSize: a.size ?? undefined };
}

async function readBody(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") return (await fetch(uri)).arrayBuffer();
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(b64);
}

const safe = (s: string) => s.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);

/** Sube el archivo a Storage y lo relaciona con el movimiento. */
export async function uploadAttachment(transactionId: string, f: LocalFile) {
  const uid = await currentUserId();
  const path = `${uid}/${transactionId}/${Date.now()}-${safe(f.name)}`;
  const body = await readBody(f.uri);
  const up = await supabase.storage.from("attachments").upload(path, body, { contentType: f.mime, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from("attachments").insert({
    transaction_id: transactionId, storage_path: path, file_name: f.name, mime_type: f.mime,
    kind: f.kind, size_bytes: f.size ?? body.byteLength, original_size_bytes: f.originalSize ?? null,
  });
  if (error) {
    await supabase.storage.from("attachments").remove([path]);
    throw error;
  }
  notifyDataChanged();
}

export async function deleteAttachment(a: Pick<Attachment, "id" | "storage_path">) {
  await supabase.storage.from("attachments").remove([a.storage_path]);
  const { error } = await supabase.from("attachments").delete().eq("id", a.id);
  if (error) throw error;
  notifyDataChanged();
}

export async function signedUrl(bucket: string, path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedUrls(bucket: string, paths: string[], seconds = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// ---------------- Foto de perfil ----------------

/** Comprime a 400px, sube a avatars/{uid}/ y devuelve la ruta guardada. Borra la anterior. */
export async function uploadAvatar(previousPath: string | null): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const img = await compressImage(res.assets[0].uri, res.assets[0].width, 400);
  const uid = await currentUserId();
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  const up = await supabase.storage.from("avatars").upload(path, await readBody(img.uri), { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  if (previousPath) await supabase.storage.from("avatars").remove([previousPath]);
  return path;
}

/** Borra todos los archivos del usuario en Storage (antes de eliminar la cuenta). */
export async function deleteAllUserFiles() {
  const uid = await currentUserId();
  const { data: atts } = await supabase.from("attachments").select("storage_path");
  if (atts?.length) await supabase.storage.from("attachments").remove(atts.map((a) => a.storage_path));
  for (const bucket of ["avatars", "backups"]) {
    const { data } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
    if (data?.length) await supabase.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
  }
}

// ---------------- Ubicación ----------------

export async function currentLocation(): Promise<{ latitude: number; longitude: number; name: string | null }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error(t("Debes permitir el acceso a la ubicación"));
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = pos.coords;
  let name: string | null = null;
  try {
    const [g] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (g) name = [g.name ?? g.street, g.district, g.city].filter(Boolean).join(", ") || null;
  } catch { /* geocodificación opcional */ }
  return { latitude, longitude, name };
}

export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
