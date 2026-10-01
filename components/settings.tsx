import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./auth";
import { applyTheme } from "../constants/theme";
import { setLang } from "../lib/i18n";
import { setCurrency } from "../lib/format";
import { getProfile, updateProfile } from "../lib/queries";
import { signedUrl } from "../lib/attachments";
import { maybeAutoBackup } from "../lib/backup";
import { ensureNotificationPermission, syncReminders } from "../lib/notifications";
import type { Profile, ThemePref } from "../lib/types";

// Preferencias del usuario (tema, idioma, moneda, cierre de sesión, respaldos).
// Viven en la tabla profiles → se sincronizan entre dispositivos. Se guarda una copia
// local para que el login ya aparezca con el tema e idioma elegidos.

type Prefs = Pick<Profile, "theme" | "language" | "currency">;
const LOCAL_KEY = "finzen_prefs";
const DEFAULT_PREFS: Prefs = { theme: "dark", language: "es", currency: "COP" };

type Ctx = {
  profile: Profile | null;
  avatarUri: string | null;
  /** Cambia en cada actualización de preferencias: las pantallas que lo leen se re-renderizan. */
  version: number;
  update: (patch: Partial<Profile>) => Promise<void>;
  reload: () => Promise<void>;
};

const SettingsContext = createContext<Ctx>({
  profile: null, avatarUri: null, version: 0, update: async () => {}, reload: async () => {},
});

function resolveTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") return Appearance.getColorScheme() === "light" ? "light" : "dark";
  return pref;
}

function applyPrefs(p: Prefs) {
  applyTheme(resolveTheme(p.theme));
  setLang(p.language);
  setCurrency(p.currency);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const commit = useCallback((p: Prefs) => {
    applyPrefs(p);
    setPrefs(p);
    setVersion((v) => v + 1);
    AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(p)).catch(() => {});
  }, []);

  // Preferencias locales (antes de iniciar sesión)
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_KEY)
      .then((raw) => { if (raw) commit({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); })
      .catch(() => {});
  }, [commit]);

  // Si el tema es "sistema", seguir los cambios del teléfono
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => { if (prefs.theme === "system") commit(prefs); });
    return () => sub.remove();
  }, [prefs, commit]);

  const loadAvatar = useCallback(async (p: Profile | null) => {
    if (!p?.avatar_url) { setAvatarUri(null); return; }
    try { setAvatarUri(await signedUrl("avatars", p.avatar_url, 60 * 60 * 24 * 7)); } catch { setAvatarUri(null); }
  }, []);

  const reload = useCallback(async () => {
    try {
      const p = await getProfile();
      setProfile(p);
      if (p) commit({ theme: p.theme, language: p.language, currency: p.currency });
      await loadAvatar(p);
    } catch (e) { console.warn("profile", e); }
  }, [commit, loadAvatar]);

  // Al iniciar sesión: perfil, respaldo automático y recordatorios
  useEffect(() => {
    if (!session) { setProfile(null); setAvatarUri(null); return; }
    let alive = true;
    (async () => {
      const p = await getProfile().catch(() => null);
      if (!alive) return;
      setProfile(p);
      if (p) commit({ theme: p.theme, language: p.language, currency: p.currency });
      loadAvatar(p);
      maybeAutoBackup(p).then((did) => { if (did && alive) getProfile().then((x) => alive && setProfile(x)).catch(() => {}); });
      if (Platform.OS !== "web" && (await ensureNotificationPermission().catch(() => false))) {
        syncReminders(p?.report_notifications ?? true);
      }
    })();
    return () => { alive = false; };
  }, [session?.user.id]);

  const update = useCallback(async (patch: Partial<Profile>) => {
    await updateProfile(patch);
    const next = { ...(profile ?? ({} as Profile)), ...patch } as Profile;
    setProfile(next);
    commit({ theme: next.theme ?? prefs.theme, language: next.language ?? prefs.language, currency: next.currency ?? prefs.currency });
    if ("avatar_url" in patch) await loadAvatar(next);
  }, [profile, prefs, commit, loadAvatar]);

  return (
    <SettingsContext.Provider value={{ profile, avatarUri, version, update, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
