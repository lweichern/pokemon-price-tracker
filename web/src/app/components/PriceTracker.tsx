"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { isTrackedSet } from "@/lib/setFilter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Product = {
  set_name: string;
  product_name: string;
  market_myr: number;
  url: string;
  image_url: string;
};

type PricePoint = {
  date: string;
  market_myr: number;
};

const POKEMON_RED = "#E3350D";
const POKEMON_BLUE = "#2A75BB";
const POKEMON_YELLOW = "#FFCB05";
const POKEMON_GOLD = "#B8860B";

function priceColor(price: number): string {
  if (price >= 1000) return POKEMON_RED;
  if (price >= 300) return POKEMON_BLUE;
  if (price >= 100) return POKEMON_GOLD;
  return "#16a34a";
}

export default function PriceTracker() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      const today = new Date().toISOString().split("T")[0];
      let allData: Product[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data } = await supabase
          .from("price_history")
          .select("set_name, product_name, market_myr, url, image_url")
          .eq("date", today)
          .order("set_name")
          .order("product_name")
          .range(from, from + pageSize - 1);

        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const trackedData = allData.filter((p) => isTrackedSet(p.set_name));
      setProducts(trackedData);
      const uniqueSets = [...new Set(trackedData.map((p) => p.set_name))].sort();
      setSets(uniqueSets);

      if (allData.length > 0) {
        setLastUpdated(
          new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        );
      }

      setLoading(false);
    }
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedSet !== "All" && p.set_name !== selectedSet) return false;
      if (query && !p.product_name.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [products, selectedSet, query]);

  async function selectProduct(product: Product) {
    setSelected(product);
    setChartLoading(true);

    const { data } = await supabase
      .from("price_history")
      .select("date, market_myr")
      .eq("set_name", product.set_name)
      .eq("product_name", product.product_name)
      .order("date");

    if (data) setPrices(data);
    setChartLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span style={{ color: "#6b7280" }}>Loading price tracker...</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: "#fffbf0", border: `2px solid ${POKEMON_YELLOW}` }}
    >
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-bold" style={{ color: POKEMON_BLUE }}>
          Sealed Product Browser
        </h2>
        <span
          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: POKEMON_YELLOW,
            color: "#1a1a2e",
          }}
        >
          MYR
        </span>
      </div>
      <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
        {products.length} sealed products tracked
        {lastUpdated && (
          <span className="ml-2">· Last updated {lastUpdated}</span>
        )}
      </p>

      {selected && (
        <div
          className="rounded-lg p-6 mb-8 shadow-sm"
          style={{
            backgroundColor: "#ffffff",
            border: `2px solid ${POKEMON_BLUE}40`,
          }}
        >
          <div className="flex items-start gap-4 mb-4">
            {selected.image_url && (
              <img
                src={selected.image_url}
                alt={selected.product_name}
                className="w-24 h-24 object-contain rounded-lg p-1"
                style={{ backgroundColor: "#f8f8f8", border: "1px solid #e5e7eb" }}
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-semibold" style={{ color: "#1a1a2e" }}>
                {selected.product_name}
              </h2>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                {selected.set_name}
              </p>
              <p
                className="text-2xl font-bold mt-2"
                style={{ color: priceColor(selected.market_myr) }}
              >
                RM {selected.market_myr.toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-sm font-medium px-3 py-1 rounded-md hover:opacity-80 transition-opacity"
              style={{
                color: POKEMON_RED,
                backgroundColor: `${POKEMON_RED}10`,
                border: `1px solid ${POKEMON_RED}30`,
              }}
            >
              Close
            </button>
          </div>

          {chartLoading ? (
            <p style={{ color: "#6b7280" }}>Loading chart...</p>
          ) : prices.length < 2 ? (
            <p style={{ color: "#6b7280" }}>
              Not enough data points yet. Chart will appear after multiple daily
              runs.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prices}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <YAxis
                  stroke="#9ca3af"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `RM${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  labelStyle={{ color: "#6b7280" }}
                  formatter={(value) => [
                    `RM ${Number(value).toFixed(2)}`,
                    "Market Price",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="market_myr"
                  stroke={POKEMON_BLUE}
                  strokeWidth={2}
                  dot={{ r: 4, fill: POKEMON_BLUE }}
                  activeDot={{ r: 6, fill: POKEMON_RED }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name..."
          className="flex-1 px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #d1d5db",
            color: "#1a1a2e",
          }}
        />
        <select
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
          className="px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #d1d5db",
            color: "#1a1a2e",
          }}
        >
          <option value="All">All Sets ({products.length})</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm font-medium mb-3" style={{ color: "#6b7280" }}>
        Showing {filtered.length} products
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((p) => (
          <div
            key={`${p.set_name}|${p.product_name}`}
            onClick={() => selectProduct(p)}
            className="rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              className="aspect-square flex items-center justify-center p-2"
              style={{ backgroundColor: "#f8f8f8" }}
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-xs" style={{ color: "#9ca3af" }}>
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <p
                className="text-sm font-medium leading-tight line-clamp-2"
                style={{ color: "#1a1a2e" }}
              >
                {p.product_name}
              </p>
              <p
                className="text-xs mt-1 truncate"
                style={{ color: "#6b7280" }}
              >
                {p.set_name}
              </p>
              <p
                className="text-sm font-bold mt-2"
                style={{ color: priceColor(p.market_myr) }}
              >
                RM {p.market_myr.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-8 pt-4" style={{ borderTop: "1px solid #e5e7eb" }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#16a34a" }} />
          Under RM100
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: POKEMON_GOLD }} />
          RM100–299
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: POKEMON_BLUE }} />
          RM300–999
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: POKEMON_RED }} />
          RM1000+
        </div>
      </div>
    </div>
  );
}
