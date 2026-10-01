import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Card, Field, Button, Title, Chip, ChipRow, IconButton, EmptyState, DateField, ToggleRow, Label, Fab, Loading, withAlpha,
} from "../../components/UI";
import { TransactionRow } from "../../components/TransactionRow";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { safeIcon } from "../../constants/icons";
import { weekdayDate, parseAmount, money } from "../../lib/format";
import { t } from "../../lib/i18n";
import { searchTransactions, getCategories, type TxFilters } from "../../lib/queries";
import type { Transaction, Category } from "../../lib/types";

const PAGE = 40;
type TypeFilter = NonNullable<TxFilters["type"]>;

export default function Transactions() {
  useSettings();
  const params = useLocalSearchParams<{ type?: string; categoryId?: string }>();
  const [items, setItems] = useState<Transaction[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>((params.type as TypeFilter) ?? "all");
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [minAmount, setMin] = useState("");
  const [maxAmount, setMax] = useState("");
  const [withInvoice, setWithInvoice] = useState(false);

  const filters: TxFilters = useMemo(() => ({
    search, type, categoryId, from, to, withInvoice,
    minAmount: minAmount ? parseAmount(minAmount) : null,
    maxAmount: maxAmount ? parseAmount(maxAmount) : null,
  }), [search, type, categoryId, from, to, minAmount, maxAmount, withInvoice]);

  const activeFilters = [categoryId, from, to, minAmount, maxAmount, withInvoice ? "1" : ""].filter(Boolean).length;
  const reqId = useRef(0);

  const load = useCallback(async (reset = true) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const p = reset ? 0 : page + 1;
      const res = await searchTransactions(filters, p, PAGE);
      if (id !== reqId.current) return; // llegó una búsqueda más nueva
      setItems((prev) => (reset ? res.rows : [...prev, ...res.rows]));
      setCount(res.count);
      setPage(p);
    } catch (e) { console.warn(e); }
    finally { if (id === reqId.current) setLoading(false); }
  }, [filters, page]);

  // Búsqueda con pequeña espera mientras se escribe
  useEffect(() => {
    const h = setTimeout(() => load(true), 300);
    return () => clearTimeout(h);
  }, [filters]);

  useFocusEffect(useCallback(() => {
    getCategories().then(setCats).catch(() => {});
    load(true);
  }, [filters]));

  useEffect(() => { if (params.type) setType(params.type as TypeFilter); }, [params.type]);

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const visibleCats = cats.filter((c) => type === "income" ? c.kind === "income" : type === "expense" || type === "ant" ? c.kind === "expense" && (type !== "ant" || c.is_ant) : true);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const tx of items) m.set(tx.occurred_at, [...(m.get(tx.occurred_at) ?? []), tx]);
    return [...m.entries()];
  }, [items]);

  const totals = useMemo(() => items.reduce((a, tx) => {
    if (tx.type === "income") a.inc += Number(tx.amount);
    else if (tx.type === "expense") a.exp += Number(tx.amount);
    return a;
  }, { inc: 0, exp: 0 }), [items]);

  function clearFilters() {
    setCategoryId(null); setFrom(null); setTo(null); setMin(""); setMax(""); setWithInvoice(false); setType("all"); setSearch("");
  }

  const TYPES: { key: TypeFilter; label: string }[] = [
    { key: "all", label: t("Todos") }, { key: "income", label: t("Ingresos") }, { key: "expense", label: t("Gastos") },
    { key: "ant", label: `🐜 ${t("Hormiga")}` }, { key: "transfer", label: t("Transferencias") },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true)} tintColor={theme.muted} />}>
        <Title sub={t("{n} resultados", { n: count })} right={
          <IconButton name="options-outline" badge={activeFilters} onPress={() => setShowFilters((v) => !v)}
            bg={showFilters ? theme.primary : theme.cardAlt} color={showFilters ? "#fff" : theme.text} />
        }>{t("Movimientos")}</Title>

        <Field icon="search-outline" value={search} onChangeText={setSearch} returnKeyType="search"
          placeholder={t("Buscar por descripción, valor, lugar…")}
          right={search ? <Pressable onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={theme.mutedDim} /></Pressable> : undefined} />

        <ChipRow>
          {TYPES.map((x) => <Chip key={x.key} label={x.label} active={type === x.key} onPress={() => { setType(x.key); setCategoryId(null); }} />)}
        </ChipRow>

        {showFilters && (
          <Card style={{ gap: 12 }}>
            <Label>{t("Categoría")}</Label>
            <ChipRow>
              <Chip label={t("Todas")} active={!categoryId} onPress={() => setCategoryId(null)} />
              {visibleCats.map((c) => (
                <Chip key={c.id} label={c.name} icon={safeIcon(c.icon)} color={c.color ?? theme.primary}
                  active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </ChipRow>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><DateField label={t("Desde")} value={from} onChange={setFrom} clearable placeholder={t("Cualquiera")} /></View>
              <View style={{ flex: 1 }}><DateField label={t("Hasta")} value={to} onChange={setTo} clearable placeholder={t("Cualquiera")} /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label={t("Valor mínimo")} value={minAmount} onChangeText={setMin} keyboardType="numeric" placeholder="0" /></View>
              <View style={{ flex: 1 }}><Field label={t("Valor máximo")} value={maxAmount} onChangeText={setMax} keyboardType="numeric" placeholder="∞" /></View>
            </View>
            <ToggleRow icon="document-attach-outline" label={t("Solo con factura")} value={withInvoice} onChange={setWithInvoice} />
            <Button label={t("Limpiar filtros")} tone="ghost" icon="refresh-outline" onPress={clearFilters} />
          </Card>
        )}

        {items.length > 0 && type !== "transfer" && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {type !== "expense" && type !== "ant" && (
              <View style={{ flex: 1, backgroundColor: withAlpha(theme.income, 0.12), borderRadius: 12, padding: 10 }}>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{t("Ingresos (en pantalla)")}</Text>
                <Text style={{ color: theme.income, fontWeight: "800" }}>{money(totals.inc)}</Text>
              </View>
            )}
            {type !== "income" && (
              <View style={{ flex: 1, backgroundColor: withAlpha(theme.expense, 0.12), borderRadius: 12, padding: 10 }}>
                <Text style={{ color: theme.muted, fontSize: 11 }}>{t("Gastos (en pantalla)")}</Text>
                <Text style={{ color: theme.expense, fontWeight: "800" }}>{money(totals.exp)}</Text>
              </View>
            )}
          </View>
        )}

        {items.length === 0 && !loading && (
          <Card>
            <EmptyState icon="search-outline" title={search || activeFilters ? t("No hay resultados") : t("Aún no hay movimientos")}
              sub={search || activeFilters ? t("Prueba con otra búsqueda o limpia los filtros.") : t("Registra tu primer ingreso o gasto.")}
              action={search || activeFilters ? { label: t("Limpiar filtros"), onPress: clearFilters } : { label: t("Registrar movimiento"), onPress: () => router.push("/transaction-form") }} />
          </Card>
        )}

        {groups.map(([date, txs]) => (
          <View key={date} style={{ gap: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700", marginLeft: 4 }}>{weekdayDate(date)}</Text>
            <Card style={{ paddingVertical: 6 }}>
              {txs.map((tx) => <TransactionRow key={tx.id} tx={tx} showDate={false} category={tx.category_id ? catMap.get(tx.category_id) : undefined} />)}
            </Card>
          </View>
        ))}

        {loading && <Loading />}
        {!loading && items.length < count && (
          <Button label={t("Cargar más ({n} restantes)", { n: count - items.length })} tone="soft" onPress={() => load(false)} />
        )}
      </ScrollView>
      <Fab onPress={() => router.push({ pathname: "/transaction-form", params: type === "income" || type === "transfer" ? { type } : type === "ant" ? { ant: "1" } : {} })} />
    </SafeAreaView>
  );
}
