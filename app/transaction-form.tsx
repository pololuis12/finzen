import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, Button, SegBar, Chip, ChipRow, DateField, ToggleRow, Label, ActionSheet,
  IconCircle, Loading, Muted, withAlpha,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import {
  safeIcon, paymentMethodLabel, PAYMENT_METHOD_ICON, INCOME_METHODS, EXPENSE_METHODS, expenseTypeLabel, frequencyLabel,
} from "../constants/icons";
import { parseAmount, todayISO, formatBytes, money, longDate } from "../lib/format";
import { nextDueDate } from "../lib/recurring";
import { scheduleRecurringReminders } from "../lib/notifications";
import { t } from "../lib/i18n";
import { notify, confirm, errorMessage } from "../lib/alert";
import {
  getCategories, getAccountBalances, getTransaction, saveTransaction, deleteTransaction, getAttachments,
  saveRecurringPayment, deleteRecurringPayment, getRecurringPayments, createAccount, ensureExtraCategories,
} from "../lib/queries";
import {
  takePhoto, pickImage, pickDocument, uploadAttachment, deleteAttachment, currentLocation, type LocalFile,
} from "../lib/attachments";
import type { Category, AccountBalance, TxType, ExpenseType, PaymentMethod, Attachment, Frequency, AccountType } from "../lib/types";

// Frecuencias ofrecidas al registrar un gasto fijo (p. ej. arriendo mensual, universidad semestral)
const REPEAT_OPTIONS: Frequency[] = ["monthly", "bimonthly", "quarterly", "semiannual", "annual"];

export default function TransactionForm() {
  useSettings();
  const params = useLocalSearchParams<{ id?: string; type?: TxType; ant?: string }>();
  const editing = !!params.id;
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<AccountBalance[]>([]);

  const [type, setType] = useState<TxType>(params.type ?? "expense");
  const [expType, setExpType] = useState<ExpenseType>(params.ant ? "casual" : "normal");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedAccountId, setAccountId] = useState<string | null>(null);
  const accountId = selectedAccountId;
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [isAnt, setIsAnt] = useState(!!params.ant);
  const [repeat, setRepeat] = useState<Frequency | null>(null);
  const [loc, setLoc] = useState<{ latitude: number | null; longitude: number | null; name: string }>({ latitude: null, longitude: null, name: "" });
  const [pending, setPending] = useState<LocalFile[]>([]);
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureExtraCategories().catch(() => {});
        const [c, a] = await Promise.all([getCategories(), getAccountBalances()]);
        setCats(c); setAccts(a);
        if (params.id) {
          const tx = await getTransaction(params.id);
          if (tx) {
            setType(tx.type); setExpType(tx.expense_type ?? "normal"); setAmount(String(tx.amount));
            setDate(tx.occurred_at); setCategoryId(tx.category_id); setAccountId(tx.account_id);
            setToAccountId(tx.to_account_id); setMethod(tx.payment_method); setDesc(tx.description ?? "");
            setNotes(tx.notes ?? ""); setIsAnt(tx.is_ant);
            setLoc({ latitude: tx.latitude, longitude: tx.longitude, name: tx.location_name ?? "" });
            setExisting(await getAttachments(tx.id));
          }
        } else if (a[0]) setAccountId(a[0].account_id);
      } catch (e) { notify(errorMessage(e)); }
      finally { setLoading(false); }
    })();
  }, [params.id]);

  const kindCats = useMemo(() => {
    const list = cats.filter((c) => (type === "income" ? c.kind === "income" : c.kind === "expense"));
    // En modo hormiga, primero sus categorías
    return isAnt ? [...list.filter((c) => c.is_ant), ...list.filter((c) => !c.is_ant)] : list.filter((c) => !c.is_ant || c.id === categoryId);
  }, [cats, type, isAnt, categoryId]);

  function pickCategory(c: Category) {
    setCategoryId(c.id);
    if (c.expense_type) setExpType(c.expense_type);
    if (c.is_ant) setIsAnt(true);
  }

  async function addFile(fn: () => Promise<LocalFile | null>) {
    try { const f = await fn(); if (f) setPending((p) => [...p, f]); }
    catch (e) { notify(errorMessage(e)); }
  }

  async function addLocation() {
    setLocBusy(true);
    try {
      const l = await currentLocation();
      setLoc({ latitude: l.latitude, longitude: l.longitude, name: l.name ?? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` });
    } catch (e) { notify(errorMessage(e)); }
    finally { setLocBusy(false); }
  }

  /** Crea una cuenta sin salir del formulario y la deja seleccionada. */
  async function quickAccount(name: string, kind: AccountType): Promise<string | null> {
    try {
      const id = await createAccount({ name, type: kind, initial_balance: 0 });
      setAccts(await getAccountBalances());
      setAccountId(id);
      return id;
    } catch (e) { notify(errorMessage(e)); return null; }
  }

  async function save() {
    const value = parseAmount(amount);
    if (!value || value <= 0) return notify(t("Escribe un valor válido"));
    let accountId = selectedAccountId;
    if (!accountId && accts.length === 0) {
      const ok = await confirm(t("Aún no tienes cuentas. ¿Creamos la cuenta «Efectivo» y guardamos el movimiento ahí? Luego puedes crear tus cuentas de banco en Más → Cuentas."),
        { okLabel: t("Crear y guardar") });
      if (!ok) return;
      accountId = await quickAccount(t("Efectivo"), "cash");
      if (!accountId) return;
    }
    if (!accountId) return notify(t("Selecciona una cuenta (créala en Más → Cuentas)"));
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return notify(t("Elige una cuenta destino diferente"));
    const repeating = !editing && type === "expense" && repeat ? repeat : null;
    setBusy(true);
    let recurringId: string | null = null;
    try {
      if (repeating) {
        // El gasto de hoy queda registrado y el pago recurrente arranca en el siguiente periodo
        const cat = cats.find((c) => c.id === categoryId);
        recurringId = await saveRecurringPayment({
          name: desc.trim() || cat?.name || t("Gasto fijo"), amount: value, frequency: repeating,
          due_date: nextDueDate(date, repeating)!, last_paid_at: date, status: "active",
          category_id: categoryId, account_id: accountId, payment_method: method,
        });
      }
      const id = await saveTransaction({
        id: params.id, type, amount: value, occurred_at: date, recurring_payment_id: recurringId ?? undefined,
        expense_type: type === "expense" ? expType : null,
        category_id: type === "transfer" ? null : categoryId,
        account_id: accountId, to_account_id: type === "transfer" ? toAccountId : null,
        payment_method: type === "transfer" ? "transfer" : method,
        description: desc.trim() || null, notes: notes.trim() || null,
        is_ant: type === "expense" && isAnt,
        latitude: loc.latitude, longitude: loc.longitude, location_name: loc.name.trim() || null,
      });
      for (const f of pending) await uploadAttachment(id, f);
      if (recurringId) scheduleRecurringReminders(await getRecurringPayments()).catch(() => {});
      router.back();
    } catch (e) {
      if (recurringId) await deleteRecurringPayment(recurringId).catch(() => {});
      notify(errorMessage(e));
    }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!params.id || !(await confirm(t("¿Eliminar este movimiento y sus facturas?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteTransaction(params.id); router.dismissAll?.(); router.replace("/(tabs)/transactions"); }
    catch (e) { notify(errorMessage(e)); }
  }

  async function removeExisting(a: Attachment) {
    if (!(await confirm(t("¿Eliminar esta factura?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteAttachment(a); setExisting((x) => x.filter((y) => y.id !== a.id)); }
    catch (e) { notify(errorMessage(e)); }
  }

  const color = type === "income" ? theme.income : type === "expense" ? (isAnt ? theme.ant : theme.expense) : theme.transfer;
  const methods = type === "income" ? INCOME_METHODS : EXPENSE_METHODS;
  const preview = parseAmount(amount);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Screen header={<ScreenHeader title={editing ? t("Editar movimiento") : t("Nuevo movimiento")}
        right={editing ? <Pressable onPress={remove} hitSlop={8}><Ionicons name="trash-outline" size={22} color={theme.expense} /></Pressable> : undefined} />}>
        {loading ? <Loading /> : (
          <>
            <SegBar value={type} onChange={(v) => { setType(v); setCategoryId(null); setMethod(null); }} options={[
              { key: "income", label: t("Ingreso"), icon: "arrow-down-circle-outline" },
              { key: "expense", label: t("Gasto"), icon: "arrow-up-circle-outline" },
              { key: "transfer", label: t("Transf."), icon: "swap-horizontal-outline" },
            ]} />

            <Card style={{ gap: 14, borderColor: withAlpha(color, 0.35) }}>
              <Field label={t("Valor")} icon="cash-outline" value={amount} onChangeText={setAmount}
                keyboardType="decimal-pad" placeholder="0" style={{ fontSize: 22, fontWeight: "800", color }} />
              {preview > 0 && <Muted style={{ marginTop: -8 }}>{money(preview)}</Muted>}
              <DateField label={t("Fecha")} value={date} onChange={(d) => d && setDate(d)} />
              <Field label={type === "income" ? t("Concepto") : t("Descripción")} icon="create-outline" value={desc} onChangeText={setDesc}
                placeholder={type === "income" ? t("Ej: Nómina de septiembre") : t("Ej: Almuerzo con el equipo")} />
            </Card>

            {type === "expense" && (
              <Card style={{ gap: 10 }}>
                <ToggleRow icon="cafe-outline" label={`🐜 ${t("Gasto hormiga")}`} sub={t("Pequeños gastos cotidianos: café, snacks, propinas…")}
                  value={isAnt} onChange={setIsAnt} />
                <Label>{t("Tipo de gasto")}</Label>
                <SegBar value={expType} onChange={setExpType} options={[
                  { key: "fixed", label: expenseTypeLabel("fixed") },
                  { key: "normal", label: expenseTypeLabel("normal") },
                  { key: "casual", label: expenseTypeLabel("casual") },
                ]} />
                {!editing && (
                  <>
                    <Label>{t("¿Se repite?")}</Label>
                    <ChipRow>
                      <Chip label={t("No se repite")} active={!repeat} onPress={() => setRepeat(null)} />
                      {REPEAT_OPTIONS.map((f) => (
                        <Chip key={f} label={frequencyLabel(f)} icon="repeat-outline" color={theme.expenseTypes.fixed}
                          active={repeat === f} onPress={() => { setRepeat(f); setExpType("fixed"); setIsAnt(false); }} />
                      ))}
                    </ChipRow>
                    {repeat && (
                      <Muted>{t("Próximo pago: {date}. Aparecerá en Próximos pagos con recordatorio para confirmarlo.", { date: longDate(nextDueDate(date, repeat)!) })}</Muted>
                    )}
                  </>
                )}
              </Card>
            )}

            {type !== "transfer" && (
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Label>{t("Categoría")}</Label>
                  <Pressable onPress={() => router.push("/categories")} hitSlop={8}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>{t("Administrar")}</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {kindCats.map((c) => (
                    <Chip key={c.id} label={c.name} icon={safeIcon(c.icon)} color={c.color ?? color}
                      active={c.id === categoryId} onPress={() => pickCategory(c)} />
                  ))}
                </View>
              </Card>
            )}

            <Card style={{ gap: 10 }}>
              <Label>{type === "transfer" ? t("Cuenta origen") : t("Cuenta")}</Label>
              {accts.length === 0 && <Muted>{t("Aún no tienes cuentas: crea una aquí para guardar el movimiento.")}</Muted>}
              <ChipRow>
                {accts.length === 0 && (
                  <>
                    <Chip label={t("+ Efectivo")} icon="cash-outline" color={color} active={false} onPress={() => quickAccount(t("Efectivo"), "cash")} />
                    <Chip label={t("+ Cuenta bancaria")} icon="card-outline" color={color} active={false} onPress={() => quickAccount(t("Cuenta bancaria"), "savings")} />
                  </>
                )}
                {accts.map((a) => (
                  <Chip key={a.account_id} label={a.name} icon="wallet-outline" color={color}
                    active={a.account_id === accountId} onPress={() => setAccountId(a.account_id)} />
                ))}
              </ChipRow>
              {type === "transfer" ? (
                <>
                  <Label>{t("Cuenta destino")}</Label>
                  <ChipRow>
                    {accts.filter((a) => a.account_id !== accountId).map((a) => (
                      <Chip key={a.account_id} label={a.name} icon="enter-outline" color={color}
                        active={a.account_id === toAccountId} onPress={() => setToAccountId(a.account_id)} />
                    ))}
                  </ChipRow>
                </>
              ) : (
                <>
                  <Label>{type === "income" ? t("Método de ingreso") : t("Forma de pago")}</Label>
                  <ChipRow>
                    {methods.map((m) => (
                      <Chip key={m} label={paymentMethodLabel(m)} icon={PAYMENT_METHOD_ICON[m]} color={color}
                        active={method === m} onPress={() => setMethod(method === m ? null : m)} />
                    ))}
                  </ChipRow>
                </>
              )}
            </Card>

            <Card style={{ gap: 12 }}>
              <Field label={t("Observaciones")} icon="chatbox-ellipses-outline" value={notes} onChangeText={setNotes}
                placeholder={t("Opcional")} multiline />
              {type === "expense" && (
                <>
                  <Label>{t("Ubicación")}</Label>
                  <Field icon="location-outline" value={loc.name} onChangeText={(v) => setLoc((l) => ({ ...l, name: v }))}
                    placeholder={t("Lugar del gasto (opcional)")}
                    right={loc.name ? <Pressable hitSlop={8} onPress={() => setLoc({ latitude: null, longitude: null, name: "" })}>
                      <Ionicons name="close-circle" size={18} color={theme.mutedDim} /></Pressable> : undefined} />
                  <Button label={t("Usar mi ubicación actual")} icon="navigate-outline" tone="soft" compact loading={locBusy} onPress={addLocation} />
                </>
              )}
            </Card>

            {type !== "transfer" && (
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Label>{t("Facturas y soportes")}</Label>
                  <Text style={{ color: theme.mutedDim, fontSize: 11 }}>{t("Las imágenes se comprimen automáticamente")}</Text>
                </View>
                {existing.map((a) => (
                  <FileRow key={a.id} name={a.file_name} kind={a.kind} size={a.size_bytes} original={a.original_size_bytes}
                    onRemove={() => removeExisting(a)} />
                ))}
                {pending.map((f, i) => (
                  <FileRow key={f.uri} name={f.name} kind={f.kind} size={f.size} original={f.originalSize} uri={f.kind !== "pdf" ? f.uri : undefined}
                    pending onRemove={() => setPending((p) => p.filter((_, j) => j !== i))} />
                ))}
                <Button label={t("Adjuntar factura")} icon="attach-outline" tone="ghost" onPress={() => setSheet(true)} />
              </Card>
            )}

            <Button label={editing ? t("Guardar cambios") : t("Guardar movimiento")} icon="checkmark" onPress={save} loading={busy} />
          </>
        )}
      </Screen>
      <ActionSheet visible={sheet} onClose={() => setSheet(false)} title={t("Adjuntar factura")} options={[
        ...(Platform.OS !== "web" ? [{ label: t("Tomar foto"), icon: "camera-outline" as const, onPress: () => addFile(takePhoto) }] : []),
        { label: t("Elegir imagen"), icon: "image-outline", onPress: () => addFile(pickImage) },
        { label: t("Archivo PDF"), icon: "document-outline", onPress: () => addFile(pickDocument) },
      ]} />
    </View>
  );
}

function FileRow({ name, kind, size, original, uri, pending, onRemove }: {
  name: string; kind: string; size?: number | null; original?: number | null; uri?: string; pending?: boolean; onRemove: () => void;
}) {
  const saved = original && size && original > size ? t(" · comprimida de {from}", { from: formatBytes(original) }) : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {uri ? <Image source={{ uri }} style={{ width: 40, height: 40, borderRadius: 8 }} />
        : <IconCircle name={kind === "pdf" ? "document-text-outline" : "image-outline"} size={40} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: theme.muted, fontSize: 11 }}>{formatBytes(size)}{saved}{pending ? ` · ${t("pendiente")}` : ""}</Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}><Ionicons name="close-circle-outline" size={20} color={theme.expense} /></Pressable>
    </View>
  );
}
