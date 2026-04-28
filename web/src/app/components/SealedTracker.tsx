"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SealedEntry, TREND_COLORS } from "@/lib/types";
import { isTrackedSet } from "@/lib/setFilter";

const CARD_CLASS = "bg-white border border-[#e5e7eb] rounded-lg p-4 shadow-sm";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function pctColor(value: number | null): string {
  if (value == null) return "#9ca3af";
  return value >= 0 ? "#16a34a" : "#E3350D";
}

function estimateMsrp(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes("booster box") || lower.includes("booster case")) {
    return 149.99;
  }
  if (
    lower.includes("elite trainer box") ||
    lower.includes("etb") ||
    lower.includes("trainer box")
  ) {
    return 49.99;
  }
  return 24.99;
}

function premiumColor(premiumPct: number): string {
  if (premiumPct > 100) return "#16a34a";
  if (premiumPct >= 0) return "#f59e0b";
  return "#E3350D";
}

function trendBadge(trend: string | null) {
  if (!trend) return null;
  const color = TREND_COLORS[trend] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{
        color,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}30`,
      }}
    >
      {trend}
    </span>
  );
}

export default function SealedTracker() {
  const [entries, setEntries] = useState<SealedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data, error } = await supabase
        .from("sealed_tracker")
        .select("*")
        .order("current_price", { ascending: false });

      if (error) {
        console.error("Error fetching sealed tracker:", error);
      } else {
        setEntries(((data as SealedEntry[]) ?? []).filter((e) => isTrackedSet(e.set_name)));
      }
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span style={{ color: "#9ca3af" }}>Loading sealed tracker...</span>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS} style={{ overflowX: "auto" }}>
      {entries.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#9ca3af" }}>
          No sealed products found.
        </p>
      ) : (
        <table className="w-full text-sm" style={{ minWidth: 820 }}>
          <thead>
            <tr
              className="text-left text-xs uppercase tracking-wider"
              style={{ color: "#9ca3af" }}
            >
              <th className="pb-3 pr-3 w-12"></th>
              <th className="pb-3 pr-3">Product</th>
              <th className="pb-3 pr-3">Set</th>
              <th className="pb-3 pr-3 text-right">Market</th>
              <th className="pb-3 pr-3 text-right">MSRP</th>
              <th className="pb-3 pr-3 text-right">Premium</th>
              <th className="pb-3 pr-3 text-right">30d</th>
              <th className="pb-3 pr-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const msrp = estimateMsrp(entry.name);
              const marketPrice = entry.current_price ?? 0;
              const premium = marketPrice > 0 ? (marketPrice / msrp - 1) * 100 : 0;

              return (
                <tr
                  key={`${entry.product_id}-${i}`}
                  className="border-t transition-colors"
                  style={{ borderColor: "#f3f4f6" }}
                >
                  <td className="py-2 pr-3">
                    {entry.image_url && (
                      <img
                        src={entry.image_url}
                        alt=""
                        className="w-10 h-10 rounded object-contain"
                        style={{ backgroundColor: "#f9fafb" }}
                      />
                    )}
                  </td>
                  <td
                    className="py-2.5 pr-3 font-medium"
                    style={{ color: "#1a1a2e" }}
                  >
                    {entry.name}
                  </td>
                  <td className="py-2.5 pr-3" style={{ color: "#6b7280" }}>
                    {entry.set_name}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: "#1a1a2e" }}
                  >
                    {entry.current_price != null
                      ? `$${entry.current_price.toFixed(2)}`
                      : "—"}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: "#6b7280" }}
                  >
                    ${msrp.toFixed(2)}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono font-bold"
                    style={{ color: premiumColor(premium) }}
                  >
                    {entry.current_price != null
                      ? `${premium >= 0 ? "+" : ""}${premium.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: pctColor(entry.change_30d_pct) }}
                  >
                    {formatPct(entry.change_30d_pct)}
                  </td>
                  <td className="py-2.5 pr-3">{trendBadge(entry.trend)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
