import { useCallback, useState } from "react";
import { View, Text, Pressable, Image, Modal, Linking, Platform } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Button, IconButton, IconCircle, Badge, ActionSheet, Loading, ListRow, Muted,
} from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { safeIcon, txTypeLabel, paymentMethodLabel, expenseTypeLabel, TX_TYPE_ICON } from "../../constants/icons";
import { money, longDate, formatBytes, dateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { notify, confirm, errorMessage } from "../../lib/alert";
import { getTransaction, getCategories, getAccountBalances, getAttachments, deleteTransaction } from "../../lib/queries";
import {
  signedUrls, takePhoto, pickImage, pickDocument, uploadAttachment, deleteAttachment, mapsUrl, type LocalFile,
} from "../../lib/attachments";
import type { Transaction, Category, AccountBalance, Attachment } from "../../lib/types";

export default function TransactionDetail() {
  useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [cat, setCat] = useState<Category | null>(null);
  const [accts, setAccts] = useState<AccountBalance[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [x, cats, a, att] = await Promise.all([getTransaction(id), getCategories(), getAccountBalances(), getAttachments(id)]);
      setTx(x); setAccts(a); setFiles(att);
      setCat(x?.category_id ? cats.find((c) => c.id === x.category_id) ?? null : null);
      setUrls(await signedUrls("attachments", att.map((f) => f.storage_path)));
    } catch (e) { notify(errorMessage(e)); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add(fn: () => Promise<LocalFile | null>) {
    try {
      const f = await fn();
      if (!f) return;
      setUploading(true);
      await uploadAttachment(id, f);
      await load();
    } catch (e) { notify(errorMessage(e)); }
    finally { setUploading(false); }
  }

  async function open(a: Attachment) {
    const url = urls[a.storage_path];
    if (!url) return;
    if (a.mime_type.startsWith("image/")) setViewer(url);
    else if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  }

  async function removeFile(a: Attachment) {
    if (!(await confirm(t("¿Eliminar esta factura?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteAttachment(a); await load(); } catch (e) { notify(errorMessage(e)); }
  }

  async function remove() {
    if (!(await confirm(t("¿Eliminar este movimiento y sus facturas?"), { destructive: true, okLabel: t("Eliminar") }))) return;
    try { await deleteTransaction(id); router.back(); } catch (e) { notify(errorMessage(e)); }
  }

  if (loading || !tx) return <Screen header={<ScreenHeader title={t("Movimiento")} />}>{loading ? <Loading /> : <Muted>{t("No encontrado")}</Muted>}</Screen>;

  const color = tx.type === "income" ? theme.income : tx.type === "expense" ? (tx.is_ant ? theme.ant : theme.expense) : theme.transfer;
  const acct = (aid: string | null) => accts.find((a) => a.account_id === aid)?.name ?? "—";

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Detalle")} right={
      <View style={{ flexDirection: "row", gap: 8 }}>
        <IconButton name="create-outline" onPress={() => router.push({ pathname: "/transaction-form", params: { id } })} />
        <IconButton name="trash-outline" color={theme.expense} onPress={remove} />
      </View>
    } />}>
      <Card style={{ alignItems: "center", gap: 8 }}>
        <IconCircle name={cat?.icon ? safeIcon(cat.icon) : TX_TYPE_ICON[tx.type]} color={cat?.color ?? color} size={56} />
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
          {tx.description || cat?.name || txTypeLabel(tx.type)}
        </Text>
        <Text style={{ color, fontWeight: "900", fontSize: 30 }}>
          {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}{money(Number(tx.amount), tx.currency)}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          <Badge label={txTypeLabel(tx.type)} color={color} />
          {tx.expense_type && <Badge label={expenseTypeLabel(tx.expense_type)} color={theme.expenseTypes[tx.expense_type]} />}
          {tx.is_ant && <Badge label={`🐜 ${t("Hormiga")}`} color={theme.ant} />}
          {tx.recurring_payment_id && <Badge label={t("Pago recurrente")} icon="repeat" color={theme.primary} />}
        </View>
      </Card>

      <Card style={{ gap: 0 }}>
        <ListRow icon="calendar-outline" label={longDate(tx.occurred_at)} sub={t("Fecha")} />
        {cat && <ListRow icon={safeIcon(cat.icon)} color={cat.color ?? theme.primary} label={cat.name} sub={t("Categoría")} />}
        <ListRow icon="wallet-outline" label={tx.type === "transfer" ? `${acct(tx.account_id)} → ${acct(tx.to_account_id)}` : acct(tx.account_id)} sub={t("Cuenta")} />
        {tx.payment_method && <ListRow icon="card-outline" label={paymentMethodLabel(tx.payment_method)} sub={tx.type === "income" ? t("Método de ingreso") : t("Forma de pago")} />}
        {tx.notes && <ListRow icon="chatbox-ellipses-outline" label={tx.notes} sub={t("Observaciones")} />}
        {tx.location_name && (
          <ListRow icon="location-outline" label={tx.location_name} sub={tx.latitude != null ? t("Toca para abrir el mapa") : t("Ubicación")}
            onPress={tx.latitude != null && tx.longitude != null ? () => Linking.openURL(mapsUrl(tx.latitude!, tx.longitude!)) : undefined} />
        )}
        <ListRow icon="time-outline" label={dateTime(tx.created_at)} sub={t("Registrado")} />
      </Card>

      {tx.type !== "transfer" && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{t("Facturas ({n})", { n: files.length })}</Text>
          {files.length === 0 && <Muted>{t("Sin facturas adjuntas.")}</Muted>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {files.map((f) => (
              <Pressable key={f.id} onPress={() => open(f)} onLongPress={() => removeFile(f)}
                style={{ width: 96, gap: 4 }}>
                {f.mime_type.startsWith("image/") && urls[f.storage_path]
                  ? <Image source={{ uri: urls[f.storage_path] }} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: theme.cardAlt }} />
                  : <View style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: theme.cardAlt, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text" size={36} color={theme.expense} />
                    <Text style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>PDF</Text>
                  </View>}
                <Text style={{ color: theme.muted, fontSize: 10 }} numberOfLines={1}>{formatBytes(f.size_bytes)}</Text>
              </Pressable>
            ))}
          </View>
          {files.length > 0 && <Text style={{ color: theme.mutedDim, fontSize: 11 }}>{t("Toca para ver · mantén presionado para eliminar")}</Text>}
          <Button label={t("Adjuntar factura")} icon="attach-outline" tone="soft" loading={uploading} onPress={() => setSheet(true)} />
        </Card>
      )}

      <ActionSheet visible={sheet} onClose={() => setSheet(false)} title={t("Adjuntar factura")} options={[
        ...(Platform.OS !== "web" ? [{ label: t("Tomar foto"), icon: "camera-outline" as const, onPress: () => add(takePhoto) }] : []),
        { label: t("Elegir imagen"), icon: "image-outline", onPress: () => add(pickImage) },
        { label: t("Archivo PDF"), icon: "document-outline", onPress: () => add(pickDocument) },
      ]} />

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />}
          <View style={{ position: "absolute", top: 48, right: 20 }}>
            <Ionicons name="close" size={30} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}
