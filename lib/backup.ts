import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { supabase, currentUserId } from "./supabase";
import { getAllUserData, updateProfile } from "./queries";
import { todayISO } from "./format";
import type { BackupFrequency, Profile } from "./types";
import type { ExportedFile } from "./export";
import { MIME } from "./export";

// Respaldos: copia JSON de todos los datos en el bucket privado "backups/{uid}/".
// Se guardan los últimos 10; el automático corre al abrir la app cuando toca.

const KEEP = 10;
const DAYS: Record<BackupFrequency, number> = { daily: 1, weekly: 7, monthly: 30 };

export type BackupFile = { name: string; path: string; created_at: string; size: number };

export async function runBackup(): Promise<string> {
  const uid = await currentUserId();
  const data = await getAllUserData();
  const json = JSON.stringify({ created_at: new Date().toISOString(), app: "FinZen", version: 2, data });
  const name = `finzen-backup-${todayISO()}-${Date.now()}.json`;
  const path = `${uid}/${name}`;
  const { error } = await supabase.storage.from("backups").upload(path, json, { contentType: "application/json", upsert: true });
  if (error) throw error;
  await updateProfile({ last_backup_at: new Date().toISOString() });
  await pruneBackups(uid);
  return name;
}

export async function listBackups(): Promise<BackupFile[]> {
  const uid = await currentUserId();
  const { data, error } = await supabase.storage.from("backups").list(uid, { sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data ?? []).filter((f) => f.name.endsWith(".json")).map((f) => ({
    name: f.name, path: `${uid}/${f.name}`, created_at: f.created_at ?? "", size: Number(f.metadata?.size ?? 0),
  }));
}

async function pruneBackups(uid: string) {
  const files = await listBackups();
  const old = files.slice(KEEP);
  if (old.length) await supabase.storage.from("backups").remove(old.map((f) => `${uid}/${f.name}`));
}

export async function downloadBackup(b: BackupFile): Promise<ExportedFile | null> {
  const { data, error } = await supabase.storage.from("backups").download(b.path);
  if (error) throw error;
  const text = await data.text();
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: MIME.json }));
    const a = document.createElement("a"); a.href = url; a.download = b.name; a.click();
    return null;
  }
  const uri = `${FileSystem.cacheDirectory}${b.name}`;
  await FileSystem.writeAsStringAsync(uri, text);
  return { uri, name: b.name, mime: MIME.json };
}

export async function deleteBackup(b: BackupFile) {
  const { error } = await supabase.storage.from("backups").remove([b.path]);
  if (error) throw error;
}

/** Ejecuta el respaldo automático si está activado y ya pasó el intervalo configurado. */
export async function maybeAutoBackup(p: Profile | null) {
  if (!p?.auto_backup) return false;
  const last = p.last_backup_at ? new Date(p.last_backup_at).getTime() : 0;
  const due = Date.now() - last >= DAYS[p.backup_frequency] * 86_400_000;
  if (!due) return false;
  try { await runBackup(); return true; } catch (e) { console.warn("auto-backup", e); return false; }
}
