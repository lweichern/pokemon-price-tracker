"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TopMover, TIER_COLORS } from "@/lib/types";
import { isTrackedSet } from "@/lib/setFilter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type StatsData = {
  trackedCards: number;
  sealedProducts: number;
  avg7dMove: number | null;
  activeSignals: number;
  sentiment: { rising: number; falling: number; stable: number; total: number };
};

type TrendPoint = {
  month: string;
  Charizard: number | null;
  Pikachu: number | null;
  Umbreon: number | null;
  Gengar: number | null;
};

const CARD_CLASS = "bg-white border border-[#e5e7eb] rounded-lg p-4 shadow-sm";

const POKEMON_COLORS: Record<string, string> = {
  Charizard: "#E3350D",
  Pikachu: "#FFCB05",
  Umbreon: "#7c3aed",
  Gengar: "#6366f1",
};

function formatPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function sentimentLabel(risingRatio: number): string {
  if (risingRatio > 0.6) return "Bullish";
  if (risingRatio < 0.4) return "Bearish";
  return "Neutral";
}

function tierBadge(tier: number | null) {
  if (tier == null) {
    return (
      <span
        className="inline-flex items-center justify-center text-xs font-mono px-1.5 py-0.5 rounded"
        style={{ color: "#9ca3af", backgroundColor: "#f3f4f6" }}
      >
        —
      </span>
    );
  }
  const color = TIER_COLORS[tier] ?? "#6b7280";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono">
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ backgroundColor: color }}
      />
      <span style={{ color }}>T{tier}</span>
    </span>
  );
}

function noHaloBadge() {
  return (
    <span
      className="inline-flex items-center text-xs font-mono px-1.5 py-0.5 rounded"
      style={{ color: "#9ca3af", backgroundColor: "#f3f4f6" }}
    >
      No Halo
    </span>
  );
}

export default function Overview() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [gainers, setGainers] = useState<TopMover[]>([]);
  const [losers, setLosers] = useState<TopMover[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const [
        trackedRes,
        sealedRes,
        metricsRes,
        signalsRes,
        trendRes,
        gainersRes,
        losersRes,
        lastSyncRes,
      ] = await Promise.all([
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("is_sealed", false),
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("is_sealed", true),
        supabase.from("price_metrics").select("change_7d_pct, trend"),
        supabase
          .from("buy_sell_signals")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("prices")
          .select("market_price, recorded_at, product_id")
          .in(
            "product_id",
            (
              await supabase
                .from("products")
                .select("product_id")
                .in("pokemon_name", ["Charizard", "Pikachu", "Umbreon", "Gengar"])
            ).data?.map((p) => p.product_id) ?? []
          )
          .not("market_price", "is", null)
          .order("recorded_at"),
        supabase.from("top_gainers_7d").select("*").limit(5),
        supabase.from("top_losers_7d").select("*").limit(5),
        supabase
          .from("sets")
          .select("last_synced_at")
          .order("last_synced_at", { ascending: false })
          .limit(1),
      ]);

      const metrics = metricsRes.data ?? [];
      const validChanges = metrics
        .map((m) => m.change_7d_pct)
        .filter((v): v is number => v != null);
      const avg7d =
        validChanges.length > 0
          ? validChanges.reduce((a, b) => a + b, 0) / validChanges.length
          : null;

      const rising = metrics.filter((m) => m.trend === "rising" || m.trend === "spike").length;
      const falling = metrics.filter((m) => m.trend === "falling" || m.trend === "crash").length;
      const stable = metrics.filter((m) => m.trend === "stable").length;

      setStats({
        trackedCards: trackedRes.count ?? 0,
        sealedProducts: sealedRes.count ?? 0,
        avg7dMove: avg7d,
        activeSignals: signalsRes.count ?? 0,
        sentiment: { rising, falling, stable, total: metrics.length },
      });

      const pokemonProducts =
        (
          await supabase
            .from("products")
            .select("product_id, pokemon_name")
            .in("pokemon_name", ["Charizard", "Pikachu", "Umbreon", "Gengar"])
        ).data ?? [];

      const idToName: Record<number, string> = {};
      for (const p of pokemonProducts) {
        if (p.pokemon_name) idToName[p.product_id] = p.pokemon_name;
      }

      const priceRows = trendRes.data ?? [];
      const monthMap: Record<
        string,
        Record<string, { sum: number; count: number }>
      > = {};

      for (const row of priceRows) {
        const name = idToName[row.product_id];
        if (!name || row.market_price == null) continue;
        const month = row.recorded_at.slice(0, 7);
        if (!monthMap[month]) monthMap[month] = {};
        if (!monthMap[month][name]) monthMap[month][name] = { sum: 0, count: 0 };
        monthMap[month][name].sum += row.market_price;
        monthMap[month][name].count += 1;
      }

      const months = Object.keys(monthMap).sort();
      const trendPoints: TrendPoint[] = months.map((m) => ({
        month: m,
        Charizard: monthMap[m].Charizard
          ? monthMap[m].Charizard.sum / monthMap[m].Charizard.count
          : null,
        Pikachu: monthMap[m].Pikachu
          ? monthMap[m].Pikachu.sum / monthMap[m].Pikachu.count
          : null,
        Umbreon: monthMap[m].Umbreon
          ? monthMap[m].Umbreon.sum / monthMap[m].Umbreon.count
          : null,
        Gengar: monthMap[m].Gengar
          ? monthMap[m].Gengar.sum / monthMap[m].Gengar.count
          : null,
      }));

      setTrendData(trendPoints);
      setGainers(((gainersRes.data as TopMover[]) ?? []).filter((g) => isTrackedSet(g.set_name)));
      setLosers(((losersRes.data as TopMover[]) ?? []).filter((l) => isTrackedSet(l.set_name)));
      if (lastSyncRes.data?.[0]?.last_synced_at) {
        setLastSynced(lastSyncRes.data[0].last_synced_at);
      }
      setLoading(false);
    }

    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span style={{ color: "#9ca3af" }}>Loading...</span>
      </div>
    );
  }

  const s = stats!;
  const risingRatio = s.sentiment.total > 0 ? s.sentiment.rising / s.sentiment.total : 0.5;
  const fallingRatio = s.sentiment.total > 0 ? s.sentiment.falling / s.sentiment.total : 0;
  const stableRatio = s.sentiment.total > 0 ? s.sentiment.stable / s.sentiment.total : 0;

  const syncDate = lastSynced
    ? new Date(lastSynced).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="space-y-6">
      {syncDate && (
        <p className="text-xs text-right" style={{ color: "#9ca3af" }}>
          Last synced: {syncDate}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Tracked Cards
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "#1a1a2e" }}>
            {s.trackedCards.toLocaleString()}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Sealed Products
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "#1a1a2e" }}>
            {s.sealedProducts.toLocaleString()}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Avg 7d Move
          </p>
          <p
            className="text-2xl font-mono font-bold"
            style={{
              color:
                s.avg7dMove == null
                  ? "#9ca3af"
                  : s.avg7dMove >= 0
                    ? "#16a34a"
                    : "#E3350D",
            }}
          >
            {formatPct(s.avg7dMove)}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Active Signals
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "#1a1a2e" }}>
            {s.activeSignals.toLocaleString()}
          </p>
        </div>

        <div className={`${CARD_CLASS} col-span-2 md:col-span-1`}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Market Sentiment
          </p>
          <p
            className="text-lg font-mono font-bold"
            style={{
              color:
                risingRatio > 0.6
                  ? "#16a34a"
                  : risingRatio < 0.4
                    ? "#E3350D"
                    : "#6b7280",
            }}
          >
            {(risingRatio * 100).toFixed(0)}% {sentimentLabel(risingRatio)}
          </p>
          <div className="flex h-2 rounded-full overflow-hidden mt-2" style={{ backgroundColor: "#f3f4f6" }}>
            <div
              style={{
                width: `${risingRatio * 100}%`,
                backgroundColor: "#16a34a",
              }}
            />
            <div
              style={{
                width: `${stableRatio * 100}%`,
                backgroundColor: "#d1d5db",
              }}
            />
            <div
              style={{
                width: `${fallingRatio * 100}%`,
                backgroundColor: "#E3350D",
              }}
            />
          </div>
        </div>
      </div>

      <div className={CARD_CLASS}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "#1a1a2e" }}>
          Fan-Favorite Price Trends
        </h2>
        {trendData.length < 2 ? (
          <p style={{ color: "#9ca3af" }} className="text-sm py-8 text-center">
            Not enough data for trend chart yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trendData}>
              <defs>
                {Object.entries(POKEMON_COLORS).map(([name, color]) => (
                  <linearGradient
                    key={name}
                    id={`grad-${name}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                stroke="#d1d5db"
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <YAxis
                stroke="#d1d5db"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: 12,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ color: "#6b7280" }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, undefined]}
              />
              {Object.entries(POKEMON_COLORS).map(([name, color]) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#grad-${name})`}
                  connectNulls
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={CARD_CLASS}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#1a1a2e" }}>
            Top Gainers (7d)
          </h2>
          {gainers.length === 0 ? (
            <p style={{ color: "#9ca3af" }} className="text-sm">
              No data available.
            </p>
          ) : (
            <div className="space-y-2">
              {gainers.map((g, i) => (
                <div
                  key={`${g.product_id}-${i}`}
                  className="flex items-center gap-3 rounded px-3 py-2"
                  style={{ backgroundColor: "#f9fafb" }}
                >
                  {g.image_url && (
                    <img
                      src={g.image_url}
                      alt=""
                      className="w-9 h-9 rounded object-contain shrink-0"
                      style={{ backgroundColor: "#f3f4f6" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#1a1a2e" }}
                    >
                      {g.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#9ca3af" }}>
                      {g.set_name}
                    </p>
                  </div>
                  <div className="shrink-0">{tierBadge(g.fan_favorite_tier)}</div>
                  <p
                    className="text-sm font-mono shrink-0"
                    style={{ color: "#1a1a2e" }}
                  >
                    ${g.current_price.toFixed(2)}
                  </p>
                  <p
                    className="text-sm font-mono font-bold shrink-0 w-16 text-right"
                    style={{ color: "#16a34a" }}
                  >
                    {formatPct(g.change_7d_pct)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={CARD_CLASS}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#1a1a2e" }}>
            Top Losers (7d)
          </h2>
          {losers.length === 0 ? (
            <p style={{ color: "#9ca3af" }} className="text-sm">
              No data available.
            </p>
          ) : (
            <div className="space-y-2">
              {losers.map((l, i) => (
                <div
                  key={`${l.product_id}-${i}`}
                  className="flex items-center gap-3 rounded px-3 py-2"
                  style={{ backgroundColor: "#f9fafb" }}
                >
                  {l.image_url && (
                    <img
                      src={l.image_url}
                      alt=""
                      className="w-9 h-9 rounded object-contain shrink-0"
                      style={{ backgroundColor: "#f3f4f6" }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#1a1a2e" }}
                    >
                      {l.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "#9ca3af" }}>
                      {l.set_name}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {l.pokemon_name && l.fan_favorite_tier == null
                      ? noHaloBadge()
                      : tierBadge(l.fan_favorite_tier)}
                  </div>
                  <p
                    className="text-sm font-mono shrink-0"
                    style={{ color: "#1a1a2e" }}
                  >
                    ${l.current_price.toFixed(2)}
                  </p>
                  <p
                    className="text-sm font-mono font-bold shrink-0 w-16 text-right"
                    style={{ color: "#E3350D" }}
                  >
                    {formatPct(l.change_7d_pct)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
