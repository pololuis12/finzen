import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, GradientCard, Field, Button, Chip, IconCircle, IconButton, EmptyState, FadeIn, Label, Muted, ToggleRow,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { ACCOUNT_ICON, accountTypeLabel } from "../../constants/icons";
import { money, parseAmount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAutoReload } from "../../lib/dataEvents";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getAccountBalances, createAccount, archiveAccount, convertInitialBalanceToIncome } from "../../lib/queries";
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
  const [asIncome, setAsIncome] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await getAccountBalances()); } catch (e) { console.warn(e); }
  }, []);
  useAutoReload(load);

  async function save() {
    if (!name.trim()) return notify(t("Escribe un nombre"));
    setBusy(true);
    try {
      await createAccount({ name: name.trim(), bank: bank.trim() || null, type, initial_balance: parseAmount(initial) }, { initialAsIncome: asIncome });
      setName(""); setBank(""); setInitial(""); setShow(false);
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function archive(a: AccountBalance) {
    if (!(await confirm(t("¿Archivar la cuenta {name}? Sus movimientos se conservan.", { name: a.name }), { okLabel: t("Archivar") }))) return;
    try { await archiveAccount(a.account_id); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  async function toIncome(a: AccountBalance) {
    const ok = await confirm(t("¿Registrar los {amount} del saldo inicial de {name} como ingreso de hoy? Así aparecerán en Ingresos del mes. El saldo de la cuenta no cambia.", {
      amount: money(a.initial_balance, a.currency), name: a.name,
    }), { okLabel: t("Registrar ingreso") });
    if (!ok) return;
    try { await convertInitialBalanceToIncome(a); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  const total = items.reduce((s, a) => s + a.current_balance, 0);

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Cuentas y bancos")}
      right={<IconButton name={show ? "close" : "add"} onPress={() => setShow((v) => !v)} bg={theme.primary} color="#fff" />} />}>
      {show && (
        <FadeIn>
          <Card style={{ gap: 12 }}>
            <Field label={t("Nombre")} icon="pricetag-outline" value={name} onChangeText={setName} placeholder={t("Ej: Cuenta de ahorros")} />
            <Field label={t("Banco")} icon="business-outline" value={bank} onChangeText={setBank} placeholder={t("Ej: Bancolombia, Nu, Nequi")} />
            <Label>{t("Tipo")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map((k) => <Chip key={k} label={accountTypeLabel(k)} icon={ACCOUNT_ICON[k]} active={type === k} onPress={() => setType(k)} />)}
            </View>
            <Field label={t("Saldo inicial")} icon="cash-outline" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" />
            {parseAmount(initial) > 0 && (
              <ToggleRow icon="arrow-down-circle-outline" label={t("Contarlo como ingreso de este mes")} value={asIncome} onChange={setAsIncome}
                sub={asIncome ? t("Ej: tu nómina. Aparecerá en Ingresos del mes.") : t("Solo saldo inicial: no suma en Ingresos del mes.")} />
            )}
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
              {a.initial_balance > 0 && (
                <Pressable onPress={() => toIncome(a)} hitSlop={6} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="arrow-down-circle-outline" size={15} color={theme.income} />
                  <Text style={{ color: theme.income, fontSize: 12, fontWeight: "700", flex: 1 }}>
                    {t("Saldo inicial {amount}: registrarlo como ingreso del mes", { amount: money(a.initial_balance, a.currency) })}
                  </Text>
                </Pressable>
              )}
            </Card>
          </Pressable>
        </FadeIn>
      ))}
      {items.length > 0 && <Muted style={{ textAlign: "center" }}>{t("Mantén presionada una cuenta para archivarla")}</Muted>}
    </Screen>
  );
}
