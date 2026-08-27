import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests


BASE_URL = "https://geektori.ir/api/v1/products"

CATEGORY_ID = 10
PAGE_SIZE = 40

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
HISTORY_DIR = DATA_DIR / "history"

CURRENT_FILE = DATA_DIR / "current.json"


def fetch_page(page_number: int) -> dict:
    """دریافت یک صفحه از محصولات گیکتوری."""

    filters = json.dumps(
        [
            {
                "name": "similar_to",
                "value": {
                    "entity_name": "product_category",
                    "entity_id": CATEGORY_ID,
                },
            }
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )

    params = {
        "page_number": page_number,
        "page_size": PAGE_SIZE,
        "filters[]": filters,
        "sort": "sold",
    }

    response = requests.get(
        BASE_URL,
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json()


def extract_product(product: dict) -> dict:
    """فقط اطلاعات مورد نیاز محصول را استخراج می‌کند."""

    categories = []

    for category in product.get("product_categories") or []:
        categories.append(
            {
                "id": category.get("id"),
                "name": category.get("name"),
            }
        )

    return {
        "id": product.get("id"),
        "name": product.get("name"),
        "url": product.get("url"),
        "sold_count": get_sold_count(product),
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
        "categories": categories,
    }


def get_sold_count(product: dict) -> int:
    """مجموع فروش تمام Variantهای محصول."""

    total = 0

    for variant in product.get("product_variants") or []:
        sold_count = variant.get("sold_count") or 0

        try:
            total += int(sold_count)
        except (TypeError, ValueError):
            pass

    return total


def fetch_all_products() -> list[dict]:
    """تمام صفحات محصولات را دریافت می‌کند."""

    products = []
    page = 1

    while True:
        print(f"Fetching page {page}...")

        data = fetch_page(page)

        result = data.get("result") or {}
        page_products = result.get("products") or []

        if not page_products:
            print("No more products.")
            break

        for product in page_products:
            products.append(extract_product(product))

        print(f"  Found {len(page_products)} products")

        if len(page_products) < PAGE_SIZE:
            break

        page += 1

        # کمی فاصله برای فشار نیاوردن به API
        time.sleep(0.5)

    return products


def create_snapshot(products: list[dict]) -> dict:
    """ساخت Snapshot فعلی."""

    now = datetime.now(timezone.utc)

    products.sort(
        key=lambda product: product["sold_count"],
        reverse=True,
    )

    for index, product in enumerate(products, start=1):
        product["rank"] = index

    return {
        "updated_at": now.isoformat(),
        "category": {
            "id": CATEGORY_ID,
            "name": "استیکر",
        },
        "total_products": len(products),
        "products": products,
    }


def save_data(snapshot: dict) -> None:
    """ذخیره current.json و Snapshot تاریخی."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    # داده فعلی
    with CURRENT_FILE.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            snapshot,
            file,
            ensure_ascii=False,
            indent=2,
        )

    # Snapshot تاریخی
    timestamp = datetime.now(timezone.utc)

    history_file = HISTORY_DIR / (
        f"{timestamp.strftime('%Y-%m-%d_%H-%M-%S')}.json"
    )

    with history_file.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            snapshot,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Saved current data to: {CURRENT_FILE}")
    print(f"Saved history to: {history_file}")


def main() -> None:
    print("=" * 50)
    print("Geektori scraper started")
    print("=" * 50)

    products = fetch_all_products()

    if not products:
        raise RuntimeError(
            "No products were returned by Geektori API."
        )

    print()
    print(f"Total products: {len(products)}")

    snapshot = create_snapshot(products)

    save_data(snapshot)

    print()
    print("Scraper finished successfully.")


if __name__ == "__main__":
    main()
