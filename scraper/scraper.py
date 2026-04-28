#!/usr/bin/env python3
"""
Pokemon TCG Market Intelligence Scraper

Fetches card/product data and prices from the TCGCSV API and upserts
into Supabase.  Designed to run once daily via cron or CI.

Usage:
    python scraper.py                  # Full sync all sets
    python scraper.py --sets-only      # Only sync sets metadata
    python scraper.py --set 3170       # Sync specific set by groupId
    python scraper.py --recent 5       # Only sync 5 most recent sets
    python scraper.py --dry-run        # Fetch but don't write to DB
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TCGCSV_BASE = "https://tcgcsv.com/tcgplayer"
CATEGORY_ID = 3  # Pokemon
USER_AGENT = "TCGMarketIntel/1.0.0"
REQUEST_SLEEP = 0.12  # 120 ms between requests
DAILY_REQUEST_LIMIT = 10_000
BATCH_SIZE = 500

# Supabase credentials from environment (no dotenv)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# ---------------------------------------------------------------------------
# Pokemon name extraction
# ---------------------------------------------------------------------------

# Suffixes to strip from card names to get the base Pokemon name.
# Order matters: longer / more-specific patterns first.
_POKEMON_SUFFIXES = [
    "TAG TEAM",
    "Gold Star",
    "Prism Star",
    "Radiant",
    "VSTAR",
    "VMAX",
    "MEGA",
    "BREAK",
    "Prime",
    "LV.X",
    "GX",
    "EX",
    "ex",
    "V",
]

# Cards whose names contain any of these tokens are not individual Pokemon
# cards and should be skipped when extracting a pokemon_name.
_SKIP_TOKENS = {"Trainer", "Energy", "Stadium", "Supporter", "Item"}

# Sealed-product detection regex (case-insensitive).
_SEALED_RE = re.compile(
    r"booster\s*box|booster\s*bundle|elite\s*trainer\s*box|etb"
    r"|collection\s*box|ultra\s*premium|premium\s*collection"
    r"|blister\s*pack|build.?&.?battle|tin|case|display"
    r"|code\s*card|booster\s*pack|theme\s*deck|starter\s*deck",
    re.IGNORECASE,
)

# Additional sealed keywords to skip when extracting pokemon_name.
_SEALED_SKIP_TOKENS = {
    "booster", "box", "bundle", "elite", "trainer", "tin",
    "case", "display", "deck", "blister", "pack", "premium",
    "collection", "code", "card", "build", "battle", "starter",
    "theme", "etb",
}


def extract_pokemon_name(name: str) -> str | None:
    """Return the base Pokemon name, or None if this card should be skipped."""
    # Skip trainers, energies, etc.
    for token in _SKIP_TOKENS:
        if token.lower() in name.lower():
            return None

    # Skip sealed products
    if _SEALED_RE.search(name):
        return None

    cleaned = name.strip()
    for suffix in _POKEMON_SUFFIXES:
        # Remove suffix at end of string (preceded by space or dash)
        pattern = re.compile(r"[\s\-]+" + re.escape(suffix) + r"$", re.IGNORECASE)
        cleaned = pattern.sub("", cleaned)

    cleaned = cleaned.strip()
    return cleaned if cleaned else None


def is_sealed(name: str) -> bool:
    """Return True if the product name looks like a sealed product."""
    return bool(_SEALED_RE.search(name))


# ---------------------------------------------------------------------------
# Extended-data helpers
# ---------------------------------------------------------------------------

def _ext_lookup(extended_data: list[dict], key: str) -> str | None:
    """Look up a value by name in the extendedData array."""
    for item in extended_data:
        if item.get("name") == key:
            val = item.get("value")
            return str(val) if val is not None else None
    return None


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

_request_count = 0


def _get(client: httpx.Client, url: str) -> dict:
    """GET *url*, sleep, bump counter, return parsed JSON."""
    global _request_count
    if _request_count >= DAILY_REQUEST_LIMIT:
        print(f"  [!] Daily request limit ({DAILY_REQUEST_LIMIT}) reached. Stopping.")
        sys.exit(1)

    resp = client.get(url)
    resp.raise_for_status()
    _request_count += 1
    time.sleep(REQUEST_SLEEP)
    return resp.json()


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def _upsert(
    client: httpx.Client,
    table: str,
    rows: list[dict],
    on_conflict: str,
    dry_run: bool,
) -> None:
    """Batch-upsert *rows* into *table* in groups of BATCH_SIZE."""
    if dry_run:
        print(f"    [dry-run] Would upsert {len(rows)} rows into {table}")
        return
    if not rows:
        return

    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = _supabase_headers()

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        resp = client.post(url, json=batch, headers=headers)
        if resp.status_code >= 400:
            print(f"    [!] Upsert {table} batch {i // BATCH_SIZE + 1} "
                  f"failed ({resp.status_code}): {resp.text[:300]}")
        else:
            print(f"    Upserted {len(batch)} rows into {table} "
                  f"(batch {i // BATCH_SIZE + 1})")


def _rpc(client: httpx.Client, fn_name: str, dry_run: bool) -> None:
    """Call a Supabase RPC function."""
    if dry_run:
        print(f"  [dry-run] Would call RPC {fn_name}()")
        return
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    headers = _supabase_headers()
    resp = client.post(url, json={}, headers=headers)
    if resp.status_code >= 400:
        print(f"  [!] RPC {fn_name} failed ({resp.status_code}): {resp.text[:300]}")
    else:
        print(f"  RPC {fn_name}() completed.")


# ---------------------------------------------------------------------------
# Transform helpers
# ---------------------------------------------------------------------------

def transform_set(group: dict) -> dict:
    """Map a TCGCSV group result to a Supabase 'sets' row."""
    return {
        "group_id": group["groupId"],
        "name": group.get("name"),
        "abbreviation": group.get("abbreviation"),
        "is_supplemental": group.get("isSupplemental", False),
        "published_on": group.get("publishedOn"),
        "category_id": group.get("categoryId"),
    }


def transform_product(product: dict) -> dict:
    """Map a TCGCSV product result to a Supabase 'products' row."""
    ext = product.get("extendedData", [])
    name = product.get("name", "")
    return {
        "product_id": product["productId"],
        "group_id": product.get("groupId"),
        "name": name,
        "clean_name": product.get("cleanName"),
        "image_url": product.get("imageUrl"),
        "url": product.get("url"),
        "pokemon_name": extract_pokemon_name(name),
        "is_sealed": is_sealed(name),
        "rarity": _ext_lookup(ext, "Rarity"),
        "card_number": _ext_lookup(ext, "Number"),
        "card_type": _ext_lookup(ext, "Card Type"),
        "hp": _ext_lookup(ext, "HP"),
        "stage": _ext_lookup(ext, "Stage"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def transform_price(price: dict) -> dict:
    """Map a TCGCSV price result to a Supabase 'prices' row."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return {
        "product_id": price["productId"],
        "sub_type_name": price.get("subTypeName", "Normal"),
        "recorded_at": now,
        "low_price": price.get("lowPrice"),
        "mid_price": price.get("midPrice"),
        "high_price": price.get("highPrice"),
        "market_price": price.get("marketPrice"),
        "direct_low_price": price.get("directLowPrice"),
    }


# ---------------------------------------------------------------------------
# Main workflow
# ---------------------------------------------------------------------------

def fetch_last_updated(client: httpx.Client) -> str:
    """Return the last-updated timestamp string from TCGCSV."""
    resp = client.get("https://tcgcsv.com/last-updated.txt")
    resp.raise_for_status()
    global _request_count
    _request_count += 1
    time.sleep(REQUEST_SLEEP)
    return resp.text.strip()


def fetch_groups(client: httpx.Client) -> list[dict]:
    """Fetch all Pokemon TCG groups (sets)."""
    url = f"{TCGCSV_BASE}/{CATEGORY_ID}/groups"
    data = _get(client, url)
    return data.get("results", [])


def fetch_products(client: httpx.Client, group_id: int) -> list[dict]:
    """Fetch products for a single set."""
    url = f"{TCGCSV_BASE}/{CATEGORY_ID}/{group_id}/products"
    data = _get(client, url)
    return data.get("results", [])


def fetch_prices(client: httpx.Client, group_id: int) -> list[dict]:
    """Fetch prices for a single set."""
    url = f"{TCGCSV_BASE}/{CATEGORY_ID}/{group_id}/prices"
    data = _get(client, url)
    return data.get("results", [])


def sync_sets(
    client: httpx.Client,
    groups: list[dict],
    dry_run: bool,
) -> None:
    """Upsert set metadata to Supabase."""
    rows = [transform_set(g) for g in groups]
    print(f"  Upserting {len(rows)} sets ...")
    _upsert(client, "sets", rows, "group_id", dry_run)


def sync_set_data(
    client: httpx.Client,
    group: dict,
    idx: int,
    total: int,
    dry_run: bool,
) -> None:
    """Fetch and upsert products + prices for a single set."""
    gid = group["groupId"]
    name = group.get("name", "unknown")
    print(f"\n  [{idx}/{total}] Processing set: {name} (groupId={gid})")

    # -- products --
    try:
        raw_products = fetch_products(client, gid)
        products = [transform_product(p) for p in raw_products]
        print(f"    Fetched {len(products)} products")
        _upsert(client, "products", products, "product_id", dry_run)
    except Exception as exc:
        print(f"    [!] Products failed for set {gid}: {exc}")

    # -- prices --
    try:
        raw_prices = fetch_prices(client, gid)
        prices = [transform_price(p) for p in raw_prices]
        print(f"    Fetched {len(prices)} price rows")
        _upsert(client, "prices", prices, "product_id,sub_type_name,recorded_at", dry_run)
    except Exception as exc:
        print(f"    [!] Prices failed for set {gid}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pokemon TCG Market Intelligence Scraper"
    )
    parser.add_argument(
        "--sets-only",
        action="store_true",
        help="Only sync sets metadata (no products/prices)",
    )
    parser.add_argument(
        "--set",
        type=int,
        default=None,
        metavar="GROUP_ID",
        help="Sync a specific set by groupId",
    )
    parser.add_argument(
        "--recent",
        type=int,
        default=None,
        metavar="N",
        help="Only sync the N most recently published sets",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch data but don't write to the database",
    )
    args = parser.parse_args()

    # Validate env vars (unless dry-run)
    if not args.dry_run:
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("[!] SUPABASE_URL and SUPABASE_KEY must be set in the environment.")
            sys.exit(1)

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
    )

    try:
        # Step 1 -- check last-updated
        print("=" * 60)
        print("Step 1: Checking TCGCSV last-updated timestamp")
        print("=" * 60)
        try:
            last_updated = fetch_last_updated(client)
            print(f"  TCGCSV data last updated: {last_updated}")
        except Exception as exc:
            print(f"  [!] Could not fetch last-updated.txt: {exc}")
            last_updated = "unknown"

        # Step 2 -- fetch all groups (sets)
        print()
        print("=" * 60)
        print("Step 2: Fetching all Pokemon TCG sets")
        print("=" * 60)
        groups = fetch_groups(client)
        print(f"  Found {len(groups)} sets")

        # Step 3 -- upsert sets metadata
        print()
        print("=" * 60)
        print("Step 3: Upserting sets metadata")
        print("=" * 60)
        sync_sets(client, groups, args.dry_run)

        if args.sets_only:
            print("\n  --sets-only flag set. Skipping products and prices.")
            return

        # Determine which sets to process
        if args.set is not None:
            target_groups = [g for g in groups if g["groupId"] == args.set]
            if not target_groups:
                print(f"\n  [!] Set with groupId={args.set} not found.")
                sys.exit(1)
        elif args.recent is not None:
            # Sort by publishedOn descending and take the N most recent
            sorted_groups = sorted(
                groups,
                key=lambda g: g.get("publishedOn", ""),
                reverse=True,
            )
            target_groups = sorted_groups[: args.recent]
        else:
            target_groups = groups

        # Step 4 -- fetch products + prices per set
        print()
        print("=" * 60)
        print(f"Step 4: Syncing products & prices for {len(target_groups)} set(s)")
        print("=" * 60)

        total = len(target_groups)
        for idx, group in enumerate(target_groups, start=1):
            try:
                sync_set_data(client, group, idx, total, args.dry_run)
            except Exception as exc:
                gid = group.get("groupId", "?")
                print(f"  [!] Set {gid} failed: {exc}. Continuing ...")

        # Step 5 -- refresh materialized view / metrics
        print()
        print("=" * 60)
        print("Step 5: Refreshing price metrics")
        print("=" * 60)
        _rpc(client, "refresh_price_metrics", args.dry_run)

        # Summary
        print()
        print("=" * 60)
        print("Done!")
        print(f"  Total API requests made: {_request_count}")
        print(f"  TCGCSV last updated: {last_updated}")
        print("=" * 60)

    finally:
        client.close()


if __name__ == "__main__":
    main()
