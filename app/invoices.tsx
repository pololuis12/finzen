import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, Image, Modal, Linking, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen, ScreenHeader, Card, Field, Chip, ChipRow, EmptyState, StatTile, Loading, Button, IconButton,
} from "../components/UI";
import { useSettings } from "../components/settings";
import { theme } from "../constants/theme";
import { money, shortDate, formatBytes } from "../lib/format";
import { t } from "../lib/i18n";
import { notify, errorMessage } from "../lib/alert";
import { getAttachments } from "../lib/queries";
import { signedUrls } from "../lib/attachments";
import type { Attachment } from "../lib/types";

export default function Invoices() {
  useSettings();
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "pdf">("all");
  const [viewer, setViewer] = useState<Attachment | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await getAttachments();
      setItems(a);
      setUrls(await signedUrls("attachments", a.map((x) => x.storage_path)));
    } catch (e) { notify(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (kind === "pdf" && a.kind !== "pdf") return false;
      if (kind === "image" && a.kind === "pdf") return false;
      if (!q) return true;
      return [a.file_name, a.transactions?.description ?? "", String(a.transactions?.amount ?? "")].some((s) => s.toLowerCase().includes(q));
    });
  }, [items, search, kind]);

  const totalSize = items.reduce((a, x) => a + (x.size_bytes ?? 0), 0);
  const original = items.reduce((a, x) => a + (x.original_size_bytes ?? x.size_bytes ?? 0), 0);

  function open(a: Attachment) {
    const url = urls[a.storage_path];
    if (!url) return;
    if (a.mime_type.startsWith("image/")) setViewer(a);
    else if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  }

  return (
    <Screen onRefresh={load} header={<ScreenHeader title={t("Facturas")} sub={t("Fotos, imágenes y PDF de tus gastos")}
      right={<IconButton name="add" bg={theme.primary} color="#fff" onPress={() => router.push({ pathname: "/transaction-form", params: { type: "expense" } })} />} />}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatTile icon="documents-outline" label={t("Archivos")} value={String(items.length)} />
        <StatTile icon="cloud-done-outline" label={t("Espacio usado")} value={formatBytes(totalSize)}
          sub={original > totalSize ? t("Ahorrado por compresión: {n}", { n: formatBytes(original - totalSize) }) : undefined} />
      </View>
      <Field icon="search-outline" value={search} onChangeText={setSearch} placeholder={t("Buscar por nombre, gasto o valor…")} />
      <ChipRow>
        <Chip label={t("Todas")} active={kind === "all"} onPress={() => setKind("all")} />
        <Chip label={t("Imágenes")} icon="image-outline" active={kind === "image"} onPress={() => setKind("image")} />
        <Chip label="PDF" icon="document-text-outline" active={kind === "pdf"} onPress={() => setKind("pdf")} />
      </ChipRow>

      {loading ? <Loading /> : shown.length === 0 ? (
        <Card><EmptyState icon="receipt-outline" title={t("Sin facturas")} sub={t("Adjunta fotos o PDF desde el detalle de cada gasto.")} /></Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {shown.map((a) => (
            <Pressable key={a.id} onPress={() => open(a)} style={{ width: "48%" }}>
              <Card style={{ padding: 8, gap: 6 }}>
                {a.mime_type.startsWith("image/") && urls[a.storage_path]
                  ? <Image source={{ uri: urls[a.storage_path] }} style={{ width: "100%", height: 120, borderRadius: 12, backgroundColor: theme.cardAlt }} />
                  : <View style={{ height: 120, borderRadius: 12, backgroundColor: theme.cardAlt, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text" size={44} color={theme.expense} />
                  </View>}
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
                  {a.transactions?.description || a.file_name}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>
                  {a.transactions ? `${money(Number(a.transactions.amount), a.transactions.currency)} · ${shortDate(a.transactions.occurred_at)}` : formatBytes(a.size_bytes)}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", padding: 16, gap: 14 }}>
          {viewer && <Image source={{ uri: urls[viewer.storage_path] }} style={{ width: "100%", height: "70%" }} resizeMode="contain" />}
          {viewer?.transaction_id && (
            <Button label={t("Ver gasto relacionado")} icon="receipt-outline" tone="soft"
              onPress={() => { const id = viewer.transaction_id!; setViewer(null); router.push({ pathname: "/transaction/[id]", params: { id } }); }} />
          )}
          <Button label={t("Cerrar")} tone="ghost" onPress={() => setViewer(null)} />
        </View>
      </Modal>
    </Screen>
  );
}
