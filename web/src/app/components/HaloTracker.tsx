"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { HaloEntry, TIER_COLORS } from "@/lib/types";
import { isTrackedSet } from "@/lib/setFilter";

const CARD_CLASS = "bg-white border border-[#e5e7eb] rounded-lg p-4 shadow-sm";
const BAR_WIDTH = 120;

function formatPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function pctColor(value: number | null): string {
  if (value == null) return "#9ca3af";
  return value >= 0 ? "#16a34a" : "#E3350D";
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
    <span
      className="inline-flex items-center justify-center text-xs font-mono font-bold px-1.5 py-0.5 rounded"
      style={{
        color,
        backgroundColor: `${color}12`,
        border: `1px solid ${color}30`,
      }}
    >
      T{tier}
    </span>
  );
}

function sortEntries(entries: HaloEntry[]): HaloEntry[] {
  return [...entries].sort((a, b) => {
    const tierA = a.fan_favorite_tier ?? 999;
    const tierB = b.fan_favorite_tier ?? 999;
    if (tierA !== tierB) return tierA - tierB;
    const changeA = a.avg_change_7d ?? -Infinity;
    const changeB = b.avg_change_7d ?? -Infinity;
    return changeB - changeA;
  });
}

export default function HaloTracker({
  onSelectCard,
}: {
  onSelectCard: (productId: number) => void;
}) {
  const [entries, setEntries] = useState<HaloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const [haloRes, setsRes, productsRes] = await Promise.all([
        supabase.from("pokemon_halo_tracker").select("*"),
        supabase.from("sets").select("group_id, name"),
        supabase.from("products").select("group_id, pokemon_name").not("pokemon_name", "is", null),
      ]);

      if (haloRes.error) {
        console.error("Error fetching halo tracker:", haloRes.error);
        setLoading(false);
        return;
      }

      const trackedGroupIds = new Set(
        (setsRes.data ?? []).filter((s: any) => isTrackedSet(s.name)).map((s: any) => s.group_id)
      );
      const trackedPokemon = new Set(
        (productsRes.data ?? [])
          .filter((p: any) => trackedGroupIds.has(p.group_id) && p.pokemon_name)
          .map((p: any) => p.pokemon_name as string)
      );

      const filtered = ((haloRes.data as HaloEntry[]) ?? []).filter((e) =>
        trackedPokemon.has(e.pokemon_name)
      );
      setEntries(filtered);
      setLoading(false);
    }

    fetchData();
  }, []);

  const filtered = search.trim()
    ? entries.filter((e) =>
        e.pokemon_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : entries;

  const sorted = sortEntries(filtered);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span style={{ color: "#9ca3af" }}>Loading halo tracker...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          type="text"
          placeholder="Search Pokémon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 rounded-md text-sm outline-none"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            color: "#1a1a2e",
          }}
        />
      </div>

      <div className={CARD_CLASS} style={{ overflowX: "auto" }}>
        {sorted.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "#9ca3af" }}>
            No Pok&eacute;mon found.
          </p>
        ) : (
          <table className="w-full text-sm" style={{ minWidth: 800 }}>
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wider"
                style={{ color: "#9ca3af" }}
              >
                <th className="pb-3 pr-3 w-14">Tier</th>
                <th className="pb-3 pr-3">Pok&eacute;mon</th>
                <th className="pb-3 pr-3 text-right">Cards</th>
                <th className="pb-3 pr-3 text-right">Sets</th>
                <th className="pb-3 pr-3 text-right">Highest</th>
                <th className="pb-3 pr-3 text-right">Avg 7d</th>
                <th className="pb-3 pr-3 text-right">Avg 30d</th>
                <th className="pb-3 pl-3">Momentum</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => {
                const stable = Math.max(
                  0,
                  entry.total_cards - entry.rising_count - entry.falling_count
                );
                const total = entry.total_cards || 1;
                const risingW = (entry.rising_count / total) * BAR_WIDTH;
                const stableW = (stable / total) * BAR_WIDTH;
                const fallingW = (entry.falling_count / total) * BAR_WIDTH;

                return (
                  <tr
                    key={entry.pokemon_name}
                    className="border-t transition-colors"
                    style={{ borderColor: "#f3f4f6" }}
                  >
                    <td className="py-2.5 pr-3">
                      {tierBadge(entry.fan_favorite_tier)}
                    </td>
                    <td
                      className="py-2.5 pr-3 font-medium"
                      style={{ color: "#1a1a2e" }}
                    >
                      {entry.pokemon_name}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-mono"
                      style={{ color: "#1a1a2e" }}
                    >
                      {entry.total_cards}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-mono"
                      style={{ color: "#1a1a2e" }}
                    >
                      {entry.across_sets}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-mono"
                      style={{ color: "#f59e0b" }}
                    >
                      {entry.highest_card_price != null
                        ? `$${entry.highest_card_price.toFixed(2)}`
                        : "—"}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-mono"
                      style={{ color: pctColor(entry.avg_change_7d) }}
                    >
                      {formatPct(entry.avg_change_7d)}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right font-mono"
                      style={{ color: pctColor(entry.avg_change_30d) }}
                    >
                      {formatPct(entry.avg_change_30d)}
                    </td>
                    <td className="py-2.5 pl-3">
                      <div
                        className="flex h-3 rounded-full overflow-hidden"
                        style={{ width: BAR_WIDTH, backgroundColor: "#f3f4f6" }}
                        title={`Rising: ${entry.rising_count} | Stable: ${stable} | Falling: ${entry.falling_count}`}
                      >
                        <div
                          style={{
                            width: risingW,
                            backgroundColor: "#16a34a",
                          }}
                        />
                        <div
                          style={{
                            width: stableW,
                            backgroundColor: "#d1d5db",
                          }}
                        />
                        <div
                          style={{
                            width: fallingW,
                            backgroundColor: "#E3350D",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
