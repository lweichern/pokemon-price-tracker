"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
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

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

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

      setProducts(allData);
      const uniqueSets = [...new Set(allData.map((p) => p.set_name))].sort();
      setSets(uniqueSets);
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

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Pokemon Price Tracker</h1>
      <p className="text-zinc-400 mb-8">
        {products.length} sealed products tracked in MYR
      </p>

      {selected && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-8">
          <div className="flex items-start gap-4 mb-4">
            {selected.image_url && (
              <img
                src={selected.image_url}
                alt={selected.product_name}
                className="w-24 h-24 object-contain rounded-lg bg-zinc-800 p-1"
              />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-semibold">
                {selected.product_name}
              </h2>
              <p className="text-sm text-zinc-500">{selected.set_name}</p>
              <p className="text-2xl font-bold text-amber-400 mt-2">
                RM {selected.market_myr.toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-zinc-500 hover:text-zinc-300 text-sm"
            >
              Close
            </button>
          </div>

          {chartLoading ? (
            <p className="text-zinc-500">Loading chart...</p>
          ) : prices.length < 2 ? (
            <p className="text-zinc-500">
              Not enough data points yet. Chart will appear after multiple daily
              runs.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prices}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 12 }} />
                <YAxis
                  stroke="#888"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `RM${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#888" }}
                  formatter={(value: number | string) => [
                    `RM ${Number(value).toFixed(2)}`,
                    "Market Price",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="market_myr"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#f59e0b" }}
                  activeDot={{ r: 6 }}
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
          className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        <select
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
          className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-zinc-600"
        >
          <option value="All">All Sets ({products.length})</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading products...</p>
      ) : (
        <>
          <p className="text-sm text-zinc-500 mb-3">
            Showing {filtered.length} products
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((p) => (
              <div
                key={`${p.set_name}|${p.product_name}`}
                onClick={() => selectProduct(p)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-600 cursor-pointer transition-colors"
              >
                <div className="aspect-square bg-zinc-800 flex items-center justify-center p-2">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-zinc-600 text-xs">No image</div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium leading-tight line-clamp-2">
                    {p.product_name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 truncate">
                    {p.set_name}
                  </p>
                  <p className="text-sm font-bold text-amber-400 mt-2">
                    RM {p.market_myr.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
