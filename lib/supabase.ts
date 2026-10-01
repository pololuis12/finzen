import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secureStorage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sin .env la app abre igual (muestra un aviso en el login) en lugar de cerrarse.
export const isSupabaseConfigured = Boolean(url && anon && !url.includes("TU-PROYECTO"));
if (!isSupabaseConfigured) {
  console.warn("Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY en .env");
}

// Un solo cliente compartido por iOS, Android y Web.
// La sesión se guarda cifrada en móvil (ver secureStorage.ts) y en localStorage en web.
export const supabase = createClient(
  isSupabaseConfigured ? url! : "https://placeholder.supabase.co",
  isSupabaseConfigured ? anon! : "placeholder-anon-key",
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("No hay sesión activa");
  return id;
}
