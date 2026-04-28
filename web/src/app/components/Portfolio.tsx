"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PortfolioHolding, PortfolioRow } from "@/lib/types";

const CARD_CLASS = "bg-white border border-[#e5e7eb] rounded-lg p-4 shadow-sm";
const DEFAULT_FEE_PCT = 7;

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function pctColor(value: number): string {
  return value >= 0 ? "#16a34a" : "#E3350D";
}

export default function Portfolio() {
  const [holdings, setHoldings] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPortfolio() {
      setLoading(true);

      const { data: portfolioData, error: portfolioError } = await supabase
        .from("portfolio")
        .select(`
          *,
          products (
            name,
            image_url,
            group_id,
            sets ( name )
          )
        `);

      if (portfolioError) {
        console.error("Error fetching portfolio:", portfolioError);
        setLoading(false);
        return;
      }

      if (!portfolioData || portfolioData.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      const productIds = portfolioData.map(
        (h: PortfolioHolding) => h.product_id
      );
      const { data: priceData } = await supabase
        .from("price_metrics")
        .select("product_id, current_price")
        .in("product_id", productIds);

      const priceMap: Record<number, number> = {};
      if (priceData) {
        for (const p of priceData) {
          priceMap[p.product_id] = p.current_price;
        }
      }

      const rows: PortfolioRow[] = portfolioData.map((h: any) => ({
        id: h.id,
        product_id: h.product_id,
        sub_type_name: h.sub_type_name,
        quantity: h.quantity,
        buy_price: h.buy_price,
        platform_fee_pct: h.platform_fee_pct,
        notes: h.notes,
        created_at: h.created_at,
        updated_at: h.updated_at,
        product_name: h.products?.name ?? "Unknown",
        set_name: h.products?.sets?.name ?? "Unknown Set",
        current_price: priceMap[h.product_id] ?? null,
        image_url: h.products?.image_url ?? null,
      }));

      setHoldings(rows);
      setLoading(false);
    }

    fetchPortfolio();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span style={{ color: "#9ca3af" }}>Loading portfolio...</span>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className={CARD_CLASS}>
        <div className="text-center py-12 space-y-4">
          <p className="text-sm" style={{ color: "#6b7280" }}>
            No holdings yet. Add your first card to start tracking your
            portfolio.
          </p>
          <div
            className="text-xs rounded-md p-4 text-left max-w-md mx-auto"
            style={{ backgroundColor: "#f9fafb", color: "#9ca3af" }}
          >
            <p className="font-semibold mb-2" style={{ color: "#6b7280" }}>
              Portfolio table schema:
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <span className="font-mono">product_id</span> &mdash; linked
                product
              </li>
              <li>
                <span className="font-mono">sub_type_name</span> &mdash; price
                variant (e.g. &quot;Normal&quot;)
              </li>
              <li>
                <span className="font-mono">quantity</span> &mdash; number of
                copies
              </li>
              <li>
                <span className="font-mono">buy_price</span> &mdash; price per
                unit at purchase
              </li>
              <li>
                <span className="font-mono">platform_fee_pct</span> &mdash;
                selling fee (default 7%)
              </li>
              <li>
                <span className="font-mono">notes</span> &mdash; optional text
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const totalValue = holdings.reduce(
    (sum, h) => sum + h.quantity * (h.current_price ?? h.buy_price),
    0
  );

  const totalCost = holdings.reduce(
    (sum, h) => sum + h.quantity * h.buy_price,
    0
  );

  const totalPnl = holdings.reduce(
    (sum, h) => sum + h.quantity * ((h.current_price ?? h.buy_price) - h.buy_price),
    0
  );

  const totalReturnPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const feePct = holdings[0]?.platform_fee_pct ?? DEFAULT_FEE_PCT;
  const netAfterFees = totalValue * (1 - feePct / 100);

  const holdingValues = holdings.map(
    (h) => h.quantity * (h.current_price ?? h.buy_price)
  );
  const maxHoldingValue = Math.max(...holdingValues);
  const concentrationPct =
    totalValue > 0 ? (maxHoldingValue / totalValue) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Portfolio Value
          </p>
          <p
            className="text-2xl font-mono font-bold"
            style={{ color: "#1a1a2e" }}
          >
            {formatUsd(totalValue)}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Total P&amp;L
          </p>
          <p
            className="text-2xl font-mono font-bold"
            style={{ color: pctColor(totalPnl) }}
          >
            {formatUsd(totalPnl)}
          </p>
          <p
            className="text-xs font-mono mt-0.5"
            style={{ color: pctColor(totalReturnPct) }}
          >
            {formatPct(totalReturnPct)}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Net After Fees ({feePct}%)
          </p>
          <p
            className="text-2xl font-mono font-bold"
            style={{ color: "#1a1a2e" }}
          >
            {formatUsd(netAfterFees)}
          </p>
        </div>

        <div className={CARD_CLASS}>
          <p className="text-xs mb-1" style={{ color: "#9ca3af" }}>
            Concentration Risk
          </p>
          <p
            className="text-2xl font-mono font-bold"
            style={{ color: concentrationPct > 50 ? "#E3350D" : "#1a1a2e" }}
          >
            {concentrationPct.toFixed(1)}%
          </p>
          {concentrationPct > 50 && (
            <p className="text-[10px] mt-0.5" style={{ color: "#E3350D" }}>
              High concentration — consider diversifying
            </p>
          )}
        </div>
      </div>

      <div className={CARD_CLASS} style={{ overflowX: "auto" }}>
        <table className="w-full text-sm" style={{ minWidth: 860 }}>
          <thead>
            <tr
              className="text-left text-xs uppercase tracking-wider"
              style={{ color: "#9ca3af" }}
            >
              <th className="pb-3 pr-3 w-12"></th>
              <th className="pb-3 pr-3">Card</th>
              <th className="pb-3 pr-3 text-right">Qty</th>
              <th className="pb-3 pr-3 text-right">Buy</th>
              <th className="pb-3 pr-3 text-right">Current</th>
              <th className="pb-3 pr-3 text-right">P&amp;L %</th>
              <th className="pb-3 pr-3 text-right">Net After Fee</th>
              <th className="pb-3 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const currentPrice = h.current_price ?? h.buy_price;
              const pnlPct =
                h.buy_price > 0
                  ? ((currentPrice - h.buy_price) / h.buy_price) * 100
                  : 0;
              const fee = h.platform_fee_pct ?? DEFAULT_FEE_PCT;
              const netAfterFee =
                (currentPrice * (1 - fee / 100) - h.buy_price) * h.quantity;
              const marginPct =
                h.buy_price * h.quantity > 0
                  ? (netAfterFee / (h.buy_price * h.quantity)) * 100
                  : 0;

              return (
                <tr
                  key={h.id}
                  className="border-t transition-colors"
                  style={{ borderColor: "#f3f4f6" }}
                >
                  <td className="py-2.5 pr-3">
                    {h.image_url && (
                      <img
                        src={h.image_url}
                        alt=""
                        className="w-10 h-10 rounded object-contain"
                        style={{ backgroundColor: "#f9fafb" }}
                      />
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-col">
                      <span
                        className="font-medium"
                        style={{ color: "#1a1a2e" }}
                      >
                        {h.product_name}
                      </span>
                      <span className="text-xs" style={{ color: "#6b7280" }}>
                        {h.set_name}
                      </span>
                    </div>
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: "#1a1a2e" }}
                  >
                    {h.quantity}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: "#1a1a2e" }}
                  >
                    {formatUsd(h.buy_price)}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: "#f59e0b" }}
                  >
                    {h.current_price != null
                      ? formatUsd(h.current_price)
                      : "—"}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono font-bold"
                    style={{ color: pctColor(pnlPct) }}
                  >
                    {formatPct(pnlPct)}
                  </td>
                  <td
                    className="py-2.5 pr-3 text-right font-mono"
                    style={{ color: pctColor(netAfterFee) }}
                  >
                    {formatUsd(netAfterFee)}
                  </td>
                  <td
                    className="py-2.5 text-right font-mono font-bold"
                    style={{ color: pctColor(marginPct) }}
                  >
                    {formatPct(marginPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
