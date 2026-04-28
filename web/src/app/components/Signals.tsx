"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BuySellSignal, SIGNAL_STYLES, TIER_COLORS } from "@/lib/types";
import { isTrackedSet } from "@/lib/setFilter";

type SignalFilter = "ALL" | "BUY" | "BUY_HALO" | "SELL" | "HOLD";

function getReasoningText(signal: BuySellSignal): string {
  switch (signal.signal) {
    case "BUY":
      return `Fan-favorite oversold in ${signal.launch_phase} phase — ${signal.change_30d_pct ?? 0}% drop`;
    case "BUY_HALO":
      return "Iconic Pokémon in mature set — stable hold potential";
    case "SELL":
      return `Hype spike on non-iconic card — ${signal.change_7d_pct ?? 0}% surge likely to correct`;
    case "HOLD":
      return `Tier ${signal.fan_tier ?? "?"} Pokémon — stable/rising in mature set`;
    default:
      return "";
  }
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export default function Signals({
  onSelectCard,
}: {
  onSelectCard: (productId: number) => void;
}) {
  const [signals, setSignals] = useState<BuySellSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SignalFilter>("ALL");

  useEffect(() => {
    async function fetchSignals() {
      setLoading(true);
      const { data, error } = await supabase
        .from("buy_sell_signals")
        .select("*")
        .order("current_price", { ascending: false });

      if (error) {
        console.error("Error fetching signals:", error);
      } else {
        setSignals(((data as BuySellSignal[]) ?? []).filter((s) => isTrackedSet(s.set_name)));
      }
      setLoading(false);
    }

    fetchSignals();
  }, []);

  const filtered =
    filter === "ALL"
      ? signals
      : signals.filter((s) => s.signal === filter);

  const filterButtons: { label: string; value: SignalFilter }[] = [
    { label: "All", value: "ALL" },
    { label: "Buy", value: "BUY" },
    { label: "Buy Halo", value: "BUY_HALO" },
    { label: "Sell", value: "SELL" },
    { label: "Hold", value: "HOLD" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {filterButtons.map((btn) => {
          const isActive = filter === btn.value;
          const style =
            btn.value === "ALL"
              ? { bg: "#f3f4f6", border: "#d1d5db", text: "#1a1a2e" }
              : SIGNAL_STYLES[btn.value] ?? {
                  bg: "#f3f4f6",
                  border: "#d1d5db",
                  text: "#1a1a2e",
                };
          return (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: isActive ? style.bg : "transparent",
                border: `1px solid ${isActive ? style.border : "#e5e7eb"}`,
                color: isActive ? style.text : "#9ca3af",
              }}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg animate-pulse"
              style={{ backgroundColor: "#f3f4f6" }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{ color: "#9ca3af", backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
        >
          No signals found for this filter.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((signal, i) => {
            const styles = SIGNAL_STYLES[signal.signal] ?? SIGNAL_STYLES.MONITOR;
            return (
              <div
                key={`${signal.product_id}-${signal.sub_type_name}-${i}`}
                className="rounded-lg px-4 py-3 flex items-start gap-3 transition-colors shadow-sm"
                style={{
                  backgroundColor: styles.bg,
                  border: `1px solid ${styles.border}30`,
                }}
              >
                {signal.image_url && (
                  <img
                    src={signal.image_url}
                    alt=""
                    className="w-20 h-28 rounded object-contain shrink-0"
                    style={{ backgroundColor: "#f9fafb" }}
                  />
                )}
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: `${styles.border}15`,
                        color: styles.text,
                        border: `1px solid ${styles.border}40`,
                      }}
                    >
                      {signal.signal.replace("_", " ")}
                    </span>

                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor:
                          signal.fan_tier != null
                            ? `${TIER_COLORS[signal.fan_tier] ?? "#6b7280"}15`
                            : "#f3f4f6",
                        color:
                          signal.fan_tier != null
                            ? TIER_COLORS[signal.fan_tier] ?? "#6b7280"
                            : "#9ca3af",
                        border: `1px solid ${
                          signal.fan_tier != null
                            ? `${TIER_COLORS[signal.fan_tier] ?? "#6b7280"}30`
                            : "#e5e7eb"
                        }`,
                      }}
                    >
                      {signal.fan_tier != null ? `T${signal.fan_tier}` : "—"}
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectCard(signal.product_id)}
                    className="text-sm font-medium text-left truncate hover:underline cursor-pointer"
                    style={{ color: "#1a1a2e" }}
                  >
                    {signal.card_name}
                  </button>

                  <span className="text-xs truncate" style={{ color: "#6b7280" }}>
                    {signal.set_name}
                  </span>

                  <span className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                    {getReasoningText(signal)}
                  </span>
                </div>

                <div
                  className="text-sm font-mono font-medium whitespace-nowrap pt-0.5"
                  style={{ color: "#1a1a2e" }}
                >
                  {formatPrice(signal.current_price)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
