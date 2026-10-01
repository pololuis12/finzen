import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";
import { t } from "../lib/i18n";
import type {
  AccountType, InvestmentType, ExpenseType, TxType, PaymentMethod, Frequency,
} from "../lib/types";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export const ACCOUNT_ICON: Record<AccountType, IconName> = {
  checking: "card-outline",
  savings: "wallet-outline",
  cash: "cash-outline",
  credit: "card",
  investment: "trending-up-outline",
};

export const INVESTMENT_ICON: Record<InvestmentType, IconName> = {
  stocks: "bar-chart-outline",
  crypto: "logo-bitcoin",
  fund: "layers-outline",
  real_estate: "business-outline",
  cdt: "shield-checkmark-outline",
  bonds: "document-text-outline",
  other: "ellipsis-horizontal-circle-outline",
};

export const TX_TYPE_ICON: Record<TxType, IconName> = {
  income: "arrow-down-circle",
  expense: "arrow-up-circle",
  transfer: "swap-horizontal",
};

export const EXPENSE_TYPE_COLOR: Record<ExpenseType, string> = {
  fixed: theme.expenseTypes.fixed,
  normal: theme.expenseTypes.normal,
  casual: theme.expenseTypes.casual,
};

export const PAYMENT_METHOD_ICON: Record<PaymentMethod, IconName> = {
  cash: "cash-outline",
  debit: "card-outline",
  credit: "card",
  transfer: "swap-horizontal-outline",
  deposit: "download-outline",
  check: "document-outline",
  digital_wallet: "phone-portrait-outline",
  other: "ellipsis-horizontal-outline",
};

// Etiquetas como funciones: se traducen al idioma activo en cada render.
export const expenseTypeLabel = (e: ExpenseType) =>
  ({ fixed: t("Fijo"), normal: t("Normal"), casual: t("Casual") })[e];

export const txTypeLabel = (x: TxType) =>
  ({ income: t("Ingreso"), expense: t("Gasto"), transfer: t("Transferencia") })[x];

export const paymentMethodLabel = (m: PaymentMethod) => ({
  cash: t("Efectivo"),
  debit: t("Tarjeta débito"),
  credit: t("Tarjeta crédito"),
  transfer: t("Transferencia"),
  deposit: t("Consignación"),
  check: t("Cheque"),
  digital_wallet: t("Billetera digital"),
  other: t("Otro"),
})[m];

export const INCOME_METHODS: PaymentMethod[] = ["transfer", "deposit", "cash", "digital_wallet", "check", "other"];
export const EXPENSE_METHODS: PaymentMethod[] = ["cash", "debit", "credit", "transfer", "digital_wallet", "other"];

export const FREQUENCIES: Frequency[] = [
  "once", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual",
];

export const frequencyLabel = (f: Frequency) => ({
  once: t("Una vez"),
  weekly: t("Semanal"),
  biweekly: t("Quincenal"),
  monthly: t("Mensual"),
  bimonthly: t("Bimestral"),
  quarterly: t("Trimestral"),
  semiannual: t("Semestral"),
  annual: t("Anual"),
})[f];

export const accountTypeLabel = (a: AccountType) => ({
  checking: t("Corriente"), savings: t("Ahorros"), cash: t("Efectivo"),
  credit: t("Crédito"), investment: t("Inversión"),
})[a];

export const investmentTypeLabel = (i: InvestmentType) => ({
  stocks: t("Acciones"), crypto: t("Cripto"), fund: t("Fondo"), real_estate: t("Finca raíz"),
  cdt: t("CDT"), bonds: t("Bonos"), other: t("Otro"),
})[i];

export const GOAL_ICONS: IconName[] = [
  "home-outline", "car-outline", "airplane-outline", "school-outline", "medkit-outline",
  "laptop-outline", "gift-outline", "shield-checkmark-outline", "heart-outline", "star-outline",
];

export const PALETTE = [
  "#7c6bff", "#22d3a5", "#38bdf8", "#f59e0b", "#fb5779", "#a855f7", "#14b8a6", "#ec4899", "#84cc16", "#f97316",
];

export function safeIcon(name: string | null | undefined, fallback: IconName = "pricetag-outline"): IconName {
  return (name as IconName) || fallback;
}
