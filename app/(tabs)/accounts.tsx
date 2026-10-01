import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Screen, ScreenHeader, Card, GradientCard, Field, Button, Chip, IconCircle, IconButton, EmptyState, FadeIn, Label, Muted,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { ACCOUNT_ICON, accountTypeLabel } from "../../constants/icons";
import { money, parseAmount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getAccountBalances, createAccount, archiveAccount } from "../../lib/queries";
import type { AccountBalance, AccountType } from "../../lib/types";

const TYPES: AccountType[] = ["savings", "checking", "cash", "credit", "investment"];

export default function Accounts() {
  useSettings();
  const [items, setItems] = useState<AccountBalance[]>([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState<AccountType>("savings");
  const [initial, setInitial] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getAccountBalances()); } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!name.trim()) return notify(t("Escribe un nombre"));
    setBusy(true);
    try {
      await createAccount({ name: name.trim(), bank: bank.trim() || null, type, initial_balance: parseAmount(initial) });
      setName(""); setBank(""); setInitial(""); setShow(false);
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function archive(a: AccountBalance) {
    if (!(await confirm(t("¿Archivar la cuenta {name}? Sus movimientos se conservan.", { name: a.name }), { okLabel: t("Archivar") }))) return;
    try { await archiveAccount(a.account_id); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  const total = items.reduce((s, a) => s + a.current_balance, 0);

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Cuentas y bancos")}
      right={<IconButton name={show ? "close" : "add"} onPress={() => setShow((v) => !v)} bg={theme.primary} color="#fff" />} />}>
      {show && (
        <FadeIn>
          <Card style={{ gap: 12 }}>
            <Field label={t("Nombre")} icon="pricetag-outline" value={name} onChangeText={setName} placeholder={t("Ej: Nómina")} />
            <Field label={t("Banco")} icon="business-outline" value={bank} onChangeText={setBank} placeholder={t("Ej: Bancolombia, Nu, Nequi")} />
            <Label>{t("Tipo")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map((k) => <Chip key={k} label={accountTypeLabel(k)} icon={ACCOUNT_ICON[k]} active={type === k} onPress={() => setType(k)} />)}
            </View>
            <Field label={t("Saldo inicial")} icon="cash-outline" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" />
            <Button label={t("Crear cuenta")} icon="checkmark" onPress={save} loading={busy} />
          </Card>
        </FadeIn>
      )}

      <GradientCard colors={theme.gradients.dark}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{t("Total disponible")}</Text>
        <Text style={{ color: theme.text, fontSize: 30, fontWeight: "900", marginTop: 4 }}>{money(total)}</Text>
      </GradientCard>

      {items.length === 0 && (
        <Card><EmptyState icon="wallet-outline" title={t("Sin cuentas todavía")} sub={t("Crea tu primera cuenta para empezar a registrar movimientos.")}
          action={{ label: t("Crear cuenta"), onPress: () => setShow(true) }} /></Card>
      )}

      {items.map((a, i) => (
        <FadeIn key={a.account_id} delay={i * 40}>
          <Pressable onPress={() => router.push({ pathname: "/(tabs)/transactions" })} onLongPress={() => archive(a)}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <IconCircle name={ACCOUNT_ICON[a.type]} color={theme.transfer} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>{a.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{a.bank ? `${a.bank} · ` : ""}{accountTypeLabel(a.type)}</Text>
                </View>
                <Text style={{ color: a.current_balance >= 0 ? theme.text : theme.expense, fontWeight: "900", fontSize: 17 }}>
                  {money(a.current_balance, a.currency)}
                </Text>
              </View>
            </Card>
          </Pressable>
        </FadeIn>
      ))}
      {items.length > 0 && <Muted style={{ textAlign: "center" }}>{t("Mantén presionada una cuenta para archivarla")}</Muted>}
    </Screen>
  );
}
