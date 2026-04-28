"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import type { Product, PriceMetric, Price, Set, FanFavorite } from "@/lib/types";
import { TIER_COLORS, TREND_COLORS, PHASE_COLORS } from "@/lib/types";

interface CardDetailProps {
  productId: number;
  onBack: () => void;
}

const RARITY_PULL_RATES: Record<string, number> = {
  "Illustration Rare": 36,
  "Special Art Rare": 72,
  "Hyper Rare": 144,
  "Ultra Rare": 18,
};

const PACK_PRICE = 4.5;
const PACKS_PER_BOX = 10;
const GRADING_FEE = 25;
const PSA10_MULTIPLIER = 3.0;
const PSA9_MULTIPLIER = 1.5;

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function pctColor(n: number | null | undefined): string {
  if (n == null) return "#6b7280";
  return n >= 0 ? "#16a34a" : "#E3350D";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CardDetail({ productId, onBack }: CardDetailProps) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<(Product & { set_name: string; published_on: string | null }) | null>(null);
  const [metric, setMetric] = useState<PriceMetric | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [fanFav, setFanFav] = useState<FanFavorite | null>(null);
  const [setMetrics, setSetMetrics] = useState<PriceMetric[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data: prod } = await supabase
        .from("products")
        .select("*, sets!inner(name, published_on)")
        .eq("product_id", productId)
        .single();

      if (cancelled || !prod) {
        if (!cancelled) setLoading(false);
        return;
      }

      const setInfo = prod.sets as unknown as { name: string; published_on: string | null };
      const enrichedProduct = {
        ...prod,
        set_name: setInfo.name,
        published_on: setInfo.published_on,
      } as Product & { set_name: string; published_on: string | null };

      const [metricRes, pricesRes, fanRes, setMetricsRes] = await Promise.all([
        supabase
          .from("price_metrics")
          .select("*")
          .eq("product_id", productId)
          .limit(1)
          .single(),
        supabase
          .from("prices")
          .select("*")
          .eq("product_id", productId)
          .order("recorded_at", { ascending: true }),
        prod.pokemon_name
          ? supabase
              .from("fan_favorites")
              .select("*")
              .eq("pokemon_name", prod.pokemon_name)
              .limit(1)
              .single()
          : Promise.resolve({ data: null }),
        supabase
          .from("price_metrics")
          .select("*")
          .eq("group_id", prod.group_id),
      ]);

      if (cancelled) return;

      setProduct(enrichedProduct);
      setMetric(metricRes.data ?? null);
      setPrices((pricesRes.data as Price[]) ?? []);
      setFanFav(fanRes.data ?? null);
      setSetMetrics((setMetricsRes.data as PriceMetric[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const rank = useMemo(() => {
    if (!metric || setMetrics.length === 0) return null;
    const sorted = [...setMetrics].sort((a, b) => b.current_price - a.current_price);
    const idx = sorted.findIndex((m) => m.product_id === productId);
    return idx >= 0 ? idx + 1 : null;
  }, [metric, setMetrics, productId]);

  const top10 = useMemo(() => {
    return [...setMetrics]
      .sort((a, b) => b.current_price - a.current_price)
      .slice(0, 10);
  }, [setMetrics]);

  const top10Sum = useMemo(() => {
    return top10.reduce((s, m) => s + m.current_price, 0);
  }, [top10]);

  const estimatedPullRate = useMemo(() => {
    if (!product?.rarity) return 12;
    return RARITY_PULL_RATES[product.rarity] ?? 12;
  }, [product]);

  const expectedPullCost = estimatedPullRate * PACK_PRICE * PACKS_PER_BOX;

  const currentPrice = metric?.current_price ?? 0;
  const psa10 = currentPrice * PSA10_MULTIPLIER;
  const psa9 = currentPrice * PSA9_MULTIPLIER;
  const roiPsa10 =
    currentPrice > 0
      ? ((psa10 - currentPrice - GRADING_FEE) / (currentPrice + GRADING_FEE)) * 100
      : 0;

  const pctOfSetValue =
    top10Sum > 0 ? (currentPrice / top10Sum) * 100 : 0;

  const chartData = useMemo(() => {
    return prices.map((p) => ({
      date: fmtDate(p.recorded_at),
      rawDate: p.recorded_at,
      price: p.market_price ?? 0,
    }));
  }, [prices]);

  const maxBar = useMemo(() => {
    return top10.length > 0 ? top10[0].current_price : 1;
  }, [top10]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: "#2A75BB", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!product || !metric) {
    return (
      <div className="py-16 text-center" style={{ color: "#6b7280" }}>
        <button
          onClick={onBack}
          className="mb-4 text-sm hover:underline"
          style={{ color: "#6b7280" }}
        >
          ← Back to signals
        </button>
        <p>Card not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <button
        onClick={onBack}
        className="text-sm transition-colors hover:underline"
        style={{ color: "#6b7280" }}
      >
        ← Back to signals
      </button>

      <div
        className="flex flex-col gap-6 rounded-xl border p-6 sm:flex-row shadow-sm"
        style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
      >
        {product.image_url && (
          <div className="flex shrink-0 items-center justify-center">
            <img
              src={product.image_url}
              alt={product.name}
              className="rounded-lg object-contain"
              style={{ width: 200, height: 200 }}
            />
          </div>
        )}

        <div className="flex flex-col justify-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "#1a1a2e" }}>
            {product.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "#6b7280" }}>
            <span>{product.set_name}</span>
            {product.card_number && (
              <>
                <span>·</span>
                <span>#{product.card_number}</span>
              </>
            )}
            {product.rarity && (
              <>
                <span>·</span>
                <span>{product.rarity}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {fanFav && (
              <span
                className="rounded-full px-3 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: `${TIER_COLORS[fanFav.tier] ?? "#6b7280"}15`,
                  color: TIER_COLORS[fanFav.tier] ?? "#6b7280",
                  border: `1px solid ${TIER_COLORS[fanFav.tier] ?? "#6b7280"}40`,
                }}
              >
                Fan Tier {fanFav.tier}
              </span>
            )}

            <span
              className="rounded-full px-3 py-0.5 text-xs font-semibold capitalize"
              style={{
                backgroundColor: `${TREND_COLORS[metric.trend] ?? "#6b7280"}15`,
                color: TREND_COLORS[metric.trend] ?? "#6b7280",
                border: `1px solid ${TREND_COLORS[metric.trend] ?? "#6b7280"}40`,
              }}
            >
              {metric.trend}
            </span>

            {rank !== null && (
              <span
                className="rounded-full px-3 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: "#FFCB0520",
                  color: "#b45309",
                  border: "1px solid #FFCB0540",
                }}
              >
                #{rank} in set
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border p-6 shadow-sm"
        style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
      >
        <p
          className="font-mono text-4xl font-bold"
          style={{ color: "#2A75BB" }}
        >
          {fmtUsd(metric.current_price)}
        </p>

        <div className="mt-3 flex flex-wrap gap-3">
          {[
            { label: "1D", value: metric.change_1d_pct },
            { label: "7D", value: metric.change_7d_pct },
            { label: "30D", value: metric.change_30d_pct },
          ].map(({ label, value }) => (
            <span
              key={label}
              className="rounded-lg px-3 py-1 text-sm font-medium"
              style={{
                backgroundColor: `${pctColor(value)}10`,
                color: pctColor(value),
                border: `1px solid ${pctColor(value)}30`,
              }}
            >
              {label}: {fmtPct(value)}
            </span>
          ))}
        </div>
      </div>

      {chartData.length > 0 && (
        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
        >
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: "#1a1a2e" }}
          >
            Price History
          </h2>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2A75BB" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2A75BB" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  color: "#1a1a2e",
                  fontSize: 13,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ color: "#6b7280" }}
                formatter={(value) => [fmtUsd(Number(value)), "Market Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#2A75BB"
                strokeWidth={2}
                fill="url(#blueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
        >
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: "#1a1a2e" }}
          >
            Pull Economics
          </h2>

          <div className="space-y-3 text-sm">
            <Row
              label="Estimated pull rate"
              value={`~1 in ${estimatedPullRate} boxes`}
            />
            <Row
              label="Expected pull cost"
              value={fmtUsd(expectedPullCost)}
            />
            <Row
              label="Buy single vs rip"
              value={
                currentPrice < expectedPullCost
                  ? "BUY SINGLE ✓"
                  : "RIP COULD PAY OFF"
              }
              valueColor={
                currentPrice < expectedPullCost ? "#16a34a" : "#f59e0b"
              }
            />
            <Row
              label="% of set value (top 10)"
              value={`${pctOfSetValue.toFixed(1)}%`}
            />
          </div>
        </div>

        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
        >
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: "#1a1a2e" }}
          >
            Grading ROI Estimate
          </h2>

          <div className="space-y-3 text-sm">
            <Row label="Raw price" value={fmtUsd(currentPrice)} />
            <Row label="PSA 10 estimate" value={fmtUsd(psa10)} />
            <Row label="PSA 9 estimate" value={fmtUsd(psa9)} />
            <Row label="Grading fee" value={fmtUsd(GRADING_FEE)} />
            <Row
              label="ROI if PSA 10"
              value={`${roiPsa10.toFixed(1)}%`}
              valueColor={roiPsa10 >= 0 ? "#16a34a" : "#E3350D"}
            />
          </div>
        </div>
      </div>

      {top10.length > 0 && (
        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{ backgroundColor: "#ffffff", borderColor: "#e5e7eb" }}
        >
          <h2
            className="mb-4 text-lg font-semibold"
            style={{ color: "#1a1a2e" }}
          >
            Set Value Concentration
          </h2>

          <div className="space-y-2">
            {top10.map((m) => {
              const isSelected = m.product_id === productId;
              const barPct =
                maxBar > 0 ? (m.current_price / maxBar) * 100 : 0;

              return (
                <div key={`${m.product_id}-${m.sub_type_name}`} className="flex items-center gap-3">
                  <span
                    className="w-16 shrink-0 text-right font-mono text-xs"
                    style={{ color: isSelected ? "#2A75BB" : "#6b7280" }}
                  >
                    {fmtUsd(m.current_price)}
                  </span>
                  <div
                    className="relative h-5 flex-1 overflow-hidden rounded"
                    style={{ backgroundColor: "#f3f4f6" }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: isSelected ? "#2A75BB" : "#d1d5db",
                        minWidth: 4,
                      }}
                    />
                  </div>
                  <span
                    className="w-8 shrink-0 text-right text-xs"
                    style={{ color: isSelected ? "#2A75BB" : "#6b7280" }}
                  >
                    #{top10.indexOf(m) + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2"
      style={{ backgroundColor: "#f9fafb" }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span
        className="font-mono font-semibold"
        style={{ color: valueColor ?? "#1a1a2e" }}
      >
        {value}
      </span>
    </div>
  );
}
