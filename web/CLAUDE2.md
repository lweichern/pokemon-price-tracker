# TCG INTEL — Pokémon TCG Market Intelligence System

## Project Overview

Build a full-stack Pokémon TCG market intelligence system that tracks English card and sealed product prices daily, stores historical data, computes trend/signal metrics, and displays everything in a Next.js dashboard. The system helps collectors and resellers identify what to buy, sell, or hold based on data-driven signals.

## Tech Stack

- **Scraper**: Python (httpx), runs daily via GitHub Actions or cron
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Next.js + React + Tailwind CSS + Recharts
- **Alerts** (optional): Telegram Bot API
- **Hosting**: Vercel (dashboard), GitHub Actions (scraper)

## Data Source: TCGCSV

TCGCSV (tcgcsv.com) is a free daily mirror of TCGPlayer's API. No API key needed. Updates daily at 20:00 UTC. Backend-only (CORS blocked). Rate limit: 10,000 requests/day, 100ms sleep between requests. Set custom User-Agent header.

### Endpoints (Pokemon = categoryId 3)

```
GET https://tcgcsv.com/tcgplayer/3/groups                    → All Pokemon sets (groups)
GET https://tcgcsv.com/tcgplayer/3/{groupId}/products         → All cards + sealed products in a set
GET https://tcgcsv.com/tcgplayer/3/{groupId}/prices            → Market prices for all products in a set
GET https://tcgcsv.com/last-updated.txt                        → Timestamp of last TCGCSV update
```

### Response Format

All endpoints return:
```json
{
  "totalItems": 440,
  "success": true,
  "errors": [],
  "results": [ ... ]
}
```

### Groups (Sets) Object
```json
{
  "groupId": 3170,          // PK — unique set ID
  "name": "SWSH12: Silver Tempest",
  "abbreviation": "SWSH12",
  "isSupplemental": false,
  "publishedOn": "2022-11-11T00:00:00",
  "modifiedOn": "2025-12-12T22:37:34.34",
  "categoryId": 3
}
```

### Products Object
```json
{
  "productId": 451396,       // PK — unique product ID
  "name": "Lugia VSTAR",
  "cleanName": "Lugia VSTAR",
  "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/451396_200w.jpg",
  "categoryId": 3,
  "groupId": 3170,           // FK to sets
  "url": "https://www.tcgplayer.com/product/451396/...",
  "modifiedOn": "2025-12-04T15:00:29.8",
  "imageCount": 1,
  "presaleInfo": { "isPresale": false, "releasedOn": null, "note": null },
  "extendedData": [
    { "name": "Number", "displayName": "Card Number", "value": "139/195" },
    { "name": "Rarity", "displayName": "Rarity", "value": "Ultra Rare" },
    { "name": "Card Type", "displayName": "Card Type", "value": "Colorless" },
    { "name": "HP", "displayName": "HP", "value": "280" },
    { "name": "Stage", "displayName": "Stage", "value": "VSTAR" },
    { "name": "CardText", "displayName": "Card Text", "value": "<html card text>" },
    { "name": "Attack 1", "displayName": "Attack 1", "value": "[4] Tempest Dive (220)..." },
    { "name": "Weakness", "displayName": "Weakness", "value": "Lx2" },
    { "name": "Resistance", "displayName": "Resistance", "value": "F-30" },
    { "name": "RetreatCost", "displayName": "Retreat Cost", "value": "C C" }
  ]
}
```

### Prices Object
```json
{
  "productId": 451396,           // FK to products — join key
  "lowPrice": 6.00,
  "midPrice": 9.78,
  "highPrice": 14.99,
  "marketPrice": 8.41,           // PRIMARY price field — TCGPlayer market price
  "directLowPrice": 7.25,        // TCGPlayer Direct verified sellers
  "subTypeName": "Holofoil"      // Variant: "Normal", "Holofoil", "Reverse Holofoil"
}
```

Note: A single productId can have MULTIPLE price entries with different subTypeName values. Always store (productId + subTypeName) as the composite key for prices.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌───────────────┐
│  TCGCSV API │────▶│ Python       │────▶│  Supabase  │────▶│ Next.js       │
│  (daily)    │     │ Scraper/Cron │     │  Postgres  │     │ Dashboard     │
└─────────────┘     └──────────────┘     └────────────┘     └───────────────┘
                           │
                    ┌──────┴──────┐
                    │  Telegram   │
                    │  Alert Bot  │ (optional, phase 2)
                    └─────────────┘
```

### Scraper Schedule
- Run daily at 21:00 UTC (1 hour after TCGCSV updates at 20:00 UTC)
- 21:00 UTC = 05:00 MYT (Malaysia time)
- Full sync: ~200 sets × 2 requests (products + prices) = ~400 requests
- Well within 10,000/day limit
- Estimated runtime: ~2 minutes with 100ms delays

---

## Database Schema (Supabase PostgreSQL)

### Table: `sets`
```sql
CREATE TABLE sets (
    group_id        INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    abbreviation    TEXT,
    published_on    DATE,
    category_id     INTEGER DEFAULT 3,
    is_supplemental BOOLEAN DEFAULT FALSE,
    total_products  INTEGER DEFAULT 0,
    last_synced_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sets_published ON sets(published_on DESC);
```

### Table: `products`
```sql
CREATE TABLE products (
    product_id      INTEGER PRIMARY KEY,
    group_id        INTEGER REFERENCES sets(group_id),
    name            TEXT NOT NULL,
    clean_name      TEXT,
    image_url       TEXT,
    url             TEXT,
    card_number     TEXT,
    rarity          TEXT,
    card_type       TEXT,
    hp              TEXT,
    stage           TEXT,
    pokemon_name    TEXT,       -- Extracted: "Charizard" from "Charizard ex"
    is_sealed       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_group ON products(group_id);
CREATE INDEX idx_products_pokemon ON products(pokemon_name);
CREATE INDEX idx_products_rarity ON products(rarity);
```

### Table: `prices` (core — one row per product per variant per day)
```sql
CREATE TABLE prices (
    id              BIGSERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(product_id),
    sub_type_name   TEXT NOT NULL DEFAULT 'Normal',
    low_price       NUMERIC(10,2),
    mid_price       NUMERIC(10,2),
    high_price      NUMERIC(10,2),
    market_price    NUMERIC(10,2),
    direct_low_price NUMERIC(10,2),
    recorded_at     DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(product_id, sub_type_name, recorded_at)
);
CREATE INDEX idx_prices_product_date ON prices(product_id, recorded_at DESC);
CREATE INDEX idx_prices_date ON prices(recorded_at DESC);
CREATE INDEX idx_prices_market ON prices(market_price DESC) WHERE market_price IS NOT NULL;
```

### Table: `fan_favorites` (static lookup for halo analysis)
```sql
CREATE TABLE fan_favorites (
    pokemon_name    TEXT PRIMARY KEY,
    tier            INTEGER NOT NULL,   -- 1=highest, 5=lowest
    notes           TEXT
);

INSERT INTO fan_favorites (pokemon_name, tier, notes) VALUES
('Charizard', 1, 'Undisputed king. Every Charizard card holds or appreciates.'),
('Pikachu', 1, 'Mascot. Viral-driven. Broadest collector base.'),
('Umbreon', 1, 'Moonbreon effect. Eeveelution flagship.'),
('Mewtwo', 2, 'Perennial nostalgia. Movie tie-ins.'),
('Lugia', 2, 'Aquapolis halo. Strong vintage + modern demand.'),
('Rayquaza', 2, 'Dragon fanbase. Gold Star legacy.'),
('Mew', 2, 'Pairs with Mewtwo. Anniversary demand.'),
('Greninja', 3, 'Anime bond. XY generation favorite.'),
('Gengar', 3, 'Ghost-type king. Alt art darling.'),
('Eevee', 3, 'Gateway to all Eeveelutions.'),
('Sylveon', 3, 'Strongest non-Umbreon Eeveelution.'),
('Gardevoir', 3, 'Consistent waifu + competitive demand.'),
('Dragonite', 3, 'OG dragon nostalgia.'),
('Blaziken', 4, 'Gen 3 starter. Mega form anticipated.'),
('Tyranitar', 4, 'Dark/Rock fan favorite.'),
('Lucario', 4, 'Fighting-type mascot.'),
('Snorlax', 4, 'Meme/comfort Pokemon.'),
('Alakazam', 4, 'OG psychic. Niche collector base.'),
('Espeon', 4, 'Second Eeveelution.');
```

### Materialized View: `price_metrics` (computed daily after scrape)
```sql
CREATE MATERIALIZED VIEW price_metrics AS
WITH latest AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id, sub_type_name, market_price, recorded_at
    FROM prices WHERE market_price IS NOT NULL
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_1d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id, sub_type_name, market_price
    FROM prices WHERE market_price IS NOT NULL AND recorded_at <= CURRENT_DATE - INTERVAL '1 day'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_7d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id, sub_type_name, market_price
    FROM prices WHERE market_price IS NOT NULL AND recorded_at <= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_30d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id, sub_type_name, market_price
    FROM prices WHERE market_price IS NOT NULL AND recorded_at <= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_90d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id, sub_type_name, market_price
    FROM prices WHERE market_price IS NOT NULL AND recorded_at <= CURRENT_DATE - INTERVAL '90 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
volatility AS (
    SELECT product_id, sub_type_name, STDDEV(market_price) AS stddev_7d, AVG(market_price) AS avg_7d
    FROM prices WHERE market_price IS NOT NULL AND recorded_at >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY product_id, sub_type_name
)
SELECT
    l.product_id, l.sub_type_name, l.market_price AS current_price, l.recorded_at,
    CASE WHEN p1.market_price > 0 THEN ROUND(((l.market_price - p1.market_price) / p1.market_price * 100)::numeric, 2) END AS change_1d_pct,
    CASE WHEN p7.market_price > 0 THEN ROUND(((l.market_price - p7.market_price) / p7.market_price * 100)::numeric, 2) END AS change_7d_pct,
    CASE WHEN p30.market_price > 0 THEN ROUND(((l.market_price - p30.market_price) / p30.market_price * 100)::numeric, 2) END AS change_30d_pct,
    CASE WHEN p90.market_price > 0 THEN ROUND(((l.market_price - p90.market_price) / p90.market_price * 100)::numeric, 2) END AS change_90d_pct,
    ROUND(v.stddev_7d::numeric, 4) AS volatility_7d,
    CASE
        WHEN COALESCE(((l.market_price - p1.market_price) / NULLIF(p1.market_price,0) * 100), 0) > 20 THEN 'spike'
        WHEN COALESCE(((l.market_price - p1.market_price) / NULLIF(p1.market_price,0) * 100), 0) < -20 THEN 'crash'
        WHEN COALESCE(((l.market_price - p7.market_price) / NULLIF(p7.market_price,0) * 100), 0) > 10
             AND COALESCE(((l.market_price - p30.market_price) / NULLIF(p30.market_price,0) * 100), 0) > 15 THEN 'rising'
        WHEN COALESCE(((l.market_price - p7.market_price) / NULLIF(p7.market_price,0) * 100), 0) < -10
             AND COALESCE(((l.market_price - p30.market_price) / NULLIF(p30.market_price,0) * 100), 0) < -15 THEN 'falling'
        ELSE 'stable'
    END AS trend
FROM latest l
LEFT JOIN prev_1d p1 ON l.product_id = p1.product_id AND l.sub_type_name = p1.sub_type_name
LEFT JOIN prev_7d p7 ON l.product_id = p7.product_id AND l.sub_type_name = p7.sub_type_name
LEFT JOIN prev_30d p30 ON l.product_id = p30.product_id AND l.sub_type_name = p30.sub_type_name
LEFT JOIN prev_90d p90 ON l.product_id = p90.product_id AND l.sub_type_name = p90.sub_type_name
LEFT JOIN volatility v ON l.product_id = v.product_id AND l.sub_type_name = v.sub_type_name;

CREATE UNIQUE INDEX idx_pm_product ON price_metrics(product_id, sub_type_name);
```

### RPC Function (called by scraper after each sync)
```sql
CREATE OR REPLACE FUNCTION refresh_price_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY price_metrics;
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_price_metrics() TO service_role;
```

### View: `buy_sell_signals`
```sql
CREATE OR REPLACE VIEW buy_sell_signals AS
WITH signals AS (
    SELECT
        pm.product_id, p.name AS card_name, p.rarity, p.pokemon_name,
        s.name AS set_name, s.published_on,
        pm.current_price, pm.change_1d_pct, pm.change_7d_pct, pm.change_30d_pct,
        pm.change_90d_pct, pm.trend, pm.volatility_7d,
        ff.tier AS fan_tier,
        CURRENT_DATE - s.published_on AS days_since_release,
        CASE
            WHEN CURRENT_DATE < s.published_on THEN 'pre_release'
            WHEN CURRENT_DATE - s.published_on <= 3 THEN 'spike'
            WHEN CURRENT_DATE - s.published_on <= 30 THEN 'compression'
            WHEN CURRENT_DATE - s.published_on <= 90 THEN 'settling'
            ELSE 'mature'
        END AS launch_phase,
        CASE
            WHEN ff.tier <= 3 AND pm.change_30d_pct < -20 AND pm.current_price > 5
                 AND (CURRENT_DATE - s.published_on) BETWEEN 14 AND 90 THEN 'BUY'
            WHEN ff.tier <= 2 AND pm.trend = 'stable' AND pm.current_price > 10
                 AND (CURRENT_DATE - s.published_on) > 180 THEN 'BUY_HALO'
            WHEN (ff.tier IS NULL OR ff.tier >= 4) AND pm.change_7d_pct > 30
                 AND pm.current_price > 5 THEN 'SELL'
            WHEN (CURRENT_DATE - s.published_on) BETWEEN 3 AND 30
                 AND pm.current_price < 20 AND pm.change_7d_pct < -10 THEN 'SELL'
            WHEN ff.tier <= 2 AND (CURRENT_DATE - s.published_on) > 90
                 AND pm.trend IN ('stable', 'rising') THEN 'HOLD'
            ELSE 'MONITOR'
        END AS signal
    FROM price_metrics pm
    JOIN products p ON pm.product_id = p.product_id
    JOIN sets s ON p.group_id = s.group_id
    LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
    WHERE pm.current_price >= 1.00 AND p.is_sealed = FALSE
)
SELECT * FROM signals WHERE signal IN ('BUY', 'BUY_HALO', 'SELL')
ORDER BY CASE signal WHEN 'BUY' THEN 1 WHEN 'BUY_HALO' THEN 2 WHEN 'SELL' THEN 3 END,
         ABS(COALESCE(change_7d_pct, 0)) DESC;
```

### Useful Views
```sql
-- Top gainers 7d
CREATE VIEW top_gainers_7d AS
SELECT pm.product_id, p.name, p.rarity, s.name AS set_name, p.pokemon_name,
       pm.current_price, pm.change_7d_pct, pm.trend, ff.tier AS fan_favorite_tier
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE pm.current_price >= 1.00 AND pm.change_7d_pct IS NOT NULL
ORDER BY pm.change_7d_pct DESC LIMIT 50;

-- Top losers 7d
CREATE VIEW top_losers_7d AS
SELECT pm.product_id, p.name, p.rarity, s.name AS set_name, p.pokemon_name,
       pm.current_price, pm.change_7d_pct, pm.trend, ff.tier AS fan_favorite_tier
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE pm.current_price >= 1.00 AND pm.change_7d_pct IS NOT NULL
ORDER BY pm.change_7d_pct ASC LIMIT 50;

-- Halo tracker: all cards grouped by Pokemon across sets
CREATE VIEW pokemon_halo_tracker AS
SELECT p.pokemon_name, ff.tier AS fan_favorite_tier,
       COUNT(DISTINCT p.product_id) AS total_cards,
       COUNT(DISTINCT p.group_id) AS across_sets,
       AVG(pm.change_7d_pct) AS avg_change_7d,
       AVG(pm.change_30d_pct) AS avg_change_30d,
       MAX(pm.current_price) AS highest_card_price,
       SUM(CASE WHEN pm.trend = 'rising' THEN 1 ELSE 0 END) AS rising_count,
       SUM(CASE WHEN pm.trend = 'falling' THEN 1 ELSE 0 END) AS falling_count
FROM products p
JOIN price_metrics pm ON p.product_id = pm.product_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE p.pokemon_name IS NOT NULL AND pm.current_price >= 1.00
GROUP BY p.pokemon_name, ff.tier
ORDER BY ff.tier ASC NULLS LAST, avg_change_7d DESC;

-- Sealed products tracker
CREATE VIEW sealed_tracker AS
SELECT p.product_id, p.name, s.name AS set_name, s.published_on,
       pm.current_price, pm.change_7d_pct, pm.change_30d_pct, pm.change_90d_pct, pm.trend
FROM products p
JOIN sets s ON p.group_id = s.group_id
JOIN price_metrics pm ON p.product_id = pm.product_id
WHERE p.is_sealed = TRUE AND pm.current_price IS NOT NULL
ORDER BY pm.change_30d_pct DESC;
```

---

## Python Scraper

### Requirements
```
httpx>=0.27.0
```

### Environment Variables
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
```

### Key Logic

1. Check `https://tcgcsv.com/last-updated.txt` to see if data has been refreshed
2. Fetch all groups (sets) from `/tcgplayer/3/groups`
3. For each set, fetch products from `/tcgplayer/3/{groupId}/products` and prices from `/tcgplayer/3/{groupId}/prices`
4. Transform data: extract `pokemon_name` from card name, detect `is_sealed` from product name patterns, extract `rarity`/`card_number`/etc from `extendedData`
5. Upsert into Supabase tables using REST API with `Prefer: resolution=merge-duplicates`
6. Call `refresh_price_metrics()` RPC to rebuild the materialized view
7. Sleep 120ms between requests, use `User-Agent: TCGMarketIntel/1.0.0`

### Sealed Product Detection (regex)
```
booster box|booster bundle|elite trainer box|etb|collection box|ultra premium|
premium collection|blister pack|build.?&.?battle|tin|case|display|code card|
booster pack|theme deck|starter deck
```

### Pokemon Name Extraction
Strip suffixes like `ex`, `EX`, `V`, `VMAX`, `VSTAR`, `GX`, `MEGA`, `BREAK`, `Prime`, `LV.X`, `Gold Star`, `Radiant`, `Prism Star`, `TAG TEAM`. Skip cards with "Trainer", "Energy", "Stadium", "Supporter", "Item" or any sealed keywords in the name.

### CLI
```bash
python scraper.py                  # Full sync all sets
python scraper.py --sets-only      # Only sync sets metadata
python scraper.py --set 3170       # Sync specific set by groupId
python scraper.py --recent 5       # Only sync 5 most recent sets
python scraper.py --dry-run        # Fetch but don't write
```

### GitHub Actions Cron (scraper schedule)
```yaml
on:
  schedule:
    - cron: '0 21 * * *'  # 21:00 UTC = 05:00 MYT
```

---

## Dashboard Specification

### Design System
- Dark theme: background `#09090b`, card `#0d0d0f`, border `#1e1e24`, row `#111113`
- Text: primary `#e4e4e7`, secondary `#71717a`, muted `#52525b`, faint `#3f3f46`
- Accent: gold `#f59e0b` (brand/header), red `#ef4444` (falling/sell), green `#10b981` (rising/buy), purple `#8b5cf6` (halo), blue `#3b82f6`
- Font: body Inter/system, mono JetBrains Mono/Fira Code for numbers
- Fan-favorite tier colors: T1 `#f59e0b`, T2 `#8b5cf6`, T3 `#3b82f6`, T4 `#6b7280`
- Trend colors: rising `#10b981`, falling `#ef4444`, stable `#71717a`, spike `#f59e0b`, crash `#dc2626`
- Signal configs: BUY (green bg `#052e16`, border `#16a34a`), BUY_HALO (purple bg `#1a1625`, border `#7c3aed`), SELL (red bg `#2a0a0a`, border `#dc2626`), HOLD (yellow bg `#1a1a0a`, border `#ca8a04`)
- Launch phase badges: Pre-Release `#c084fc`, Spike `#f97316`, Compression `#ef4444`, Settling `#eab308`, Mature `#22c55e`

### Tab 1: Overview
- **Stats row** (5 cards): Tracked Cards count, Sealed Products count, Avg 7d Move (%), Active Signals count, Market Sentiment gauge
- **Market Sentiment**: ratio of rising / stable / falling cards. Show as percentage + horizontal stacked bar (green/gray/red). Label: "Bullish" (>60%), "Neutral" (40-60%), "Bearish Correction" (<40%)
- **Fan-Favorite Price Trends chart**: Area chart with monthly price data for top Pokémon (Umbreon, Charizard, Greninja, Terapagos). Use Recharts AreaChart with gradient fills
- **Top Gainers (7d)**: List of top 5 cards with highest 7d % change. Show name, set, fan-tier badge, price, % change
- **Top Losers (7d)**: Same layout, sorted by worst 7d % change. Show "No Halo" badge for non-fan-favorite Pokémon

### Tab 2: Signals
- **Actionable Signals list**: Cards with BUY, BUY_HALO, SELL, HOLD signals
- Each row shows: signal badge, card name, set, fan-tier badge, reasoning text, current price
- Color-coded row backgrounds per signal type
- Data source: `buy_sell_signals` view

### Tab 3: Sets (three sub-views via toggle buttons)

**Sub-view: Health Index**
- Ranked list of all sets sorted by composite health score (0-100)
- Each row: rank number, set name, launch phase badge, days old, health bar + score, top card price, avg SIR price, top-5-cards-% (concentration warning if >70%)
- Health score = weighted composite of: top card value, avg SIR value, fan-favorite density, trend direction

**Sub-view: Box EV**
- Each row: set name, box market price, total chase value, EV bar (% where 100% = breakeven), EV per box in dollars, bulk percentage
- Color: green if EV >100% (positive expected value), yellow 80-100%, red <80%

**Sub-view: Set Scorecard**
- Pre-release prediction system. Each set scored on 5 axes (each /10):
  1. **Fan-Favorite Density**: How many of the set's chase cards feature iconic Pokémon?
  2. **Nostalgia**: Does the set theme trigger emotional connection? (Gen 1 = 10, Paradox = 1)
  3. **Scarcity**: Is supply constrained? (allocation drama, limited print, special set = high)
  4. **Chase Ceiling**: What's the projected highest card value? ($1000+ = 10, <$100 = 2)
  5. **Viral Potential**: Will pulls go viral on TikTok? (Moonbreon = 10, Iron Valiant = 1)
- Show 5 mini progress bars per set + composite score /100
- Sort by score descending

### Tab 4: Card Detail
- **Header**: Card name, set, card number, rarity, fan-tier badge, trend badge, rank-in-set badge
- **Price display**: Large current price + 1d/7d/30d % changes
- **Price history chart**: Area chart showing daily price over time (from `prices` table)
- **Pull Economics panel**:
  - Pull rate (e.g., "1 in 50 boxes")
  - Expected pull cost (pull rate × pack price × packs per box)
  - Buy single vs rip verdict (if single price < pull cost → "BUY SINGLE" in green)
  - % of set's total chase value this card represents
  - Rank within set
- **Grading ROI panel**:
  - Raw price vs PSA 10 estimate vs PSA 9 estimate
  - PSA 10 multiple (PSA10 price / raw price)
  - Grading fee ($20-30)
  - ROI if PSA 10 = (PSA10 - raw - fee) / (raw + fee) × 100
- **Set Value Concentration chart**: Horizontal bar chart showing all chase cards in the set ranked by value. Highlight the selected card in gold. Visually shows how "top-heavy" the set is

### Tab 5: Halo Tracker
- **Table**: One row per Pokémon, columns:
  - Fan tier badge (T1/T2/T3 or "—")
  - Pokémon name
  - Total cards tracked across all sets
  - Number of sets this Pokémon appears in
  - Highest-priced card
  - Avg 7d change across all cards
  - Avg 30d change across all cards
  - Momentum bar: stacked horizontal bar showing rising (green) / stable (gray) / falling (red) distribution
- Sort by fan tier (T1 first), then by avg 7d change
- Data source: `pokemon_halo_tracker` view

### Tab 6: Sealed Tracker
- **Table** of sealed products: name, set, market price, MSRP, premium % (market/MSRP - 1), 30d change, trend badge
- Premium color: green >100%, yellow 0-100%, red negative (below MSRP = buy signal for long-term)
- Data source: `sealed_tracker` view with MSRP stored or manually configured

### Tab 7: Portfolio
- **Stats row** (4 cards):
  - Portfolio total value
  - Total P&L (value - cost basis) with % return
  - Net after platform fees (Shopee 7% default, make configurable)
  - Concentration risk: % of portfolio in single largest holding (red if >50%)
- **Holdings table**: Each row shows card name, set, quantity, buy price, current price, P&L %, net after fee, margin % (profit after fee / cost)
- Portfolio data stored in Supabase `portfolio` table (user-entered buy prices + quantities)
- Prices auto-update daily from `price_metrics`

### Tab 8: Calendar
- **Upcoming releases list**: Each row shows:
  - Countdown (days until release) — large number, color-coded by urgency (gold <30d, blue <90d, gray >90d)
  - Set name, release date, featured Mega/Pokémon
  - Status text (e.g., "Preorders open", "JP release May 22")
  - Set Scorecard composite score with mini progress bar
- Data: manually maintained or scraped from PokeBeach/Dexerto release calendars

---

## Signal Logic Reference

### Trend Detection
- **Spike**: 1d change > 20%
- **Crash**: 1d change < -20%
- **Rising**: 7d change > 10% AND 30d change > 15%
- **Falling**: 7d change < -10% AND 30d change < -15%
- **Stable**: abs(7d change) < 5%

### Buy/Sell Signal Rules
- **BUY**: Fan-favorite (tier 1-3) + 30d change < -20% + price > $5 + set is 14-90 days old (compression/settling phase = oversold correction opportunity)
- **BUY_HALO**: Fan-favorite (tier 1-2) + stable trend + price > $10 + set > 180 days old (mature set with upcoming new set featuring same Pokémon)
- **SELL**: Non-iconic (tier 4+ or unranked) + 7d change > 30% + price > $5 (hype-driven spike will correct)
- **SELL**: Set is 3-30 days old + price < $20 + 7d change < -10% (compression phase, non-chase card)
- **HOLD**: Tier 1-2 + set > 90 days old + stable/rising trend (iconic Pokemon in mature set)
- **MONITOR**: Everything else

### Launch Cycle Phase Detection
Based on days since set release:
- **Pre-release**: T-30 to T-0
- **Spike**: T+0 to T+3 days
- **Compression**: T+3 to T+30 days
- **Settling**: T+30 to T+90 days
- **Mature**: T+90+

### Market Sentiment
- Count of rising / falling / stable cards across all tracked products
- Ratio = rising / total
- Bullish: ratio > 0.60
- Neutral: ratio 0.40-0.60
- Bearish: ratio < 0.40

---

## Market Intelligence Context

This system is built on research into what drives Pokémon TCG card prices:

1. **Character popularity > rarity > artwork > playability** — The same set, same rarity, same illustrator produces 10-50× price differences based on whether the Pokémon is Umbreon vs Terapagos
2. **Halo effect** — When a new set features a fan-favorite Pokémon, older cards of that same Pokémon rise in price. Only works for tier 1-3 Pokémon. Non-iconic Pokémon produce no cross-set halo
3. **Launch cycle is mechanical** — Every modern set follows: 48-72hr spike → 2-4 week compression (non-top SARs drop 30-60%) → 1-3 months settling (only top 3-5 cards hold value)
4. **Sets that appreciate long-term need**: iconic anchor Pokémon + emotional/nostalgia theme + supply scarcity + $300+ chase card ceiling + viral-worthy pulls
5. **Sets that stagnate** (Paradox Rift, Temporal Forces, Stellar Crown): featured non-iconic Pokémon, game-mechanic themes instead of emotional themes, unlimited print runs, low chase ceilings ($60-80), no viral pull moments

---

## File Structure

```
tcg-intel/
├── CLAUDE.md                 # This file
├── scraper/
│   ├── scraper.py           # Daily TCGCSV → Supabase pipeline
│   ├── requirements.txt     # httpx
│   └── .env.example         # SUPABASE_URL, SUPABASE_KEY
├── supabase/
│   ├── schema.sql           # Tables, indexes, materialized views
│   └── functions.sql        # RPC functions, signal views
├── dashboard/               # Next.js app
│   ├── package.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx         # Dashboard with 8 tabs
│   │   └── components/
│   │       ├── Overview.tsx
│   │       ├── Signals.tsx
│   │       ├── Sets.tsx
│   │       ├── CardDetail.tsx
│   │       ├── HaloTracker.tsx
│   │       ├── SealedTracker.tsx
│   │       ├── Portfolio.tsx
│   │       └── Calendar.tsx
│   └── lib/
│       ├── supabase.ts      # Supabase client
│       └── types.ts         # TypeScript types
├── .github/
│   └── workflows/
│       └── scrape.yml       # GitHub Actions daily cron
└── README.md
```

---

## Deployment

1. Create Supabase project → run `schema.sql` then `functions.sql` in SQL Editor
2. Set up scraper: `pip install httpx`, set env vars, run `python scraper.py` for first sync
3. Set up GitHub Actions cron for daily automated scraping at 21:00 UTC
4. Deploy Next.js dashboard to Vercel, connect to Supabase
5. Wait 7+ days for trend data to populate, 30+ days for full signal activation
