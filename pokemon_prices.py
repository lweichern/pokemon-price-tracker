#!/usr/bin/env python3
"""
Pokemon TCG Sealed Product Price Tracker → Supabase
Pulls sealed products from TCGCSV.com, converts USD to MYR,
and stores price history in Supabase.

Environment variables required:
  SUPABASE_URL - Supabase project URL
  SUPABASE_KEY - Supabase anon key

Requirements: pip install requests python-dotenv
"""

import os
import time
import requests
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

CATEGORY_ID = 3
USER_AGENT = "PokemonPriceTracker/1.0.0"
HEADERS = {"User-Agent": USER_AGENT}
SLEEP_MS = 0.12

SEALED_KEYWORDS = [
    "etb", "elite trainer box", "booster box", "booster bundle",
    "collection box", "blister", "build & battle", "build and battle",
    "tin", "case", "pack", "trainer kit", "premium collection",
    "ultra premium", "special collection", "tech sticker",
    "poster collection", "binder collection", "mini tin",
    "surprise box", "gift box", "deluxe", "stadium",
    "starter deck", "theme deck", "league battle deck",
    "v box", "vmax box", "vstar box", "ex box",
    "3 pack", "3-pack", "6 pack", "6-pack",
    "display", "pokémon center", "pokemon center",
    "first partner", "collector chest",
    "lunchbox", "pencil case", "stacking tin",
    "super premium", "trainer box"
]

EXCLUDE_KEYWORDS = [
    "code card", "jumbo card", "promo card only",
    "card sleeves", "deck box", "playmat", "dice",
    "damage counter", "energy card", "pin only",
    "coin", "marker", "figure only"
]

ERA_PREFIXES = [
    "SWSH",
    "SV",
    "ME",
    "Crown Zenith",
    "Celebrations",
    "Shining Fates",
    "Hidden Fates",
    "Pokemon GO",
    "Trick or Trade",
    "Detective Pikachu",
    "Champions Path",
]


def get_exchange_rate():
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        rate = r.json()["rates"]["MYR"]
        print(f"  Live rate: 1 USD = {rate} MYR")
        return rate
    except Exception:
        rate = 3.96
        print(f"  Fallback rate: 1 USD = {rate} MYR")
        return rate


def fetch(url):
    time.sleep(SLEEP_MS)
    return requests.get(url, headers=HEADERS, timeout=30).json()


def is_sealed(product):
    name = product["name"].lower()
    has_rarity = any(e["name"] == "Rarity" for e in product.get("extendedData", []))
    if has_rarity:
        return False
    if not any(kw in name for kw in SEALED_KEYWORDS):
        return False
    if any(kw in name for kw in EXCLUDE_KEYWORDS):
        return False
    return True


def upsert_to_supabase(rows):
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    endpoint = f"{url}/rest/v1/price_history?on_conflict=date,set_name,product_name"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        r = requests.post(endpoint, headers=headers, json=batch, timeout=30)
        r.raise_for_status()
        print(f"  Upserted batch {i // batch_size + 1} ({len(batch)} rows)")


def main():
    print("=" * 60)
    print("Pokemon TCG Sealed Product Price Tracker")
    print("=" * 60)

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY env vars")

    print("\n[1/4] Exchange rate...")
    rate = get_exchange_rate()

    print("\n[2/4] Fetching sets...")
    all_groups = fetch(f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}/groups")["results"]
    groups = {
        g["groupId"]: g["name"]
        for g in all_groups
        if any(g["name"].startswith(prefix) for prefix in ERA_PREFIXES)
    }
    print(f"  {len(groups)} sets found (filtered from {len(all_groups)} total)")

    print("\n[3/4] Scanning sealed products...")
    all_items = []
    total = len(groups)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for i, (gid, gname) in enumerate(groups.items(), 1):
        print(f"  [{i}/{total}] {gname}", end="")
        try:
            products = fetch(f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}/{gid}/products")["results"]
            prices = fetch(f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}/{gid}/prices")["results"]
        except Exception as e:
            print(f" ERROR: {e}")
            continue

        pmap = {}
        for p in prices:
            pmap.setdefault(p["productId"], []).append(p)

        count = 0
        for prod in products:
            if not is_sealed(prod):
                continue
            pid = prod["productId"]
            price_entries = pmap.get(pid, [{
                "marketPrice": None, "subTypeName": "N/A"
            }])
            for px in price_entries:
                mkt = px.get("marketPrice")
                if mkt is None:
                    continue
                all_items.append({
                    "date": today,
                    "set_name": gname,
                    "product_name": prod["name"],
                    "market_myr": round(mkt * rate, 2),
                    "url": prod.get("url", ""),
                    "image_url": prod.get("imageUrl", ""),
                })
                count += 1
        print(f" -> {count}")

    print(f"\n  Total: {len(all_items)} sealed products")

    print("\n[4/4] Uploading to Supabase...")
    upsert_to_supabase(all_items)

    print(f"\n{'=' * 60}")
    print(f"Done! {len(all_items)} prices saved to Supabase.")
    print(f"Rate: 1 USD = {rate} MYR")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
