import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests


# ============================================================
# CONFIG
# ============================================================

BASE_URL = "https://geektori.ir/api/v1/products"

CATEGORY_ID = 10
CATEGORY_NAME = "استیکر"

PAGE_SIZE = 40

REQUEST_TIMEOUT = 30
REQUEST_DELAY = 0.5

ROOT_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = ROOT_DIR / "data"
HISTORY_DIR = DATA_DIR / "history"

CURRENT_FILE = DATA_DIR / "current.json"


# ============================================================
# API
# ============================================================

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
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    data = response.json()

    # ========================================================
    # DEBUG - بررسی sold_count
    # فقط برای صفحه اول
    # ========================================================

    if page_number == 1:

        print()
        print("=" * 70)
        print("SOLD COUNT DEBUG")
        print("=" * 70)

        debug_products = (
            data.get("result", {})
            .get("products", [])
        )

        for product in debug_products[:10]:

            product_id = product.get("id")
            product_name = product.get("name")

            variants = product.get(
                "product_variants"
            ) or []

            variant_sales = [
                variant.get("sold_count")
                for variant in variants
            ]

            print(
                f"ID: {product_id} | "
                f"{product_name}"
            )

            print(
                f"Variant sold_count: {variant_sales}"
            )

        print("=" * 70)
        print()

    return data


# ============================================================
# PRODUCT PARSING
# ============================================================

def get_sold_count(product: dict) -> int:
    """
    مجموع فروش تمام Variantهای محصول.
    """

    total = 0

    for variant in product.get(
        "product_variants"
    ) or []:

        sold_count = variant.get(
            "sold_count"
        ) or 0

        try:
            total += int(sold_count)

        except (TypeError, ValueError):
            continue

    return total


def extract_product(product: dict) -> dict:
    """
    فقط اطلاعات موردنیاز سایت را استخراج می‌کند.
    """

    categories = []

    for category in product.get(
        "product_categories"
    ) or []:

        category_id = category.get("id")
        category_name = category.get("name")

        if category_id is not None:

            categories.append(
                {
                    "id": category_id,
                    "name": category_name,
                }
            )

    return {
        "id": product.get("id"),
        "name": product.get("name"),
        "url": product.get("url"),

        "sold_count": get_sold_count(
            product
        ),

        "created_at": product.get(
            "created_at"
        ),

        "updated_at": product.get(
            "updated_at"
        ),

        "categories": categories,
    }


# ============================================================
# SCRAPER
# ============================================================

def fetch_all_products() -> list[dict]:
    """
    تمام صفحات محصولات را دریافت می‌کند.
    """

    products = []

    page = 1

    while True:

        print(
            f"Fetching page {page}..."
        )

        try:

            data = fetch_page(
                page
            )

        except requests.RequestException as error:

            print(
                f"Request failed on page {page}: {error}"
            )

            # یک بار تلاش مجدد
            time.sleep(2)

            try:

                data = fetch_page(
                    page
                )

            except requests.RequestException as retry_error:

                raise RuntimeError(
                    f"Failed to fetch page {page}: {retry_error}"
                ) from retry_error

        result = (
            data.get("result")
            or {}
        )

        page_products = (
            result.get("products")
            or []
        )

        if not page_products:

            print(
                "No more products."
            )

            break

        for product in page_products:

            products.append(
                extract_product(
                    product
                )
            )

        print(
            f"  Found {len(page_products)} products"
        )

        if len(page_products) < PAGE_SIZE:

            break

        page += 1

        time.sleep(
            REQUEST_DELAY
        )

    return products


# ============================================================
# SNAPSHOT
# ============================================================

def create_snapshot(
    products: list[dict]
) -> dict:
    """
    ساخت Snapshot نهایی.
    """

    now = datetime.now(
        timezone.utc
    )

    # --------------------------------------------------------
    # بررسی اینکه آیا API واقعاً فروش غیرصفر داده
    # --------------------------------------------------------

    has_real_sales = any(
        (
            product.get(
                "sold_count"
            ) or 0
        ) > 0

        for product in products
    )

    # --------------------------------------------------------
    # اگر فروش واقعی وجود داشته باشد:
    # مرتب‌سازی بر اساس فروش
    # --------------------------------------------------------

    if has_real_sales:

        products.sort(
            key=lambda product: (
                product.get(
                    "sold_count"
                ) or 0,

                product.get(
                    "created_at"
                ) or "",
            ),

            reverse=True,
        )

    else:

        # ----------------------------------------------------
        # اگر همه sold_count صفر باشند،
        # ترتیب API حفظ می‌شود.
        #
        # چون API با sort=sold درخواست شده،
        # فعلاً نباید ترتیب API را خراب کنیم.
        # ----------------------------------------------------

        print()
        print(
            "WARNING: All sold_count values are 0."
        )

        print(
            "Keeping API order instead of sorting by created_at."
        )

        print()

    # --------------------------------------------------------
    # Rank
    # --------------------------------------------------------

    for index, product in enumerate(
        products,
        start=1,
    ):

        product["rank"] = index

    # --------------------------------------------------------
    # Snapshot
    # --------------------------------------------------------

    return {
        "updated_at": now.isoformat(),

        "category": {
            "id": CATEGORY_ID,
            "name": CATEGORY_NAME,
        },

        "total_products": len(
            products
        ),

        "products": products,
    }


# ============================================================
# SAVE
# ============================================================

def write_json(
    file_path: Path,
    data: dict
) -> None:
    """
    JSON فشرده برای کاهش حجم فایل.
    """

    with file_path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            data,
            file,
            ensure_ascii=False,
            separators=(",", ":"),
        )


def save_data(
    snapshot: dict
) -> None:
    """
    ذخیره current.json و Snapshot تاریخی.
    """

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    HISTORY_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # --------------------------------------------------------
    # CURRENT
    # --------------------------------------------------------

    write_json(
        CURRENT_FILE,
        snapshot,
    )

    # --------------------------------------------------------
    # HISTORY
    # --------------------------------------------------------

    timestamp = datetime.now(
        timezone.utc
    )

    history_file = (
        HISTORY_DIR
        / f"{timestamp.strftime('%Y-%m-%d_%H-%M-%S')}.json"
    )

    write_json(
        history_file,
        snapshot,
    )

    print(
        f"Saved current data to: {CURRENT_FILE}"
    )

    print(
        f"Saved history to: {history_file}"
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    print("=" * 50)
    print(
        "Geektori scraper started"
    )
    print("=" * 50)

    products = fetch_all_products()

    if not products:

        raise RuntimeError(
            "No products were returned by Geektori API."
        )

    print()

    print(
        f"Total products: {len(products)}"
    )

    snapshot = create_snapshot(
        products
    )

    save_data(
        snapshot
    )

    print()

    print(
        "Scraper finished successfully."
    )


if __name__ == "__main__":
    main()
