import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

// Aviso global de "los datos cambiaron": cada guardado lo emite y las pantallas abiertas se recargan.
// No depende de los eventos de foco, que en web no siempre llegan al cerrar un formulario modal.
type Listener = () => void;
const listeners = new Set<Listener>();
let pending = false;

export function notifyDataChanged() {
  if (pending) return;
  pending = true;
  // Agrupa varios guardados seguidos (p. ej. gasto + pago recurrente) en una sola recarga
  setTimeout(() => {
    pending = false;
    listeners.forEach((l) => l());
  }, 50);
}

/** Ejecuta `load` al enfocar la pantalla y cada vez que se guardan datos en cualquier parte de la app. */
export function useAutoReload(load: () => unknown) {
  const ref = useRef(load);
  ref.current = load;
  useFocusEffect(useCallback(() => { ref.current(); }, [load]));
  useEffect(() => {
    const l = () => { ref.current(); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}
