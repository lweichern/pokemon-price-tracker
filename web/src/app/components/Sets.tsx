"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type Set as TCGSet,
  type Product,
  type PriceMetric,
  type FanFavorite,
  PHASE_COLORS,
} from "@/lib/types";
import { isTrackedSet } from "@/lib/setFilter";

type SubView = "health" | "boxev" | "scorecard";

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86_400_000);
}

function phaseBadge(phase: string) {
  const color = PHASE_COLORS[phase] ?? "#6b7280";
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{
        color,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}30`,
      }}
    >
      {phase.replace("_", " ")}
    </span>
  );
}

type SetHealthRow = {
  group_id: number;
  name: string;
  published_on: string | null;
  days_old: number | null;
  launch_phase: string;
  health_score: number;
  top_card_price: number;
  avg_rare_price: number;
  concentration: number;
};

type BoxEVRow = {
  group_id: number;
  name: string;
  box_price: number;
  chase_value: number;
  ev_pct: number;
  ev_dollar: number;
  bulk_pct: number;
};

function HealthIndex({ onSelectCard }: { onSelectCard: (id: number) => void }) {
  const [rows, setRows] = useState<SetHealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [setsRes, productsRes, metricsRes, favsRes] = await Promise.all([
        supabase.from("sets").select("*"),
        supabase.from("products").select("product_id, group_id, rarity, pokemon_name").eq("is_sealed", false),
        supabase.from("price_metrics").select("product_id, current_price, trend"),
        supabase.from("fan_favorites").select("pokemon_name, tier"),
      ]);

      const allSets = (setsRes.data as TCGSet[]) ?? [];
      const sets = allSets.filter((s) => isTrackedSet(s.name));
      const products = (productsRes.data as Pick<Product, "product_id" | "group_id" | "rarity" | "pokemon_name">[]) ?? [];
      const metrics = (metricsRes.data as Pick<PriceMetric, "product_id" | "current_price" | "trend">[]) ?? [];
      const favs = (favsRes.data as FanFavorite[]) ?? [];

      const metricMap = new Map<number, { current_price: number; trend: string }>();
      for (const m of metrics) {
        metricMap.set(m.product_id, { current_price: m.current_price, trend: m.trend });
      }

      const favSet = new Set(favs.map((f) => f.pokemon_name.toLowerCase()));

      const setProductMap = new Map<number, typeof products>();
      for (const p of products) {
        const arr = setProductMap.get(p.group_id) ?? [];
        arr.push(p);
        setProductMap.set(p.group_id, arr);
      }

      const computed: SetHealthRow[] = [];

      for (const s of sets) {
        const prods = setProductMap.get(s.group_id) ?? [];
        if (prods.length === 0) continue;

        const prices: number[] = [];
        let risingCount = 0;
        let fallingCount = 0;
        let fanFavCount = 0;
        let sarSirPrices: number[] = [];

        for (const p of prods) {
          const m = metricMap.get(p.product_id);
          if (!m || m.current_price <= 0) continue;
          prices.push(m.current_price);

          if (m.trend === "rising" || m.trend === "spike") risingCount++;
          if (m.trend === "falling" || m.trend === "crash") fallingCount++;

          if (p.pokemon_name && favSet.has(p.pokemon_name.toLowerCase())) {
            fanFavCount++;
          }

          const rarity = (p.rarity ?? "").toLowerCase();
          if (rarity.includes("special art") || rarity.includes("illustration") || rarity.includes("sar") || rarity.includes("sir")) {
            sarSirPrices.push(m.current_price);
          }
        }

        if (prices.length === 0) continue;

        prices.sort((a, b) => b - a);
        const topCardPrice = prices[0];
        const totalValue = prices.reduce((sum, p) => sum + p, 0);
        const top5Value = prices.slice(0, 5).reduce((sum, p) => sum + p, 0);
        const concentration = totalValue > 0 ? (top5Value / totalValue) * 100 : 0;

        const avgRarePrice =
          sarSirPrices.length > 0
            ? sarSirPrices.reduce((s, p) => s + p, 0) / sarSirPrices.length
            : 0;

        const topCardScore = Math.min((topCardPrice / 200) * 100, 100) * 0.3;
        const avgSarScore = Math.min((avgRarePrice / 80) * 100, 100) * 0.25;
        const fanDensity =
          prods.length > 0
            ? Math.min((fanFavCount / prods.length) * 400, 100) * 0.25
            : 0;
        const trendScore =
          prices.length > 0
            ? ((risingCount / prices.length) * 100) * 0.2
            : 0;

        const healthScore = Math.round(topCardScore + avgSarScore + fanDensity + trendScore);

        const daysOld = daysSince(s.published_on);
        let phase = "mature";
        if (daysOld !== null) {
          if (daysOld < 0) phase = "pre_release";
          else if (daysOld <= 14) phase = "spike";
          else if (daysOld <= 60) phase = "compression";
          else if (daysOld <= 120) phase = "settling";
          else phase = "mature";
        }

        computed.push({
          group_id: s.group_id,
          name: s.name,
          published_on: s.published_on,
          days_old: daysOld,
          launch_phase: phase,
          health_score: healthScore,
          top_card_price: topCardPrice,
          avg_rare_price: avgRarePrice,
          concentration,
        });
      }

      computed.sort((a, b) => b.health_score - a.health_score);
      setRows(computed);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-lg animate-pulse"
            style={{ backgroundColor: "#f3f4f6" }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-lg text-sm"
        style={{ color: "#9ca3af", backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
      >
        No set data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid grid-cols-[2rem_1fr_auto_4rem_8rem_4rem_5rem] gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "#9ca3af" }}
      >
        <span>#</span>
        <span>Set</span>
        <span>Phase</span>
        <span className="text-right">Days</span>
        <span>Health</span>
        <span className="text-right">Score</span>
        <span className="text-right">Top Card</span>
      </div>

      {rows.map((row, idx) => (
        <div
          key={row.group_id}
          className="grid grid-cols-[2rem_1fr_auto_4rem_8rem_4rem_5rem] gap-3 items-center px-4 py-2.5 rounded-lg"
          style={{ backgroundColor: "#ffffff", border: "1px solid #f3f4f6" }}
        >
          <span
            className="text-xs font-mono font-medium"
            style={{ color: "#9ca3af" }}
          >
            {idx + 1}
          </span>

          <span
            className="text-sm font-medium truncate"
            style={{ color: "#1a1a2e" }}
          >
            {row.name}
          </span>

          {phaseBadge(row.launch_phase)}

          <span
            className="text-xs font-mono text-right"
            style={{ color: "#6b7280" }}
          >
            {row.days_old != null ? `${row.days_old}d` : "—"}
          </span>

          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "#f3f4f6" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(row.health_score, 100)}%`,
                  backgroundColor:
                    row.health_score >= 70
                      ? "#16a34a"
                      : row.health_score >= 40
                        ? "#f59e0b"
                        : "#E3350D",
                }}
              />
            </div>
          </div>

          <span
            className="text-xs font-mono font-bold text-right"
            style={{
              color:
                row.health_score >= 70
                  ? "#16a34a"
                  : row.health_score >= 40
                    ? "#f59e0b"
                    : "#E3350D",
            }}
          >
            {row.health_score}
          </span>

          <span
            className="text-xs font-mono text-right"
            style={{ color: "#1a1a2e" }}
          >
            {formatPrice(row.top_card_price)}
          </span>
        </div>
      ))}
    </div>
  );
}

function BoxEV({ onSelectCard }: { onSelectCard: (id: number) => void }) {
  const [rows, setRows] = useState<BoxEVRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [setsRes, productsRes, metricsRes] = await Promise.all([
        supabase.from("sets").select("*"),
        supabase.from("products").select("product_id, group_id, rarity").eq("is_sealed", false),
        supabase.from("price_metrics").select("product_id, current_price"),
      ]);

      const allSets = (setsRes.data as TCGSet[]) ?? [];
      const sets = allSets.filter((s) => isTrackedSet(s.name));
      const products = (productsRes.data as Pick<Product, "product_id" | "group_id" | "rarity">[]) ?? [];
      const metrics = (metricsRes.data as Pick<PriceMetric, "product_id" | "current_price">[]) ?? [];

      const metricMap = new Map<number, number>();
      for (const m of metrics) {
        metricMap.set(m.product_id, m.current_price);
      }

      const setProductMap = new Map<number, typeof products>();
      for (const p of products) {
        const arr = setProductMap.get(p.group_id) ?? [];
        arr.push(p);
        setProductMap.set(p.group_id, arr);
      }

      const BOX_PRICE = 140;
      const computed: BoxEVRow[] = [];

      for (const s of sets) {
        const prods = setProductMap.get(s.group_id) ?? [];
        if (prods.length === 0) continue;

        const prices: number[] = [];
        for (const p of prods) {
          const price = metricMap.get(p.product_id);
          if (price != null && price > 0) prices.push(price);
        }

        if (prices.length === 0) continue;

        prices.sort((a, b) => b - a);
        const chaseValue = prices.slice(0, 10).reduce((s, p) => s + p, 0);
        const totalValue = prices.reduce((s, p) => s + p, 0);
        const bulkValue = totalValue - chaseValue;
        const bulkPct = totalValue > 0 ? (bulkValue / totalValue) * 100 : 100;
        const evPct = (chaseValue / BOX_PRICE) * 100;
        const evDollar = chaseValue - BOX_PRICE;

        computed.push({
          group_id: s.group_id,
          name: s.name,
          box_price: BOX_PRICE,
          chase_value: chaseValue,
          ev_pct: evPct,
          ev_dollar: evDollar,
          bulk_pct: bulkPct,
        });
      }

      computed.sort((a, b) => b.ev_pct - a.ev_pct);
      setRows(computed);
      setLoading(false);
    }

    load();
  }, []);

  function evColor(pct: number): string {
    if (pct >= 100) return "#16a34a";
    if (pct >= 80) return "#f59e0b";
    return "#E3350D";
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-lg animate-pulse"
            style={{ backgroundColor: "#f3f4f6" }}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-lg text-sm"
        style={{ color: "#9ca3af", backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
      >
        No box EV data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid grid-cols-[1fr_5rem_6rem_10rem_5rem_5rem] gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "#9ca3af" }}
      >
        <span>Set</span>
        <span className="text-right">Box</span>
        <span className="text-right">Chase Val</span>
        <span>EV</span>
        <span className="text-right">EV $</span>
        <span className="text-right">Bulk %</span>
      </div>

      {rows.map((row) => {
        const color = evColor(row.ev_pct);
        return (
          <div
            key={row.group_id}
            className="grid grid-cols-[1fr_5rem_6rem_10rem_5rem_5rem] gap-3 items-center px-4 py-2.5 rounded-lg"
            style={{ backgroundColor: "#ffffff", border: "1px solid #f3f4f6" }}
          >
            <span
              className="text-sm font-medium truncate"
              style={{ color: "#1a1a2e" }}
            >
              {row.name}
            </span>

            <span
              className="text-xs font-mono text-right"
              style={{ color: "#6b7280" }}
            >
              ${row.box_price}
            </span>

            <span
              className="text-xs font-mono font-medium text-right"
              style={{ color }}
            >
              {formatPrice(row.chase_value)}
            </span>

            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "#f3f4f6" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(row.ev_pct, 150)}%`,
                    maxWidth: "100%",
                    backgroundColor: color,
                  }}
                />
              </div>
              <span
                className="text-[11px] font-mono font-bold w-10 text-right"
                style={{ color }}
              >
                {Math.round(row.ev_pct)}%
              </span>
            </div>

            <span
              className="text-xs font-mono font-medium text-right"
              style={{ color: row.ev_dollar >= 0 ? "#16a34a" : "#E3350D" }}
            >
              {row.ev_dollar >= 0 ? "+" : ""}
              {formatPrice(Math.abs(row.ev_dollar))}
            </span>

            <span
              className="text-xs font-mono text-right"
              style={{ color: "#6b7280" }}
            >
              {Math.round(row.bulk_pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SetScorecard() {
  const axes = [
    { label: "Fan-Favorite Density", max: 10 },
    { label: "Nostalgia", max: 10 },
    { label: "Scarcity", max: 10 },
    { label: "Chase Ceiling", max: 10 },
    { label: "Viral Potential", max: 10 },
  ];

  return (
    <div
      className="rounded-lg px-6 py-8 flex flex-col items-center gap-6"
      style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
    >
      <p className="text-sm text-center leading-relaxed max-w-md" style={{ color: "#6b7280" }}>
        Set Scorecard data is manually configured. Connect your scoring data to
        populate this view.
      </p>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {axes.map((axis, i) => (
          <div key={axis.label} className="flex items-center gap-3">
            <span
              className="text-xs w-5 font-mono font-medium"
              style={{ color: "#9ca3af" }}
            >
              {i + 1}.
            </span>
            <span className="text-sm flex-1" style={{ color: "#6b7280" }}>
              {axis.label}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: "#9ca3af" }}
            >
              /{axis.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sets({
  onSelectCard,
}: {
  onSelectCard: (productId: number) => void;
}) {
  const [view, setView] = useState<SubView>("health");

  const tabs: { label: string; value: SubView }[] = [
    { label: "Health Index", value: "health" },
    { label: "Box EV", value: "boxev" },
    { label: "Set Scorecard", value: "scorecard" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div
        className="inline-flex rounded-lg p-0.5 self-start"
        style={{ backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setView(tab.value)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: view === tab.value ? "#ffffff" : "transparent",
              color: view === tab.value ? "#1a1a2e" : "#9ca3af",
              boxShadow: view === tab.value ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "health" && <HealthIndex onSelectCard={onSelectCard} />}
      {view === "boxev" && <BoxEV onSelectCard={onSelectCard} />}
      {view === "scorecard" && <SetScorecard />}
    </div>
  );
}
