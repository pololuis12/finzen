import { useCallback, useRef, useState } from "react";
import {
  View, Text, ScrollView, Platform, ActivityIndicator, Pressable, TextInput,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardSafe, IconCircle, FadeIn, ScreenHeader } from "../../components/UI";
import { useSettings } from "../../components/settings";
import { theme } from "../../constants/theme";
import { t } from "../../lib/i18n";
import { askAI, getAIMessages } from "../../lib/queries";

type Msg = { role: "user" | "assistant"; content: string };

export default function Assistant() {
  useSettings();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const SUGGESTIONS = [
    { icon: "bar-chart-outline" as const, text: t("¿Cómo va mi balance este mes?") },
    { icon: "flame-outline" as const, text: t("¿En qué estoy gastando de más?") },
    { icon: "trending-up-outline" as const, text: t("Dame un plan para ahorrar") },
    { icon: "people-outline" as const, text: t("¿Cuánto me deben en total?") },
  ];

  const load = useCallback(async () => {
    try {
      const m = await getAIMessages();
      setMsgs(m.map((x: { role: Msg["role"]; content: string }) => ({ role: x.role, content: x.content })));
    } catch (e) { console.warn(e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const reply = await askAI(q);
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: t("No pude responder. Revisa que la función 'ai-assistant' esté desplegada y con ANTHROPIC_API_KEY.") }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      <KeyboardSafe>
        <ScreenHeader title={t("Asistente FinZen")} sub={t("Analiza tus finanzas reales y te aconseja")} />

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}>
          {msgs.length === 0 && (
            <View style={{ gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.text} onPress={() => send(s.text)}
                  style={({ pressed }) => [{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    backgroundColor: theme.card, borderColor: theme.borderSoft, borderWidth: 1,
                    borderRadius: theme.radiusSm, padding: 14, opacity: pressed ? 0.8 : 1,
                  }]}>
                  <IconCircle name={s.icon} size={34} color={theme.primary} />
                  <Text style={{ color: theme.text, flex: 1 }}>{s.text}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.mutedDim} />
                </Pressable>
              ))}
            </View>
          )}
          {msgs.map((m, i) => (
            <FadeIn key={i} delay={0} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              <View style={{ flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                {m.role === "assistant" && <IconCircle name="sparkles" size={26} color={theme.primary} />}
                <View style={{
                  backgroundColor: m.role === "user" ? theme.primary : theme.card, borderRadius: 16, padding: 12,
                  borderWidth: m.role === "user" ? 0 : 1, borderColor: theme.borderSoft,
                }}>
                  <Text style={{ color: m.role === "user" ? "#fff" : theme.text, lineHeight: 20 }}>{m.content}</Text>
                </View>
              </View>
            </FadeIn>
          ))}
          {busy && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <IconCircle name="sparkles" size={26} color={theme.primary} />
              <ActivityIndicator color={theme.primary} />
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.borderSoft }}>
          <TextInput
            value={input} onChangeText={setInput} placeholder={t("Pregunta sobre tu dinero…")}
            placeholderTextColor={theme.mutedDim} onSubmitEditing={() => send()}
            style={{ flex: 1, backgroundColor: theme.cardAlt, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, color: theme.text, borderWidth: 1.5, borderColor: theme.border }}
          />
          <Pressable onPress={() => send()} disabled={busy || !input.trim()} style={{ opacity: busy || !input.trim() ? 0.5 : 1 }}>
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardSafe>
    </SafeAreaView>
  );
}
