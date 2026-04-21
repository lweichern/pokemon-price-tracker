"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Fuse from "fuse.js";
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
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [selected, setSelected] = useState<Product | null>(null);
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const scrollRef = useRef(0);

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

      const { data: latest } = await supabase
        .from("price_history")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latest) setLastUpdated(latest.created_at);

      setLoading(false);
    }
    loadProducts();
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ["product_name", "set_name"],
        threshold: 0.4,
        useExtendedSearch: true,
      }),
    [products]
  );

  const filtered = useMemo(() => {
    let results = products;
    if (selectedSet !== "All") {
      results = results.filter((p) => p.set_name === selectedSet);
    }
    if (query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const fuseResults = fuse.search(query).map((r) => r.item);
      const setFiltered = fuseResults.filter(
        (p) => selectedSet === "All" || p.set_name === selectedSet
      );
      setFiltered.sort((a, b) => {
        const aName = a.product_name.toLowerCase();
        const bName = b.product_name.toLowerCase();
        const aMatches = terms.filter((t) => aName.includes(t)).length;
        const bMatches = terms.filter((t) => bName.includes(t)).length;
        return bMatches - aMatches;
      });
      results = setFiltered;
    }
    return results;
  }, [products, selectedSet, query, fuse]);

  async function openProduct(product: Product) {
    scrollRef.current = window.scrollY;
    window.history.pushState(
      null,
      "",
      `?set=${encodeURIComponent(product.set_name)}&name=${encodeURIComponent(product.product_name)}`
    );

    const [{ data: history }, { data: latest }] = await Promise.all([
      supabase
        .from("price_history")
        .select("date, market_myr")
        .eq("set_name", product.set_name)
        .eq("product_name", product.product_name)
        .order("date"),
      product.market_myr
        ? Promise.resolve({ data: product })
        : supabase
            .from("price_history")
            .select("set_name, product_name, market_myr, url, image_url")
            .eq("set_name", product.set_name)
            .eq("product_name", product.product_name)
            .order("date", { ascending: false })
            .limit(1)
            .single(),
    ]);

    if (history) setPrices(history);
    if (latest) setSelected(latest as Product);
    else setSelected(product);
    setChartLoading(false);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function goBack() {
    setSelected(null);
    window.history.pushState(null, "", "/");
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollRef.current);
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const set = params.get("set");
    const name = params.get("name");
    if (set && name) {
      openProduct({
        set_name: set,
        product_name: name,
        market_myr: 0,
        url: "",
        image_url: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (selected) {
    const priceChange =
      prices.length >= 2
        ? prices[prices.length - 1].market_myr - prices[0].market_myr
        : null;

    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <button
          onClick={goBack}
          className="text-zinc-500 hover:text-zinc-300 text-sm mb-6 block"
        >
          &larr; Back to all products
        </button>

        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 mb-8">
          {selected.image_url && (
            <img
              src={selected.image_url}
              alt={selected.product_name}
              className="w-48 h-48 object-contain rounded-lg bg-zinc-900 border border-zinc-800 p-2 shrink-0"
            />
          )}
          <div className="text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-bold">{selected.product_name}</h1>
            <p className="text-zinc-500 mt-1">{selected.set_name}</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-400 mt-3">
              RM {selected.market_myr.toFixed(2)}
            </p>
            {priceChange !== null && (
              <p
                className={`text-sm mt-1 ${priceChange >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {priceChange >= 0 ? "+" : ""}
                RM {priceChange.toFixed(2)} since first tracked
              </p>
            )}
            {selected.url && (
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-amber-400 hover:underline mt-3 inline-block"
              >
                View on TCGPlayer &rarr;
              </a>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Price History</h2>
          {chartLoading ? (
            <p className="text-zinc-500">Loading chart...</p>
          ) : prices.length < 2 ? (
            <p className="text-zinc-500">
              Not enough data points yet. Chart will appear after multiple daily
              runs.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [
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
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Pokemon Price Tracker</h1>
      <p className="text-zinc-400 mb-8">
        {products.length} sealed products tracked in MYR
        {lastUpdated && (
          <span className="ml-2 text-zinc-600">
            · Last updated{" "}
            {new Date(lastUpdated).toLocaleString("en-MY", {
              timeZone: "Asia/Kuala_Lumpur",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        )}
      </p>

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
                onClick={() => openProduct(p)}
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
