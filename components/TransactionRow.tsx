import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { IconCircle } from "./UI";
import { theme } from "../constants/theme";
import { TX_TYPE_ICON, safeIcon, txTypeLabel, paymentMethodLabel } from "../constants/icons";
import { money, shortDate } from "../lib/format";
import { t } from "../lib/i18n";
import type { Category, Transaction } from "../lib/types";

export function TransactionRow({ tx, category, showDate = true }: { tx: Transaction; category?: Category; showDate?: boolean }) {
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
  const color = tx.type === "income" ? theme.income : tx.type === "expense" ? (tx.is_ant ? theme.ant : theme.expense) : theme.transfer;
  const hasInvoice = (tx.attachments?.length ?? 0) > 0;
  const meta = [
    showDate ? shortDate(tx.occurred_at) : null,
    category?.name,
    tx.payment_method ? paymentMethodLabel(tx.payment_method) : null,
  ].filter(Boolean).join(" · ");

  return (
    <Pressable onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: tx.id } })}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 12, opacity: pressed ? 0.7 : 1 }]}>
      <IconCircle name={category?.icon ? safeIcon(category.icon) : TX_TYPE_ICON[tx.type]} color={category?.color ?? color} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={1}>
          {tx.description || category?.name || txTypeLabel(tx.type)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={{ color: theme.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{meta}</Text>
          {tx.is_ant && <Text style={{ color: theme.ant, fontSize: 11, fontWeight: "800" }}>🐜 {t("Hormiga")}</Text>}
          {hasInvoice && <Ionicons name="attach" size={13} color={theme.muted} />}
          {tx.location_name && <Ionicons name="location-outline" size={12} color={theme.muted} />}
        </View>
      </View>
      <Text style={{ color, fontWeight: "800" }}>{sign} {money(Number(tx.amount), tx.currency)}</Text>
    </Pressable>
  );
}
