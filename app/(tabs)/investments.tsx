import { useCallback, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, GradientCard, Field, Button, Chip, IconCircle, Badge, IconButton, EmptyState, FadeIn, Label,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { INVESTMENT_ICON, investmentTypeLabel } from "../../constants/icons";
import { money, parseAmount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAutoReload } from "../../lib/dataEvents";
import { notify, errorMessage } from "../../lib/alert";
import { getInvestments, createInvestment } from "../../lib/queries";
import type { Investment, InvestmentType } from "../../lib/types";

const TYPES: InvestmentType[] = ["cdt", "stocks", "crypto", "fund", "bonds", "real_estate", "other"];

export default function Investments() {
  useSettings();
  const [items, setItems] = useState<Investment[]>([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<InvestmentType>("cdt");
  const [invested, setInvested] = useState("");
  const [current, setCurrent] = useState("");
  const [inst, setInst] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getInvestments()); } catch (e) { console.warn(e); }
  }, []);
  useAutoReload(load);

  const totals = useMemo(() => {
    const inv = items.reduce((s, i) => s + Number(i.amount_invested), 0);
    const val = items.reduce((s, i) => s + Number(i.current_value), 0);
    return { inv, val, gain: val - inv, pct: inv > 0 ? ((val - inv) / inv) * 100 : 0 };
  }, [items]);

  async function save() {
    if (!name.trim()) return notify(t("Escribe un nombre"));
    setBusy(true);
    try {
      const iv = parseAmount(invested);
      await createInvestment({ name: name.trim(), type, amount_invested: iv, current_value: parseAmount(current) || iv, institution: inst.trim() || null });
      setName(""); setInvested(""); setCurrent(""); setInst(""); setShow(false);
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Inversiones")}
      right={<IconButton name={show ? "close" : "add"} onPress={() => setShow((v) => !v)} bg={theme.primary} color="#fff" />} />}>
      <GradientCard colors={theme.gradients.invest}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{t("Valor actual del portafolio")}</Text>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 4 }}>{money(totals.val)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <Ionicons name={totals.gain >= 0 ? "trending-up" : "trending-down"} size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {totals.gain >= 0 ? "+" : ""}{money(totals.gain)} ({totals.pct.toFixed(1)}%) · {t("invertido")} {money(totals.inv)}
          </Text>
        </View>
      </GradientCard>

      {show && (
        <FadeIn>
          <Card style={{ gap: 12 }}>
            <Field label={t("Nombre")} icon="pricetag-outline" value={name} onChangeText={setName} placeholder={t("Ej: CDT Bancolombia")} />
            <Label>{t("Tipo")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map((k) => <Chip key={k} label={investmentTypeLabel(k)} icon={INVESTMENT_ICON[k]} active={type === k} onPress={() => setType(k)} />)}
            </View>
            <Field label={t("Monto invertido")} icon="cash-outline" value={invested} onChangeText={setInvested} keyboardType="decimal-pad" placeholder="0" />
            <Field label={t("Valor actual")} icon="trending-up-outline" value={current} onChangeText={setCurrent} keyboardType="decimal-pad" placeholder={t("Igual al invertido si lo dejas vacío")} />
            <Field label={t("Entidad")} icon="business-outline" value={inst} onChangeText={setInst} placeholder={t("Opcional")} />
            <Button label={t("Agregar inversión")} icon="checkmark" onPress={save} loading={busy} />
          </Card>
        </FadeIn>
      )}

      {items.length === 0 && (
        <Card><EmptyState icon="trending-up-outline" title={t("Aún no registras inversiones")} sub={t("Agrega tus CDTs, acciones o cripto para ver su rentabilidad.")} /></Card>
      )}

      {items.map((i, idx) => {
        const gain = Number(i.current_value) - Number(i.amount_invested);
        const p = Number(i.amount_invested) > 0 ? (gain / Number(i.amount_invested)) * 100 : 0;
        const color = gain >= 0 ? theme.income : theme.expense;
        return (
          <FadeIn key={i.id} delay={idx * 40}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <IconCircle name={INVESTMENT_ICON[i.type]} color={theme.invest} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{i.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{investmentTypeLabel(i.type)}{i.institution ? ` · ${i.institution}` : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={{ color: theme.text, fontWeight: "800" }}>{money(Number(i.current_value), i.currency)}</Text>
                  <Badge label={`${gain >= 0 ? "+" : ""}${p.toFixed(1)}%`} color={color} icon={gain >= 0 ? "trending-up" : "trending-down"} />
                </View>
              </View>
            </Card>
          </FadeIn>
        );
      })}
    </Screen>
  );
}
