// Paletas. `theme` es un objeto mutable: applyTheme() lo actualiza y SettingsProvider
// hace re-render de las pantallas, que leen los colores en cada render.
const shared = {
  primary: "#7c6bff",
  primaryDark: "#4c3fd6",
  income: "#22d3a5",
  expense: "#fb5779",
  transfer: "#38bdf8",
  invest: "#c084fc",
  warn: "#f5a623",
  ant: "#f59e0b",
  savings: "#34d399",

  expenseTypes: {
    fixed: "#fb5779",
    normal: "#f5a623",
    casual: "#a78bfa",
  },

  radius: 22,
  radiusSm: 14,
  radiusXs: 10,
  space: 16,
};

type Gradient = readonly [string, string, ...string[]];

const darkPalette = {
  ...shared,
  mode: "dark" as "dark" | "light",
  bg: "#070912",
  card: "#131829",
  cardAlt: "#1b2140",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "#242b4a",
  borderSoft: "rgba(255,255,255,0.08)",
  text: "#f4f6ff",
  textDim: "#c7cdf0",
  muted: "#8891b8",
  mutedDim: "#5c6489",
  gradients: {
    primary: ["#8b7bff", "#5b3df0"] as Gradient,
    hero: ["#4c3fd6", "#7c3aed", "#a855f7"] as Gradient,
    income: ["#34e0b0", "#0ea86f"] as Gradient,
    expense: ["#fd8aa0", "#e11d48"] as Gradient,
    transfer: ["#67d3ff", "#2563eb"] as Gradient,
    invest: ["#d4a6ff", "#9333ea"] as Gradient,
    warn: ["#ffcf7a", "#e08a1f"] as Gradient,
    savings: ["#34d399", "#047857"] as Gradient,
    dark: ["#1b2140", "#0e1226"] as Gradient,
    loginTop: ["#221a4d", "#070912"] as Gradient,
  },
  shadow: {
    shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  shadowSm: {
    shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
};

type Palette = typeof darkPalette;

const lightPalette: Palette = {
  ...darkPalette,
  mode: "light",
  bg: "#f3f4fa",
  card: "#ffffff",
  cardAlt: "#eceef7",
  cardSoft: "rgba(0,0,0,0.03)",
  border: "#d9ddef",
  borderSoft: "rgba(17,21,42,0.07)",
  text: "#121630",
  textDim: "#363c5e",
  muted: "#666e91",
  mutedDim: "#9aa1bf",
  gradients: {
    ...darkPalette.gradients,
    dark: ["#ffffff", "#e9ecf8"],
    loginTop: ["#dcd7ff", "#f3f4fa"],
  },
  shadow: { ...darkPalette.shadow, shadowOpacity: 0.1 },
  shadowSm: { ...darkPalette.shadowSm, shadowOpacity: 0.06, elevation: 2 },
};

export const theme: Palette = { ...darkPalette };

export function applyTheme(mode: "dark" | "light") {
  Object.assign(theme, mode === "light" ? lightPalette : darkPalette);
}

export type Theme = Palette;
