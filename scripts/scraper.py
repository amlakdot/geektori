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

# تعداد Snapshotهایی که نگه می‌داریم
MAX_SNAPSHOTS = 100

# تعداد تاریخچه‌ای که برای هر محصول نگه می‌داریم
MAX_PRODUCT_HISTORY = 100

ROOT_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = ROOT_DIR / "data"
HISTORY_DIR = DATA_DIR / "history"

CURRENT_FILE = DATA_DIR / "current.json"
STATS_FILE = DATA_DIR / "stats.json"


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

    return response.json()


# ============================================================
# PRODUCT PARSING
# ============================================================

def get_sold_count(product: dict) -> int:
    """
    مجموع فروش تمام Variantهای محصول.
    """

    total = 0

    for variant in product.get("product_variants") or []:

        sold_count = variant.get("sold_count") or 0

        try:
            total += int(sold_count)

        except (TypeError, ValueError):
            continue

    return total


def extract_product(product: dict) -> dict:
    """
    استخراج اطلاعات سبک موردنیاز سایت.
    """

    categories = []

    for category in product.get("product_categories") or []:

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
        "sold_count": get_sold_count(product),
        "created_at": product.get("created_at"),
        "updated_at": product.get("updated_at"),
        "categories": categories,
    }


# ============================================================
# SCRAPER
# ============================================================

def fetch_all_products() -> list[dict]:
    """
    دریافت تمام محصولات.

    ترتیب API حفظ می‌شود.
    چون API با sort=sold درخواست شده،
    ترتیب اولیه همان ترتیب فروش برتر سایت است.
    """

    products = []

    page = 1

    while True:

        print(f"Fetching page {page}...")

        try:

            data = fetch_page(page)

        except requests.RequestException as error:

            print(
                f"Request failed on page {page}: {error}"
            )

            print("Retrying...")

            time.sleep(2)

            try:

                data = fetch_page(page)

            except requests.RequestException as retry_error:

                raise RuntimeError(
                    f"Failed to fetch page {page}: "
                    f"{retry_error}"
                ) from retry_error

        result = data.get("result") or {}

        page_products = result.get("products") or []

        if not page_products:

            print("No more products.")

            break

        for product in page_products:

            products.append(
                extract_product(product)
            )

        print(
            f"  Found {len(page_products)} products"
        )

        if len(page_products) < PAGE_SIZE:

            break

        page += 1

        time.sleep(REQUEST_DELAY)

    return products


# ============================================================
# SNAPSHOT
# ============================================================

def create_snapshot(products: list[dict]) -> dict:
    """
    ساخت current.json.

    ترتیب محصولات دقیقاً همان ترتیب API است.
    """

    now = datetime.now(timezone.utc)

    for index, product in enumerate(
        products,
        start=1,
    ):

        product["rank"] = index

    return {
        "updated_at": now.isoformat(),

        "category": {
            "id": CATEGORY_ID,
            "name": CATEGORY_NAME,
        },

        "total_products": len(products),

        "products": products,
    }


# ============================================================
# LOAD STATS
# ============================================================

def load_stats() -> dict:
    """
    خواندن stats قبلی.
    """

    if not STATS_FILE.exists():

        return {
            "version": 2,
            "updated_at": None,
            "total_products": 0,
            "snapshots": [],
            "products": {},
        }

    try:

        with STATS_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:

            data = json.load(file)

        if not isinstance(data, dict):

            raise ValueError(
                "Invalid stats format"
            )

        data.setdefault(
            "version",
            2,
        )

        data.setdefault(
            "updated_at",
            None,
        )

        data.setdefault(
            "total_products",
            0,
        )

        data.setdefault(
            "snapshots",
            [],
        )

        data.setdefault(
            "products",
            {},
        )

        return data

    except (
        json.JSONDecodeError,
        OSError,
        ValueError,
    ):

        print(
            "Warning: stats.json is invalid."
        )

        print(
            "Creating a new stats file."
        )

        return {
            "version": 2,
            "updated_at": None,
            "total_products": 0,
            "snapshots": [],
            "products": {},
        }


# ============================================================
# CREATE STATS
# ============================================================

def create_stats(snapshot: dict) -> dict:
    """
    ساخت آمار و تاریخچه رتبه.

    شامل:

    - تاریخچه رتبه
    - تغییر رتبه
    - تغییر فروش
    - بیشترین رشد
    - بیشترین افت
    - Snapshotهای قبلی
    """

    old_stats = load_stats()

    now = snapshot["updated_at"]

    current_products = snapshot["products"]

    # --------------------------------------------------------
    # Snapshot قبلی
    # --------------------------------------------------------

    previous_snapshot = None

    if old_stats.get("snapshots"):

        previous_snapshot = (
            old_stats["snapshots"][-1]
        )

    previous_products = {}

    if previous_snapshot:

        previous_products = (
            previous_snapshot.get(
                "products",
                {},
            )
        )

    # --------------------------------------------------------
    # Product history
    # --------------------------------------------------------

    product_history = old_stats.get(
        "products",
        {},
    )

    # --------------------------------------------------------
    # Current snapshot
    # --------------------------------------------------------

    current_snapshot_products = {}

    for product in current_products:

        product_id = str(
            product["id"]
        )

        current_snapshot_products[
            product_id
        ] = {
            "rank": product["rank"],
            "sold_count": product["sold_count"],
        }

    # --------------------------------------------------------
    # Update product history
    # --------------------------------------------------------

    for product in current_products:

        product_id = str(
            product["id"]
        )

        current_rank = product["rank"]

        current_sold = (
            product["sold_count"]
        )

        previous = previous_products.get(
            product_id
        )

        previous_rank = None
        previous_sold = None

        if previous:

            previous_rank = previous.get(
                "rank"
            )

            previous_sold = previous.get(
                "sold_count"
            )

        # ----------------------------------------------------
        # Rank change
        #
        # مثال:
        #
        # قبلی 100
        # فعلی 50
        #
        # 100 - 50 = +50
        #
        # یعنی 50 رتبه رشد کرده.
        # ----------------------------------------------------

        rank_change = 0

        if previous_rank is not None:

            rank_change = (
                previous_rank
                - current_rank
            )

        # ----------------------------------------------------
        # Sales change
        # ----------------------------------------------------

        sold_change = 0

        if previous_sold is not None:

            sold_change = (
                current_sold
                - previous_sold
            )

        # ----------------------------------------------------
        # History
        # ----------------------------------------------------

        history = product_history.setdefault(
            product_id,
            {
                "history": [],
            },
        )

        history.setdefault(
            "history",
            [],
        )

        history["history"].append(
            {
                "date": now,
                "rank": current_rank,
                "sold_count": current_sold,
            }
        )

        # محدود کردن تاریخچه محصول

        if len(
            history["history"]
        ) > MAX_PRODUCT_HISTORY:

            history["history"] = (
                history["history"][
                    -MAX_PRODUCT_HISTORY:
                ]
            )

        # ----------------------------------------------------
        # Current state
        # ----------------------------------------------------

        history["current_rank"] = (
            current_rank
        )

        history["current_sold_count"] = (
            current_sold
        )

        history["previous_rank"] = (
            previous_rank
        )

        history["previous_sold_count"] = (
            previous_sold
        )

        history["rank_change"] = (
            rank_change
        )

        history["sold_change"] = (
            sold_change
        )

    # --------------------------------------------------------
    # Snapshot history
    # --------------------------------------------------------

    snapshots = old_stats.get(
        "snapshots",
        [],
    )

    snapshots.append(
        {
            "date": now,
            "products": current_snapshot_products,
        }
    )

    # محدود کردن Snapshotها

    if len(
        snapshots
    ) > MAX_SNAPSHOTS:

        snapshots = snapshots[
            -MAX_SNAPSHOTS:
        ]

    # --------------------------------------------------------
    # TOP GROWTH / DECLINE
    # --------------------------------------------------------

    growth = []

    decline = []

    for product in current_products:

        product_id = str(
            product["id"]
        )

        product_stats = (
            product_history.get(
                product_id,
                {},
            )
        )

        rank_change = (
            product_stats.get(
                "rank_change",
                0,
            )
        )

        item = {
            "id": product["id"],
            "rank": product["rank"],
            "previous_rank": product_stats.get(
                "previous_rank"
            ),
            "rank_change": rank_change,
            "sold_count": product[
                "sold_count"
            ],
            "sold_change": product_stats.get(
                "sold_change",
                0,
            ),
        }

        if rank_change > 0:

            growth.append(item)

        elif rank_change < 0:

            decline.append(item)

    # بهترین رشد

    growth.sort(
        key=lambda item: (
            item["rank_change"],
            item["sold_change"],
        ),
        reverse=True,
    )

    # بدترین افت

    decline.sort(
        key=lambda item: (
            item["rank_change"],
            item["sold_change"],
        )
    )

    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    return {
        "version": 2,

        "updated_at": now,

        "total_products": snapshot[
            "total_products"
        ],

        "snapshots": snapshots,

        "top_growth": growth[:100],

        "top_decline": decline[:100],

        "products": product_history,
    }


# ============================================================
# SAVE
# ============================================================

def write_json(
    file_path: Path,
    data: dict,
) -> None:
    """
    ذخیره JSON فشرده.
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
    snapshot: dict,
) -> None:

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
    # STATS
    # --------------------------------------------------------

    stats = create_stats(
        snapshot
    )

    write_json(
        STATS_FILE,
        stats,
    )

    # --------------------------------------------------------
    # HISTORY
    # --------------------------------------------------------

    timestamp = datetime.now(
        timezone.utc
    )

    history_file = (
        HISTORY_DIR
        / (
            f"{timestamp.strftime('%Y-%m-%d_%H-%M-%S')}.json"
        )
    )

    write_json(
        history_file,
        snapshot,
    )

    # --------------------------------------------------------
    # LOG
    # --------------------------------------------------------

    print()

    print(
        f"Saved current data to: "
        f"{CURRENT_FILE}"
    )

    print(
        f"Saved stats to: "
        f"{STATS_FILE}"
    )

    print(
        f"Saved history to: "
        f"{history_file}"
    )

    print(
        f"Snapshots stored: "
        f"{len(stats['snapshots'])}"
    )

    print(
        f"Products with history: "
        f"{len(stats['products'])}"
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
            "No products were returned by "
            "Geektori API."
        )

    print()

    print(
        f"Total products: "
        f"{len(products)}"
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
