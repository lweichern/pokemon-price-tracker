export type Set = {
  group_id: number;
  name: string;
  abbreviation: string | null;
  published_on: string | null;
  category_id: number;
  is_supplemental: boolean;
  total_products: number;
  last_synced_at: string;
};

export type Product = {
  product_id: number;
  group_id: number;
  name: string;
  clean_name: string | null;
  image_url: string | null;
  url: string | null;
  card_number: string | null;
  rarity: string | null;
  card_type: string | null;
  hp: string | null;
  stage: string | null;
  pokemon_name: string | null;
  is_sealed: boolean;
  created_at: string;
  updated_at: string;
};

export type Price = {
  id: number;
  product_id: number;
  sub_type_name: string;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  direct_low_price: number | null;
  recorded_at: string;
};

export type PriceMetric = {
  product_id: number;
  sub_type_name: string;
  current_price: number;
  recorded_at: string;
  change_1d_pct: number | null;
  change_7d_pct: number | null;
  change_30d_pct: number | null;
  change_90d_pct: number | null;
  volatility_7d: number | null;
  trend: "spike" | "crash" | "rising" | "falling" | "stable";
};

export type FanFavorite = {
  pokemon_name: string;
  tier: number;
  notes: string | null;
};

export type BuySellSignal = {
  product_id: number;
  sub_type_name: string;
  card_name: string;
  image_url: string | null;
  rarity: string | null;
  pokemon_name: string | null;
  set_name: string;
  published_on: string | null;
  current_price: number;
  change_1d_pct: number | null;
  change_7d_pct: number | null;
  change_30d_pct: number | null;
  change_90d_pct: number | null;
  trend: string;
  volatility_7d: number | null;
  fan_tier: number | null;
  days_since_release: number | null;
  launch_phase: "pre_release" | "spike" | "compression" | "settling" | "mature";
  signal: "BUY" | "BUY_HALO" | "SELL" | "HOLD" | "MONITOR";
};

export type TopMover = {
  product_id: number;
  name: string;
  image_url: string | null;
  rarity: string | null;
  set_name: string;
  pokemon_name: string | null;
  current_price: number;
  change_7d_pct: number;
  trend: string;
  fan_favorite_tier: number | null;
};

export type HaloEntry = {
  pokemon_name: string;
  fan_favorite_tier: number | null;
  total_cards: number;
  across_sets: number;
  avg_change_7d: number | null;
  avg_change_30d: number | null;
  highest_card_price: number | null;
  rising_count: number;
  falling_count: number;
};

export type SealedEntry = {
  product_id: number;
  name: string;
  image_url: string | null;
  set_name: string;
  published_on: string | null;
  current_price: number | null;
  change_7d_pct: number | null;
  change_30d_pct: number | null;
  change_90d_pct: number | null;
  trend: string | null;
};

export type PortfolioHolding = {
  id: number;
  product_id: number;
  sub_type_name: string;
  quantity: number;
  buy_price: number;
  platform_fee_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioRow = PortfolioHolding & {
  product_name: string;
  set_name: string;
  current_price: number | null;
  image_url: string | null;
};

export const TIER_COLORS: Record<number, string> = {
  1: "#f59e0b",
  2: "#7c3aed",
  3: "#2A75BB",
  4: "#6b7280",
  5: "#6b7280",
};

export const TREND_COLORS: Record<string, string> = {
  rising: "#16a34a",
  falling: "#E3350D",
  stable: "#6b7280",
  spike: "#f59e0b",
  crash: "#dc2626",
};

export const SIGNAL_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  BUY: { bg: "#f0fdf4", border: "#16a34a", text: "#15803d" },
  BUY_HALO: { bg: "#f5f3ff", border: "#7c3aed", text: "#6d28d9" },
  SELL: { bg: "#fef2f2", border: "#E3350D", text: "#dc2626" },
  HOLD: { bg: "#fffbeb", border: "#f59e0b", text: "#b45309" },
  MONITOR: { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280" },
};

export const PHASE_COLORS: Record<string, string> = {
  pre_release: "#7c3aed",
  spike: "#ea580c",
  compression: "#E3350D",
  settling: "#ca8a04",
  mature: "#16a34a",
};
