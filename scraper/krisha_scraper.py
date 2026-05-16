import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests
import re
import json
import time
import statistics
from bs4 import BeautifulSoup
from collections import defaultdict

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9",
}

BASE_URL = "https://krisha.kz/arenda/kommercheskaya-nedvizhimost/almaty/"

DISTRICT_MAP = {
    "алмалинск": "Алмалы",
    "ауэзовск": "Ауэзов",
    "бостандыкск": "Бостандык",
    "медеуск": "Медеу",
    "турксибск": "Турксиб",
    "жетысуск": "Жетысу",
    "алатауск": "Алатау",
    "наурызбайск": "Наурызбай",
}

# Exclude pure warehouse/industrial listings
EXCLUDE_KEYWORDS = ["склад", "завод", "промбаз", "производств", "гараж", "автосервис"]

def detect_district(text: str) -> str | None:
    text_lower = text.lower()
    for key, name in DISTRICT_MAP.items():
        if key in text_lower:
            return name
    return None

def parse_price_m2(price_text: str) -> float | None:
    # price_text: "2 674 000 〒 за месяц 7 000 〒 за м²"  (with \xa0 non-breaking spaces)
    # specifically match the number before "〒 за м²" (not "за месяц")
    match = re.search(r"([\d\xa0\s]+)\s*[〒₸]\s*за\s*м²", price_text)
    if not match:
        return None
    cleaned = re.sub(r"[\xa0\s]", "", match.group(1))
    try:
        val = float(cleaned)
        return val if 500 <= val <= 80_000 else None
    except ValueError:
        return None

def scrape_page(page: int) -> list[dict]:
    url = BASE_URL if page == 1 else f"{BASE_URL}?page={page}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
    except Exception as e:
        print(f"  Error page {page}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    cards = soup.find_all(class_=re.compile(r"\ba-card\b"))
    results = []

    for card in cards:
        card_text = card.get_text(" ", strip=True)

        # skip warehouses/industrial
        if any(kw in card_text.lower() for kw in EXCLUDE_KEYWORDS):
            # allow if also has office keywords (mixed use)
            office_kw = ["офис", "магазин", "бутик", "медцентр", "образование"]
            if not any(kw in card_text.lower() for kw in office_kw):
                continue

        district = detect_district(card_text)
        if not district:
            continue

        # find price element
        price_els = card.find_all(class_=re.compile("price"))
        price_m2 = None
        for el in price_els:
            price_m2 = parse_price_m2(el.get_text(" ", strip=True))
            if price_m2:
                break

        if not price_m2:
            continue

        results.append({"district": district, "price_m2": price_m2})

    return results


def main():
    print("Scraping Krisha.kz — commercial rentals in Almaty")
    print("Fetching 30 pages (~600 listings)\n")

    all_listings = []
    MAX_PAGES = 30

    for page in range(1, MAX_PAGES + 1):
        items = scrape_page(page)
        all_listings.extend(items)
        print(f"  Page {page:2d}: +{len(items):2d} listings  (total: {len(all_listings)})")
        time.sleep(1.0)

    print(f"\nTotal: {len(all_listings)} usable office/commercial listings\n")

    by_district: dict[str, list[float]] = defaultdict(list)
    for item in all_listings:
        by_district[item["district"]].append(item["price_m2"])

    print("=" * 58)
    print(f"{'Район':<15} {'Объявл.':>8}  {'Среднее':>12}  {'Медиана':>12}")
    print("=" * 58)

    result = {}
    districts_order = ["Алмалы","Ауэзов","Бостандык","Медеу","Турксиб","Жетысу","Алатау","Наурызбай"]
    for district in districts_order:
        prices = by_district.get(district, [])
        if prices:
            avg = round(statistics.mean(prices))
            med = round(statistics.median(prices))
            print(f"{district:<15} {len(prices):>8}  {avg:>10,} tg  {med:>10,} tg")
            result[district] = {
                "count": len(prices),
                "avg_price_m2_tg": avg,
                "median_price_m2_tg": med,
                "samples": sorted(prices),
            }
        else:
            print(f"{district:<15} {'—':>8}")
            result[district] = {"count": 0, "avg_price_m2_tg": None, "median_price_m2_tg": None}

    print("=" * 58)

    with open("krisha_district_rents.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\nSaved to krisha_district_rents.json")


if __name__ == "__main__":
    main()