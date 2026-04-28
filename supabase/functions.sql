-- ============================================================
-- TCG INTEL — Functions, Materialized View & Views
-- ============================================================

-- 1. price_metrics materialized view -------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS price_metrics AS
WITH latest AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id,
        sub_type_name,
        market_price,
        low_price,
        mid_price,
        high_price,
        direct_low_price,
        recorded_at
    FROM prices
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_1d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id,
        sub_type_name,
        market_price AS market_price_1d
    FROM prices
    WHERE recorded_at <= CURRENT_DATE - INTERVAL '1 day'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_7d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id,
        sub_type_name,
        market_price AS market_price_7d
    FROM prices
    WHERE recorded_at <= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_30d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id,
        sub_type_name,
        market_price AS market_price_30d
    FROM prices
    WHERE recorded_at <= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
prev_90d AS (
    SELECT DISTINCT ON (product_id, sub_type_name)
        product_id,
        sub_type_name,
        market_price AS market_price_90d
    FROM prices
    WHERE recorded_at <= CURRENT_DATE - INTERVAL '90 days'
    ORDER BY product_id, sub_type_name, recorded_at DESC
),
volatility AS (
    SELECT
        product_id,
        sub_type_name,
        STDDEV(market_price) AS volatility_7d
    FROM prices
    WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
      AND market_price IS NOT NULL
    GROUP BY product_id, sub_type_name
)
SELECT
    l.product_id,
    l.sub_type_name,
    l.market_price,
    l.low_price,
    l.mid_price,
    l.high_price,
    l.direct_low_price,
    l.recorded_at,
    ROUND(((l.market_price - p1.market_price_1d) / NULLIF(p1.market_price_1d, 0)) * 100, 2) AS change_1d_pct,
    ROUND(((l.market_price - p7.market_price_7d) / NULLIF(p7.market_price_7d, 0)) * 100, 2) AS change_7d_pct,
    ROUND(((l.market_price - p30.market_price_30d) / NULLIF(p30.market_price_30d, 0)) * 100, 2) AS change_30d_pct,
    ROUND(((l.market_price - p90.market_price_90d) / NULLIF(p90.market_price_90d, 0)) * 100, 2) AS change_90d_pct,
    ROUND(v.volatility_7d, 2) AS volatility_7d,
    CASE
        WHEN ROUND(((l.market_price - p1.market_price_1d) / NULLIF(p1.market_price_1d, 0)) * 100, 2) >= 20 THEN 'spike'
        WHEN ROUND(((l.market_price - p1.market_price_1d) / NULLIF(p1.market_price_1d, 0)) * 100, 2) <= -20 THEN 'crash'
        WHEN ROUND(((l.market_price - p7.market_price_7d) / NULLIF(p7.market_price_7d, 0)) * 100, 2) >= 10 THEN 'rising'
        WHEN ROUND(((l.market_price - p7.market_price_7d) / NULLIF(p7.market_price_7d, 0)) * 100, 2) <= -10 THEN 'falling'
        ELSE 'stable'
    END AS trend
FROM latest l
LEFT JOIN prev_1d  p1  ON l.product_id = p1.product_id  AND l.sub_type_name = p1.sub_type_name
LEFT JOIN prev_7d  p7  ON l.product_id = p7.product_id  AND l.sub_type_name = p7.sub_type_name
LEFT JOIN prev_30d p30 ON l.product_id = p30.product_id AND l.sub_type_name = p30.sub_type_name
LEFT JOIN prev_90d p90 ON l.product_id = p90.product_id AND l.sub_type_name = p90.sub_type_name
LEFT JOIN volatility v  ON l.product_id = v.product_id  AND l.sub_type_name = v.sub_type_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_metrics_pk ON price_metrics(product_id, sub_type_name);

-- 2. refresh_price_metrics() RPC function --------------------
CREATE OR REPLACE FUNCTION refresh_price_metrics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY price_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. buy_sell_signals view -----------------------------------
CREATE OR REPLACE VIEW buy_sell_signals AS
SELECT
    pm.product_id,
    pm.sub_type_name,
    p.name AS card_name,
    p.image_url,
    p.pokemon_name,
    p.rarity,
    s.name AS set_name,
    s.published_on,
    pm.market_price AS current_price,
    pm.change_1d_pct,
    pm.change_7d_pct,
    pm.change_30d_pct,
    pm.change_90d_pct,
    pm.trend,
    pm.volatility_7d,
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
        WHEN ff.tier <= 3 AND pm.change_30d_pct < -20 AND pm.market_price > 5
             AND (CURRENT_DATE - s.published_on) BETWEEN 14 AND 90 THEN 'BUY'
        WHEN ff.tier <= 2 AND pm.trend = 'stable' AND pm.market_price > 10
             AND (CURRENT_DATE - s.published_on) > 180 THEN 'BUY_HALO'
        WHEN (ff.tier IS NULL OR ff.tier >= 4) AND pm.change_7d_pct > 30
             AND pm.market_price > 5 THEN 'SELL'
        WHEN (CURRENT_DATE - s.published_on) BETWEEN 3 AND 30
             AND pm.market_price < 20 AND pm.change_7d_pct < -10 THEN 'SELL'
        WHEN ff.tier <= 2 AND (CURRENT_DATE - s.published_on) > 90
             AND pm.trend IN ('stable', 'rising') THEN 'HOLD'
        ELSE 'MONITOR'
    END AS signal
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE pm.market_price >= 1.00 AND p.is_sealed = FALSE;

-- 4. top_gainers_7d view ------------------------------------
CREATE OR REPLACE VIEW top_gainers_7d AS
SELECT
    pm.product_id,
    p.name,
    p.image_url,
    p.pokemon_name,
    p.rarity,
    s.name AS set_name,
    pm.market_price AS current_price,
    pm.change_7d_pct,
    pm.trend,
    ff.tier AS fan_favorite_tier
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE pm.change_7d_pct IS NOT NULL
  AND pm.market_price IS NOT NULL
  AND pm.market_price >= 1.00
ORDER BY pm.change_7d_pct DESC;

-- 5. top_losers_7d view -------------------------------------
CREATE OR REPLACE VIEW top_losers_7d AS
SELECT
    pm.product_id,
    p.name,
    p.image_url,
    p.pokemon_name,
    p.rarity,
    s.name AS set_name,
    pm.market_price AS current_price,
    pm.change_7d_pct,
    pm.trend,
    ff.tier AS fan_favorite_tier
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE pm.change_7d_pct IS NOT NULL
  AND pm.market_price IS NOT NULL
  AND pm.market_price >= 1.00
ORDER BY pm.change_7d_pct ASC;

-- 6. pokemon_halo_tracker view ------------------------------
CREATE OR REPLACE VIEW pokemon_halo_tracker AS
SELECT
    p.pokemon_name,
    ff.tier AS fan_favorite_tier,
    COUNT(*) AS total_cards,
    COUNT(DISTINCT p.group_id) AS across_sets,
    MAX(pm.market_price) AS highest_card_price,
    ROUND(AVG(pm.change_7d_pct), 2) AS avg_change_7d,
    ROUND(AVG(pm.change_30d_pct), 2) AS avg_change_30d,
    SUM(CASE WHEN pm.trend IN ('rising', 'spike') THEN 1 ELSE 0 END) AS rising_count,
    SUM(CASE WHEN pm.trend IN ('falling', 'crash') THEN 1 ELSE 0 END) AS falling_count
FROM products p
JOIN price_metrics pm ON p.product_id = pm.product_id
LEFT JOIN fan_favorites ff ON p.pokemon_name = ff.pokemon_name
WHERE p.pokemon_name IS NOT NULL
  AND pm.market_price IS NOT NULL
  AND pm.market_price >= 1.00
GROUP BY p.pokemon_name, ff.tier
ORDER BY ff.tier ASC NULLS LAST, avg_change_7d DESC;

-- 7. sealed_tracker view ------------------------------------
CREATE OR REPLACE VIEW sealed_tracker AS
SELECT
    pm.product_id,
    p.name,
    p.image_url,
    s.name AS set_name,
    s.published_on,
    pm.market_price AS current_price,
    pm.change_7d_pct,
    pm.change_30d_pct,
    pm.change_90d_pct,
    pm.trend
FROM price_metrics pm
JOIN products p ON pm.product_id = p.product_id
JOIN sets s ON p.group_id = s.group_id
WHERE p.is_sealed = TRUE
  AND pm.market_price IS NOT NULL
ORDER BY pm.market_price DESC;
