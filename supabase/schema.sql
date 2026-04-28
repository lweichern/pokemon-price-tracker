-- ============================================================
-- TCG INTEL — Schema (tables + indexes)
-- ============================================================

-- 1. Sets ---------------------------------------------------
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

-- 2. Products -----------------------------------------------
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
    pokemon_name    TEXT,
    is_sealed       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_group ON products(group_id);
CREATE INDEX idx_products_pokemon ON products(pokemon_name);
CREATE INDEX idx_products_rarity ON products(rarity);

-- 3. Prices -------------------------------------------------
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

-- 4. Fan Favorites ------------------------------------------
CREATE TABLE fan_favorites (
    pokemon_name    TEXT PRIMARY KEY,
    tier            INTEGER NOT NULL,
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

-- 5. Portfolio -----------------------------------------------
CREATE TABLE portfolio (
    id              BIGSERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(product_id),
    sub_type_name   TEXT NOT NULL DEFAULT 'Normal',
    quantity        INTEGER NOT NULL DEFAULT 1,
    buy_price       NUMERIC(10,2) NOT NULL,
    platform_fee_pct NUMERIC(5,2) DEFAULT 7.00,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
