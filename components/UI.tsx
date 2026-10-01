import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, Modal, ScrollView, Switch, Image,
  ActivityIndicator, ViewStyle, TextStyle, Animated, Platform, RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { theme } from "../constants/theme";
import { t } from "../lib/i18n";
import { longDate, parseISODate, toISODate, isValidISODate } from "../lib/format";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Gradient = readonly [string, string, ...string[]];

// ---------------- Layout ----------------

export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 380, delay, useNativeDriver: Platform.OS !== "web" }).start();
  }, []);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );
}

/** Pantalla estándar: fondo, área segura y scroll con "jalar para actualizar". */
export function Screen({ children, onRefresh, header, scroll = true, padded = true }: {
  children: React.ReactNode; onRefresh?: () => Promise<void> | void; header?: React.ReactNode;
  scroll?: boolean; padded?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const content = { padding: padded ? 16 : 0, gap: 14, paddingBottom: 48 };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top"]}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={refreshing} tintColor={theme.muted} colors={[theme.primary]}
              onRefresh={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }} />
          ) : undefined}>
          {children}
        </ScrollView>
      ) : <View style={[{ flex: 1 }, padded && { padding: 16 }]}>{children}</View>}
    </SafeAreaView>
  );
}

/** Encabezado con botón atrás para pantallas secundarias. */
export function ScreenHeader({ title, sub, right, onBack }: {
  title: string; sub?: string; right?: React.ReactNode; onBack?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
      <IconButton name="chevron-back" size={40} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")))} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "900" }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ---------------- Typography ----------------

export function Title({ children, sub, right }: { children: string; sub?: string; right?: React.ReactNode }) {
  const s = styles();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{children}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction, icon }:
  { title: string; actionLabel?: string; onAction?: () => void; icon?: IconName }) {
  const s = styles();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        {icon && <Ionicons name={icon} size={17} color={theme.primary} />}
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.primary} />
        </Pressable>
      )}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={styles().label}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[{ color: theme.muted, fontSize: 13 }, style]}>{children}</Text>;
}

// ---------------- Surfaces ----------------

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles().card, style as ViewStyle]}>{children}</View>;
}

export function GradientCard({ children, colors = theme.gradients.primary, style }:
  { children: React.ReactNode; colors?: Gradient; style?: ViewStyle }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles().card, { borderWidth: 0 }, theme.shadow as ViewStyle, style]}>
      {children}
    </LinearGradient>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />;
}

// ---------------- Icon badges & avatars ----------------

export function IconCircle({ name, color = theme.primary, size = 40, bg }:
  { name: IconName; color?: string; size?: number; bg?: string }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      alignItems: "center", justifyContent: "center",
      backgroundColor: bg ?? withAlpha(color, 0.16),
    }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function Avatar({ label, color = theme.primary, size = 42, uri }: { label: string; color?: string; size?: number; uri?: string | null }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.cardAlt }} />;
  }
  const initials = label.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(color, 0.18),
      alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: withAlpha(color, 0.35),
    }}>
      <Text style={{ color, fontWeight: "800", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Badge({ label, color = theme.primary, icon }: { label: string; color?: string; icon?: IconName }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
      backgroundColor: withAlpha(color, 0.16), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    }}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

// ---------------- Buttons ----------------

export function Button({ label, onPress, tone = "primary", loading, icon, disabled, compact }:
  { label: string; onPress: () => void; tone?: "primary" | "ghost" | "danger" | "soft"; loading?: boolean; icon?: IconName; disabled?: boolean; compact?: boolean }) {
  const s = styles();
  const fg = tone === "ghost" ? theme.text : tone === "soft" ? theme.primary : "#fff";
  const pad = compact ? { paddingVertical: 10, paddingHorizontal: 14 } : null;
  const content = loading ? <ActivityIndicator color={fg} /> : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {icon && <Ionicons name={icon} size={compact ? 15 : 17} color={fg} />}
      <Text style={[s.btnText, { color: fg, fontSize: compact ? 13 : 15 }]}>{label}</Text>
    </View>
  );

  if (tone === "primary" && !disabled) {
    return (
      <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
        <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, pad]}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const bg = disabled ? theme.cardAlt : tone === "danger" ? theme.expense : tone === "soft" ? withAlpha(theme.primary, 0.14) : "transparent";
  return (
    <Pressable onPress={onPress} disabled={loading || disabled}
      style={({ pressed }) => [s.btn, pad, {
        backgroundColor: bg, borderColor: theme.border, borderWidth: tone === "ghost" ? 1 : 0,
        opacity: pressed ? 0.85 : disabled ? 0.6 : 1,
      }]}>
      {content}
    </Pressable>
  );
}

export function IconButton({ name, onPress, color = theme.text, bg = theme.cardAlt, size = 40, badge }:
  { name: IconName; onPress: () => void; color?: string; bg?: string; size?: number; badge?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [{
      width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
      alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1,
    }]}>
      <Ionicons name={name} size={size * 0.48} color={color} />
      {!!badge && (
        <View style={{
          position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
          backgroundColor: theme.expense, alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Fab({ onPress, icon = "add" }: { onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ position: "absolute", right: 18, bottom: 18, opacity: pressed ? 0.85 : 1 }]}>
      <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[{ width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" }, theme.shadow as ViewStyle]}>
        <Ionicons name={icon} size={28} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
}

// ---------------- Inputs ----------------

export function Field({ label, icon, right, ...props }:
  { label?: string; icon?: IconName; right?: React.ReactNode } & React.ComponentProps<typeof TextInput>) {
  const s = styles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, focused && { borderColor: theme.primary }]}>
        {icon && <Ionicons name={icon} size={17} color={focused ? theme.primary : theme.muted} style={{ marginRight: 8 }} />}
        <TextInput
          placeholderTextColor={theme.mutedDim}
          {...props}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          style={[s.input, props.multiline && { minHeight: 70, textAlignVertical: "top" }, props.style as TextStyle]}
        />
        {right}
      </View>
    </View>
  );
}

export function PasswordField(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field {...props} icon="lock-closed-outline" secureTextEntry={!show} autoCapitalize="none"
      right={
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
          <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={theme.muted} />
        </Pressable>
      } />
  );
}

/** Selector de fecha nativo (Android/iOS) y campo de texto YYYY-MM-DD en web. */
export function DateField({ label, value, onChange, clearable, placeholder }: {
  label?: string; value: string | null; onChange: (iso: string | null) => void; clearable?: boolean; placeholder?: string;
}) {
  const s = styles();
  const [iosOpen, setIosOpen] = useState(false);
  const [webText, setWebText] = useState(value ?? "");
  useEffect(() => { setWebText(value ?? ""); }, [value]);

  if (Platform.OS === "web") {
    return (
      <Field label={label} icon="calendar-outline" value={webText} placeholder={placeholder ?? "AAAA-MM-DD"}
        onChangeText={(v) => { setWebText(v); if (isValidISODate(v)) onChange(v); else if (!v && clearable) onChange(null); }} />
    );
  }

  function open() {
    const current = value ? parseISODate(value) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current, mode: "date",
        onChange: (e, d) => { if (e.type === "set" && d) onChange(toISODate(d)); },
      });
    } else setIosOpen(true);
  }

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable onPress={open} style={[s.inputWrap, { paddingVertical: 14 }]}>
        <Ionicons name="calendar-outline" size={17} color={theme.muted} style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, color: value ? theme.text : theme.mutedDim, fontSize: 15 }}>
          {value ? longDate(value) : (placeholder ?? t("Seleccionar fecha"))}
        </Text>
        {clearable && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.mutedDim} />
          </Pressable>
        ) : null}
      </Pressable>
      {iosOpen && (
        <View style={{ gap: 8 }}>
          <DateTimePicker value={value ? parseISODate(value) : new Date()} mode="date" display="inline"
            themeVariant={theme.mode} onChange={(_, d) => { if (d) onChange(toISODate(d)); }} />
          <Button label={t("Listo")} tone="soft" compact onPress={() => setIosOpen(false)} />
        </View>
      )}
    </View>
  );
}

export function SegBar<T extends string>({ value, options, onChange }:
  { value: T; options: { key: T; label: string; icon?: IconName }[]; onChange: (v: T) => void }) {
  const s = styles();
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)}
            style={[s.segItem, active && { backgroundColor: theme.primary }]}>
            {o.icon && <Ionicons name={o.icon} size={14} color={active ? "#fff" : theme.muted} />}
            <Text style={[s.segText, active && { color: "#fff", fontWeight: "700" }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, color = theme.primary, icon }:
  { label: string; active: boolean; onPress: () => void; color?: string; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[styles().chip, {
      backgroundColor: active ? color : theme.cardAlt,
      borderColor: active ? color : theme.border,
    }]}>
      {icon && <Ionicons name={icon} size={13} color={active ? "#fff" : color === theme.primary ? theme.muted : color} style={{ marginRight: 6 }} />}
      <Text style={{ color: active ? "#fff" : theme.text, fontWeight: active ? "700" : "500", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Fila de chips con scroll horizontal. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function ToggleRow({ label, sub, value, onChange, icon, disabled }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      {icon && <IconCircle name={icon} size={36} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        {sub ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled}
        trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
    </View>
  );
}

export function ListRow({ icon, color = theme.primary, label, sub, onPress, right, danger }: {
  icon: IconName; color?: string; label: string; sub?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean;
}) {
  const c = danger ? theme.expense : color;
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1 }]}>
      <IconCircle name={icon} color={c} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? theme.expense : theme.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
        {sub ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={theme.mutedDim} /> : null)}
    </Pressable>
  );
}

// ---------------- Progress & stats ----------------

export function ProgressBar({ value, color = theme.primary, height = 10 }: { value: number; color?: string; height?: number }) {
  const p = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: theme.cardAlt, overflow: "hidden" }}>
      <View style={{ width: `${p * 100}%`, height: "100%", borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function StatTile({ label, value, color = theme.text, icon, sub }: {
  label: string; value: string; color?: string; icon?: IconName; sub?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: theme.cardAlt, borderRadius: 14, padding: 12, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon && <Ionicons name={icon} size={14} color={color === theme.text ? theme.muted : color} />}
        <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={{ color, fontSize: 17, fontWeight: "800" }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: theme.mutedDim, fontSize: 11 }} numberOfLines={2}>{sub}</Text> : null}
    </View>
  );
}

/** Indicador de variación porcentual (▲ / ▼). `goodWhenUp` define el color. */
export function Delta({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  if (!previous) return <Text style={{ color: theme.mutedDim, fontSize: 12 }}>{t("sin datos previos")}</Text>;
  const change = (current - previous) / Math.abs(previous);
  const up = change >= 0;
  const good = up === goodWhenUp;
  const color = Math.abs(change) < 0.005 ? theme.muted : good ? theme.income : theme.expense;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Ionicons name={up ? "caret-up" : "caret-down"} size={12} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{Math.abs(change * 100).toFixed(0)}%</Text>
    </View>
  );
}

// ---------------- Overlays ----------------

export type SheetOption = { label: string; icon: IconName; onPress: () => void; danger?: boolean };

export function ActionSheet({ visible, title, options, onClose }: {
  visible: boolean; title?: string; options: SheetOption[]; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} />
      <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 34, gap: 4 }}>
        <View style={{ alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: theme.border, marginBottom: 8 }} />
        {title ? <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>{title}</Text> : null}
        {options.map((o) => (
          <ListRow key={o.label} icon={o.icon} label={o.label} danger={o.danger} right={<View />}
            onPress={() => { onClose(); setTimeout(o.onPress, 250); }} />
        ))}
        <Button label={t("Cancelar")} tone="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

/** Modal con un campo de texto (p. ej. pedir la contraseña). */
export function PromptModal({ visible, title, message, placeholder, secure, confirmLabel, onSubmit, onCancel, keyboardType }: {
  visible: boolean; title: string; message?: string; placeholder?: string; secure?: boolean; confirmLabel?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  onSubmit: (value: string) => Promise<void> | void; onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setValue(""); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }}>
        <Card style={{ gap: 12 }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 17 }}>{title}</Text>
          {message ? <Muted>{message}</Muted> : null}
          {secure
            ? <PasswordField label="" value={value} onChangeText={setValue} placeholder={placeholder} />
            : <Field value={value} onChangeText={setValue} placeholder={placeholder} autoFocus keyboardType={keyboardType} />}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button label={t("Cancelar")} tone="ghost" onPress={onCancel} /></View>
            <View style={{ flex: 1 }}>
              <Button label={confirmLabel ?? t("Aceptar")} loading={busy}
                onPress={async () => { setBusy(true); try { await onSubmit(value); } finally { setBusy(false); } }} />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

// ---------------- Empty / loading ----------------

export function EmptyState({ icon = "sparkles-outline", title, sub, action }:
  { icon?: IconName; title: string; sub?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
      <IconCircle name={icon} size={52} color={theme.muted} bg={theme.cardAlt} />
      <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15, textAlign: "center" }}>{title}</Text>
      {sub && <Text style={{ color: theme.muted, fontSize: 13, textAlign: "center", maxWidth: 260 }}>{sub}</Text>}
      {action && <View style={{ marginTop: 6 }}><Button label={action.label} tone="soft" compact onPress={action.onPress} /></View>}
    </View>
  );
}

export function Loading() {
  return <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={theme.primary} /></View>;
}

// ---------------- Helpers ----------------

export function withAlpha(hex: string, alpha: number) {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Estilos dependientes del tema: se recalculan solo cuando cambia el modo.
let cachedMode: string | null = null;
let cached: ReturnType<typeof makeStyles>;
function styles() {
  if (cachedMode !== theme.mode) { cached = makeStyles(); cachedMode = theme.mode; }
  return cached;
}

function makeStyles() {
  return StyleSheet.create({
    title: { color: theme.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.4 },
    sub: { color: theme.muted, fontSize: 13, marginTop: 2 },
    sectionTitle: { color: theme.text, fontWeight: "800", fontSize: 16, letterSpacing: -0.2 },
    card: {
      backgroundColor: theme.card, borderRadius: theme.radius, padding: 18,
      borderWidth: 1, borderColor: theme.borderSoft,
      ...(Platform.OS === "web" ? {} : theme.shadowSm),
    },
    btn: { borderRadius: theme.radiusSm, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
    btnText: { fontWeight: "700", fontSize: 15 },
    label: { color: theme.muted, fontSize: 13, fontWeight: "600" },
    inputWrap: {
      flexDirection: "row", alignItems: "center", backgroundColor: theme.cardAlt, borderRadius: theme.radiusSm,
      paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.border,
    },
    input: { flex: 1, paddingVertical: 13, color: theme.text, fontSize: 15 },
    seg: { flexDirection: "row", backgroundColor: theme.cardAlt, borderRadius: theme.radiusSm, padding: 4, gap: 4 },
    segItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, paddingHorizontal: 4, borderRadius: theme.radiusXs },
    segText: { color: theme.muted, fontSize: 13 },
    chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  });
}
