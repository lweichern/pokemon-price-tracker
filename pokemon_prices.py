#!/usr/bin/env python3
"""
Pokemon TCG Sealed Product Price Tracker → Google Sheets
Pulls all sealed products from TCGCSV.com, converts USD to MYR,
and writes directly to a shared Google Sheet.

Environment variables required:
  GOOGLE_CREDENTIALS - JSON string of service account credentials
  SHEET_ID - Google Sheets spreadsheet ID

Requirements: pip install gspread google-auth requests
"""

import os
import json
import time
import requests
import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from datetime import datetime

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


def connect_sheets():
    creds_file = os.environ.get("GOOGLE_CREDENTIALS_FILE")
    creds_json = os.environ.get("GOOGLE_CREDENTIALS")
    sheet_id = os.environ.get("SHEET_ID")
    if not sheet_id:
        raise ValueError("Missing SHEET_ID env var")
    if creds_file:
        with open(creds_file) as f:
            creds_data = json.load(f)
    elif creds_json:
        creds_data = json.loads(creds_json)
    else:
        raise ValueError("Missing GOOGLE_CREDENTIALS or GOOGLE_CREDENTIALS_FILE env var")
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_info(creds_data, scopes=scopes)
    gc = gspread.authorize(creds)
    return gc.open_by_key(sheet_id)


def main():
    print("=" * 60)
    print("Pokemon TCG Sealed Product Price Tracker")
    print("=" * 60)

    print("\n[1/5] Exchange rate...")
    rate = get_exchange_rate()

    print("\n[2/5] Fetching sets...")
    all_groups = fetch(f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}/groups")["results"]
    groups = {
        g["groupId"]: g["name"]
        for g in all_groups
        if any(g["name"].startswith(prefix) for prefix in ERA_PREFIXES)
    }
    print(f"  {len(groups)} sets found (filtered from {len(all_groups)} total)")

    print("\n[3/5] Scanning sealed products...")
    all_items = []
    total = len(groups)

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
                "lowPrice": None, "midPrice": None,
                "marketPrice": None, "subTypeName": "N/A"
            }])
            for px in price_entries:
                low = px.get("lowPrice")
                mid = px.get("midPrice")
                mkt = px.get("marketPrice")
                all_items.append({
                    "set": gname,
                    "product": prod["name"],
                    "market_myr": round(mkt * rate, 2) if mkt else None,
                    "url": prod.get("url", ""),
                })
                count += 1
        print(f" -> {count}")

    print(f"\n  Total: {len(all_items)} sealed products")

    print("\n[4/5] Connecting to Google Sheets...")
    spreadsheet = connect_sheets()

    try:
        ws = spreadsheet.worksheet("Sealed Products")
        ws.clear()
    except gspread.exceptions.WorksheetNotFound:
        ws = spreadsheet.add_worksheet("Sealed Products", rows=len(all_items) + 1, cols=4)

    print("\n[5/5] Writing data to sheet...")
    all_items.sort(key=lambda x: (x["set"], x["product"]))

    header = ["Set", "Product", "Market (MYR)", "TCGPlayer Link"]

    rows = [header]
    for item in all_items:
        rows.append([
            item["set"],
            item["product"],
            item["market_myr"] if item["market_myr"] else "",
            item["url"],
        ])

    # Batch write
    ws.update(range_name="A1", values=rows)

    # Format header
    ws.format("A1:D1", {
        "backgroundColor": {"red": 0.1, "green": 0.1, "blue": 0.1},
        "textFormat": {
            "bold": True,
            "foregroundColor": {"red": 1, "green": 1, "blue": 1},
            "fontSize": 11
        },
        "horizontalAlignment": "CENTER"
    })

    # Format MYR column gold
    ws.format(f"C2:C{len(rows)}", {
        "textFormat": {
            "foregroundColor": {"red": 0.79, "green": 0.66, "blue": 0.43}
        },
        "numberFormat": {"type": "NUMBER", "pattern": "#,##0.00\" MYR\""}
    })

    # Freeze header and add filter
    ws.freeze(rows=1)
    ws.set_basic_filter(f"A1:D{len(rows)}")

    # Update Info sheet
    try:
        info = spreadsheet.worksheet("Info")
        info.clear()
    except gspread.exceptions.WorksheetNotFound:
        info = spreadsheet.add_worksheet("Info", rows=10, cols=2)

    info.update(range_name="A1", values=[
        ["Pokemon TCG Sealed Product Prices", ""],
        ["", ""],
        ["Data Source", "TCGCSV.com (TCGPlayer data)"],
        ["Exchange Rate", f"1 USD = {rate} MYR"],
        ["Last Updated", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")],
        ["Total Products", str(len(all_items))],
        ["Total Sets", str(len(groups))],
        ["Schedule", "Daily at 12AM UTC / 8AM MYT"],
    ])
    info.format("A1", {"textFormat": {"bold": True, "fontSize": 14}})
    info.format("A3:A8", {"textFormat": {"bold": True}})

    # Clean up default sheet
    try:
        spreadsheet.del_worksheet(spreadsheet.worksheet("Sheet1"))
    except Exception:
        pass

    print(f"\n{'=' * 60}")
    print(f"Done! Google Sheet updated.")
    print(f"Rate: 1 USD = {rate} MYR | Products: {len(all_items)}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
