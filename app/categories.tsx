import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, Button, SegBar, ToggleRow, IconCircle, Label, FadeIn, IconButton, Muted,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import { safeIcon, expenseTypeLabel, PALETTE, type IconName } from "../constants/icons";
import { t } from "../lib/i18n";
import { useAutoReload } from "../lib/dataEvents";
import { notify, confirm, errorMessage } from "../lib/alert";
import { getCategories, saveCategory, archiveCategory, ensureExtraCategories } from "../lib/queries";
import type { Category, ExpenseType } from "../lib/types";

const ICONS: IconName[] = [
  "pricetag-outline", "cart-outline", "restaurant-outline", "car-outline", "home-outline", "medkit-outline", "school-outline",
  "film-outline", "gift-outline", "briefcase-outline", "cafe-outline", "fitness-outline", "shirt-outline", "paw-outline",
  "game-controller-outline", "phone-portrait-outline", "construct-outline", "beer-outline",
];

export default function Categories() {
  useSettings();
  const [items, setItems] = useState<Category[]>([]);
  const [kind, setKind] = useState<"income" | "expense" | "ant">("expense");
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getCategories()); } catch (e) { notify(errorMessage(e)); }
  }, []);
  useAutoReload(load);

  const shown = items.filter((c) => kind === "income" ? c.kind === "income" : kind === "ant" ? c.is_ant : c.kind === "expense" && !c.is_ant);

  function startNew() {
    setEditing({
      name: "", kind: kind === "income" ? "income" : "expense", is_ant: kind === "ant",
      expense_type: kind === "income" ? null : kind === "ant" ? "casual" : "normal", icon: ICONS[0], color: PALETTE[0],
    });
  }

  async function save() {
    if (!editing?.name?.trim()) return notify(t("Escribe un nombre"));
    setBusy(true);
    try {
      await saveCategory({ ...editing, name: editing.name.trim() });
      setEditing(null);
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function addSuggested() {
    setBusy(true);
    try {
      const n = await ensureExtraCategories(true);
      await load();
      notify(n ? t("Se agregaron {n} categorías", { n }) : t("Ya tienes todas las categorías sugeridas"));
    } catch (e) { notify(t("No se pudieron agregar las categorías: {error}", { error: errorMessage(e) })); }
    finally { setBusy(false); }
  }

  async function remove(c: Category) {
    if (!(await confirm(t("¿Ocultar la categoría {name}? Los movimientos existentes la conservan.", { name: c.name }), { okLabel: t("Ocultar") }))) return;
    try { await archiveCategory(c.id); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  return (
    <Screen header={<ScreenHeader title={t("Categorías")} right={<IconButton name="add" bg={theme.primary} color="#fff" onPress={startNew} />} />}>
      <SegBar value={kind} onChange={(k) => { setKind(k); setEditing(null); }} options={[
        { key: "expense", label: t("Gastos") }, { key: "income", label: t("Ingresos") }, { key: "ant", label: `🐜 ${t("Hormiga")}` },
      ]} />

      {editing && (
        <FadeIn>
          <Card style={{ gap: 12 }}>
            <Field label={t("Nombre")} icon="pricetag-outline" value={editing.name ?? ""} onChangeText={(v) => setEditing({ ...editing, name: v })} />
            {editing.kind === "expense" && (
              <>
                <Label>{t("Tipo de gasto")}</Label>
                <SegBar value={(editing.expense_type ?? "normal") as ExpenseType} onChange={(v) => setEditing({ ...editing, expense_type: v })} options={[
                  { key: "fixed", label: expenseTypeLabel("fixed") }, { key: "normal", label: expenseTypeLabel("normal") }, { key: "casual", label: expenseTypeLabel("casual") },
                ]} />
                <ToggleRow label={`🐜 ${t("Categoría de gasto hormiga")}`} value={!!editing.is_ant} onChange={(v) => setEditing({ ...editing, is_ant: v })} />
              </>
            )}
            <Label>{t("Ícono")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ICONS.map((i) => (
                <Pressable key={i} onPress={() => setEditing({ ...editing, icon: i })}>
                  <IconCircle name={i} size={38} color={editing.icon === i ? editing.color ?? theme.primary : theme.muted} />
                </Pressable>
              ))}
            </View>
            <Label>{t("Color")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PALETTE.map((c) => (
                <Pressable key={c} onPress={() => setEditing({ ...editing, color: c })}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: "center", justifyContent: "center" }}>
                  {editing.color === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button label={t("Cancelar")} tone="ghost" onPress={() => setEditing(null)} /></View>
              <View style={{ flex: 1 }}><Button label={t("Guardar")} icon="checkmark" onPress={save} loading={busy} /></View>
            </View>
          </Card>
        </FadeIn>
      )}

      <Card style={{ gap: 0 }}>
        {shown.map((c) => (
          <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
            <IconCircle name={safeIcon(c.icon)} color={c.color ?? theme.primary} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>{c.name}</Text>
              {c.expense_type && <Text style={{ color: theme.muted, fontSize: 12 }}>{expenseTypeLabel(c.expense_type)}</Text>}
            </View>
            <Pressable onPress={() => setEditing(c)} hitSlop={8}><Ionicons name="create-outline" size={19} color={theme.muted} /></Pressable>
            <Pressable onPress={() => remove(c)} hitSlop={8}><Ionicons name="eye-off-outline" size={19} color={theme.mutedDim} /></Pressable>
          </View>
        ))}
      </Card>
      {kind === "expense" && (
        <>
          <Button label={t("Agregar categorías sugeridas")} icon="sparkles-outline" tone="soft" loading={busy} onPress={addSuggested} />
          <Muted style={{ textAlign: "center" }}>{t("Tarjeta de crédito, gimnasio, ahorros, Mi Pago, EPM, Tigo, universidad…")}</Muted>
        </>
      )}
    </Screen>
  );
}
