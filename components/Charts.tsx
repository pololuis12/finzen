import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Rect, Line, Path, Circle, G, Text as SvgText } from "react-native-svg";
import { theme } from "../constants/theme";
import { compactMoney, money } from "../lib/format";
import { t } from "../lib/i18n";

// Gráficos interactivos en SVG: tocar una barra/punto/segmento muestra su valor.

type Series = { name: string; color: string; values: (number | null)[]; dashed?: boolean };

const AXIS_W = 44;
const X_LABEL_H = 22;

function useWidth() {
  const [w, setW] = useState(0);
  return { w, onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width) };
}

function domain(series: Series[]) {
  const vals = series.flatMap((s) => s.values.filter((v): v is number => v != null && isFinite(v)));
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  return { min, max: max === min ? min + 1 : max };
}

function Tooltip({ title, rows, format }: { title: string; rows: { name: string; color: string; value: number | null }[]; format: (v: number) => string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, minHeight: 22, marginBottom: 6 }}>
      <Text style={{ color: theme.text, fontWeight: "800", fontSize: 13 }}>{title}</Text>
      {rows.filter((r) => r.value != null).map((r) => (
        <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
          <Text style={{ color: theme.muted, fontSize: 12 }}>{r.name}</Text>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>{format(r.value as number)}</Text>
        </View>
      ))}
    </View>
  );
}

function YAxis({ min, max, plotH, w }: { min: number; max: number; plotH: number; w: number }) {
  const ticks = [max, (max + min) / 2, min];
  return (
    <G>
      {ticks.map((v, i) => {
        const y = ((max - v) / (max - min)) * plotH;
        return (
          <G key={i}>
            <Line x1={AXIS_W} x2={w} y1={y} y2={y} stroke={theme.border} strokeWidth={1} strokeDasharray="3 4" />
            <SvgText x={AXIS_W - 6} y={y + 4} fontSize={10} fill={theme.mutedDim} textAnchor="end">{compactMoney(v)}</SvgText>
          </G>
        );
      })}
    </G>
  );
}

function labelStep(n: number, plotW: number) {
  return Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 38))));
}

// ---------------- Barras agrupadas ----------------

export function BarChart({ labels, series, height = 180, format = money }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string;
}) {
  const { w, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const n = labels.length;
  const idx = sel ?? Math.max(0, n - 1);
  const { min, max } = domain(series);
  const plotH = height - X_LABEL_H;
  const plotW = Math.max(1, w - AXIS_W);
  const groupW = plotW / Math.max(1, n);
  const barW = Math.max(3, Math.min(18, (groupW * 0.72) / series.length));
  const y = (v: number) => ((max - v) / (max - min)) * plotH;
  const step = labelStep(n, plotW);

  return (
    <View onLayout={onLayout}>
      {n > 0 && (
        <Tooltip title={labels[idx]} format={format}
          rows={series.map((s) => ({ name: s.name, color: s.color, value: s.values[idx] ?? null }))} />
      )}
      {w > 0 && (
        <Svg width={w} height={height}>
          <YAxis min={min} max={max} plotH={plotH} w={w} />
          {labels.map((lab, i) => {
            const gx = AXIS_W + i * groupW;
            const startX = gx + (groupW - barW * series.length) / 2;
            return (
              <G key={i}>
                {i === idx && <Rect x={gx + 1} y={0} width={groupW - 2} height={plotH} fill={theme.cardAlt} rx={6} />}
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const top = y(Math.max(v, 0)), bottom = y(Math.min(v, 0));
                  return (
                    <Rect key={si} x={startX + si * barW + 0.5} y={top} width={barW - 1}
                      height={Math.max(v === 0 ? 0 : 2, bottom - top)} rx={Math.min(4, barW / 2)}
                      fill={v < 0 ? theme.expense : s.color} opacity={sel === null || i === idx ? 1 : 0.45} />
                  );
                })}
                {i % step === 0 && (
                  <SvgText x={gx + groupW / 2} y={height - 6} fontSize={10} fill={theme.mutedDim} textAnchor="middle">{lab}</SvgText>
                )}
                <Rect x={gx} y={0} width={groupW} height={height} fill="transparent" onPress={() => setSel(i)} />
              </G>
            );
          })}
        </Svg>
      )}
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
    </View>
  );
}

// ---------------- Líneas (con proyección punteada) ----------------

export function LineChart({ labels, series, height = 180, format = money }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string;
}) {
  const { w, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const n = labels.length;
  const idx = sel ?? lastIndexWithData(series, n);
  const { min, max } = domain(series);
  const plotH = height - X_LABEL_H - 6;
  const plotW = Math.max(1, w - AXIS_W - 8);
  const dx = n > 1 ? plotW / (n - 1) : 0;
  const x = (i: number) => AXIS_W + 4 + i * dx;
  const y = (v: number) => 3 + ((max - v) / (max - min)) * plotH;
  const step = labelStep(n, plotW);

  return (
    <View onLayout={onLayout}>
      {n > 0 && (
        <Tooltip title={labels[idx]} format={format}
          rows={series.map((s) => ({ name: s.name, color: s.color, value: s.values[idx] ?? null }))} />
      )}
      {w > 0 && (
        <Svg width={w} height={height}>
          <YAxis min={min} max={max} plotH={plotH + 3} w={w} />
          <Line x1={x(idx)} x2={x(idx)} y1={0} y2={plotH + 3} stroke={theme.border} strokeWidth={1.5} />
          {series.map((s, si) => {
            let d = "", pen = false;
            s.values.forEach((v, i) => {
              if (v == null) { pen = false; return; }
              d += `${pen ? "L" : "M"}${x(i)},${y(v)} `;
              pen = true;
            });
            return (
              <G key={si}>
                <Path d={d} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={s.dashed ? "6 5" : undefined} />
                {s.values[idx] != null && (
                  <Circle cx={x(idx)} cy={y(s.values[idx] as number)} r={4.5} fill={theme.card} stroke={s.color} strokeWidth={2.5} />
                )}
              </G>
            );
          })}
          {labels.map((lab, i) => (
            <G key={i}>
              {i % step === 0 && (
                <SvgText x={x(i)} y={height - 4} fontSize={10} fill={theme.mutedDim} textAnchor="middle">{lab}</SvgText>
              )}
              <Rect x={x(i) - dx / 2} y={0} width={Math.max(dx, 12)} height={height} fill="transparent" onPress={() => setSel(i)} />
            </G>
          ))}
        </Svg>
      )}
      <Legend items={series.map((s) => ({ label: s.name, color: s.color, dashed: s.dashed }))} />
    </View>
  );
}

function lastIndexWithData(series: Series[], n: number) {
  for (let i = n - 1; i >= 0; i--) if (series.some((s) => s.values[i] != null && !s.dashed)) return i;
  return Math.max(0, n - 1);
}

// ---------------- Dona interactiva ----------------

export type DonutSegment = { label: string; value: number; color: string };

export function DonutChart({ segments, size = 150, strokeWidth = 20, format = money, maxLegend = 8 }: {
  segments: DonutSegment[]; size?: number; strokeWidth?: number; format?: (v: number) => string; maxLegend?: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const data = useMemo(() => segments.filter((s) => s.value > 0), [segments]);
  const total = data.reduce((a, s) => a + s.value, 0);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const selected = sel != null ? data[sel] : null;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.cardAlt} strokeWidth={strokeWidth} fill="none" />
            {total > 0 && data.map((seg, i) => {
              const len = (seg.value / total) * c;
              const el = (
                <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={seg.color}
                  strokeWidth={sel === i ? strokeWidth + 6 : strokeWidth} fill="none"
                  strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
                  rotation={-90} originX={size / 2} originY={size / 2}
                  opacity={sel === null || sel === i ? 1 : 0.35}
                  onPress={() => setSel(sel === i ? null : i)} />
              );
              offset += len;
              return el;
            })}
          </Svg>
          <View style={{ position: "absolute", alignItems: "center", maxWidth: size - strokeWidth * 2 - 8 }} pointerEvents="none">
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1} adjustsFontSizeToFit>
              {selected ? format(selected.value) : format(total)}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2, textAlign: "center" }} numberOfLines={2}>
              {selected ? `${selected.label} · ${((selected.value / total) * 100).toFixed(0)}%` : t("Total")}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {data.slice(0, maxLegend).map((s, i) => (
          <Pressable key={i} onPress={() => setSel(sel === i ? null : i)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: sel === null || sel === i ? 1 : 0.5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text style={{ color: theme.text, flex: 1, fontSize: 13 }} numberOfLines={1}>{s.label}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, width: 40, textAlign: "right" }}>{((s.value / total) * 100).toFixed(0)}%</Text>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700", minWidth: 90, textAlign: "right" }}>{format(s.value)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------- Barras horizontales (ranking) ----------------

export function RankBars({ items, format = money }: { items: { label: string; value: number; color?: string; sub?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 12 }}>
      {items.map((it, i) => (
        <View key={i} style={{ gap: 5 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{it.label}</Text>
            {it.sub ? <Text style={{ color: theme.mutedDim, fontSize: 12 }}>{it.sub}</Text> : null}
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{format(it.value)}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.cardAlt, overflow: "hidden" }}>
            <View style={{ width: `${(it.value / max) * 100}%`, height: "100%", borderRadius: 4, backgroundColor: it.color ?? theme.primary }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{
            width: 14, height: i.dashed ? 0 : 8, borderRadius: 4, backgroundColor: i.dashed ? "transparent" : i.color,
            borderTopWidth: i.dashed ? 2 : 0, borderStyle: "dashed", borderColor: i.color,
          }} />
          <Text style={{ color: theme.muted, fontSize: 12 }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
