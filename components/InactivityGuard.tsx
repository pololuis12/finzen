import React, { useEffect, useRef } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "./auth";
import { useSettings } from "./settings";
import { supabase } from "../lib/supabase";
import { notify } from "../lib/alert";
import { t } from "../lib/i18n";

// Cierre automático de sesión: cualquier toque reinicia el contador; si la app pasa
// más de N minutos sin actividad (abierta o en segundo plano) se cierra la sesión.

export function InactivityGuard({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { profile } = useSettings();
  const minutes = profile?.auto_logout_minutes ?? 0;
  const last = useRef(Date.now());

  const touch = () => { last.current = Date.now(); return false; };

  useEffect(() => {
    if (!session || minutes <= 0) return;
    last.current = Date.now();
    const limit = minutes * 60_000;
    const check = async () => {
      if (Date.now() - last.current >= limit) {
        await supabase.auth.signOut();
        notify(t("Tu sesión se cerró por inactividad ({n} min).", { n: minutes }));
      }
    };
    const timer = setInterval(check, 15_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [session?.user.id, minutes]);

  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={touch} onMoveShouldSetResponderCapture={touch}>
      {children}
    </View>
  );
}
