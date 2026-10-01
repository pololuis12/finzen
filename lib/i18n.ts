import { EN } from "./i18n.en";

// El texto en español es la clave; EN traduce. Si falta una traducción se muestra el español.
export type Lang = "es" | "en";
let current: Lang = "es";

export function setLang(l: Lang) { current = l; }
export function getLang(): Lang { return current; }
export function locale() { return current === "en" ? "en-US" : "es-CO"; }

export function t(es: string, vars?: Record<string, string | number>) {
  let s = current === "en" ? (EN[es] ?? es) : es;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}
