```javascript
"use strict";

const DATA_URL = "./data/current.json";
const STATS_URL = "./data/stats.json";

const state = {
    products: [],
    filteredProducts: [],
    categories: new Map(),
    stats: null,

    search: "",
    category: "all",
    sort: "rank",

    page: 1,
    perPage: 48
};


// ============================================================
// ELEMENTS
// ============================================================

const elements = {
    totalProducts: document.getElementById("totalProducts"),
    topProduct: document.getElementById("topProduct"),
    totalCategories: document.getElementById("totalCategories"),
    lastUpdate: document.getElementById("lastUpdate"),

    searchInput: document.getElementById("searchInput"),
    clearSearch: document.getElementById("clearSearch"),

    categoryFilter: document.getElementById("categoryFilter"),
    sortSelect: document.getElementById("sortSelect"),

    resultsCount: document.getElementById("resultsCount"),
    loadingText: document.getElementById("loadingText"),

    productsGrid: document.getElementById("productsGrid"),
    emptyState: document.getElementById("emptyState"),

    pagination: document.getElementById("pagination")
};


// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {

    try {

        setLoading(true);

        const cacheBust = `?v=${Date.now()}`;

        const [currentResponse, statsResponse] =
            await Promise.all([
                fetch(`${DATA_URL}${cacheBust}`),
                fetch(`${STATS_URL}${cacheBust}`)
            ]);

        if (!currentResponse.ok) {
            throw new Error(
                `current.json HTTP ${currentResponse.status}`
            );
        }

        const data =
            await currentResponse.json();

        let stats = null;

        if (statsResponse.ok) {
            stats = await statsResponse.json();
        }

        state.stats = stats;

        state.products =
            Array.isArray(data.products)
                ? data.products
                : [];

        buildCategories();

        renderStats(data);

        renderCategoryFilter();

        applyFilters();

        renderAdvancedSections();

        setLoading(false);

    } catch (error) {

        console.error(
            "Failed to load data:",
            error
        );

        setLoading(false);

        elements.loadingText.textContent =
            "خطا در دریافت اطلاعات";
    }
}


// ============================================================
// CATEGORIES
// ============================================================

function buildCategories() {

    state.categories.clear();

    for (const product of state.products) {

        const categories =
            Array.isArray(product.categories)
                ? product.categories
                : [];

        for (const category of categories) {

            if (
                category &&
                category.id !== undefined
            ) {

                state.categories.set(
                    String(category.id),
                    category.name || "بدون نام"
                );
            }
        }
    }
}


function renderCategoryFilter() {

    if (!elements.categoryFilter) {
        return;
    }

    const categories = [
        ...state.categories.entries()
    ];

    categories.sort(
        (a, b) =>
            String(a[1]).localeCompare(
                String(b[1]),
                "fa"
            )
    );

    elements.categoryFilter.innerHTML = `
        <option value="all">
            همه دسته‌ها
        </option>
    `;

    for (
        const [id, name]
        of categories
    ) {

        const option =
            document.createElement("option");

        option.value = id;
        option.textContent = name;

        elements.categoryFilter.appendChild(
            option
        );
    }
}


// ============================================================
// STATS
// ============================================================

function renderStats(data) {

    if (elements.totalProducts) {

        elements.totalProducts.textContent =
            formatNumber(
                data.total_products ??
                state.products.length
            );
    }


    const top =
        [...state.products]
            .sort(
                (a, b) =>
                    (a.rank || 999999) -
                    (b.rank || 999999)
            )[0];


    if (elements.topProduct) {

        elements.topProduct.textContent =
            top
                ? truncate(
                    top.name,
                    22
                )
                : "—";
    }


    if (elements.totalCategories) {

        elements.totalCategories.textContent =
            formatNumber(
                state.categories.size
            );
    }


    if (elements.lastUpdate) {

        elements.lastUpdate.textContent =
            data.updated_at
                ? formatDate(
                    data.updated_at
                )
                : "—";
    }
}


// ============================================================
// FILTER
// ============================================================

function applyFilters() {

    const search =
        state.search
            .trim()
            .toLocaleLowerCase("fa");


    let products =
        state.products.filter(
            product => {

                // Search
                if (search) {

                    const name =
                        String(
                            product.name || ""
                        ).toLocaleLowerCase("fa");

                    if (
                        !name.includes(search)
                    ) {
                        return false;
                    }
                }


                // Category
                if (
                    state.category !==
                    "all"
                ) {

                    const categories =
                        Array.isArray(
                            product.categories
                        )
                            ? product.categories
                            : [];

                    const found =
                        categories.some(
                            category =>
                                String(
                                    category.id
                                ) ===
                                state.category
                        );

                    if (!found) {
                        return false;
                    }
                }


                return true;
            }
        );


    sortProducts(products);

    state.filteredProducts = products;

    state.page = 1;

    render();
}


// ============================================================
// SORT
// ============================================================

function sortProducts(products) {

    switch (state.sort) {

        // ----------------------------------------------------
        // پرفروش‌ترین‌ها
        // ----------------------------------------------------

        case "best":

            products.sort(
                (a, b) =>
                    (a.rank || 999999) -
                    (b.rank || 999999)
            );

            break;


        // ----------------------------------------------------
        // جدیدترین‌ها
        // ----------------------------------------------------

        case "newest":

            products.sort(
                (a, b) =>
                    dateValue(
                        b.created_at
                    ) -
                    dateValue(
                        a.created_at
                    )
            );

            break;


        // ----------------------------------------------------
        // قدیمی‌ترین‌ها
        // ----------------------------------------------------

        case "oldest":

            products.sort(
                (a, b) =>
                    dateValue(
                        a.created_at
                    ) -
                    dateValue(
                        b.created_at
                    )
            );

            break;


        // ----------------------------------------------------
        // بیشترین فروش
        // ----------------------------------------------------

        case "sold":

            products.sort(
                (a, b) =>
                    (b.sold_count || 0) -
                    (a.sold_count || 0)
            );

            break;


        // ----------------------------------------------------
        // نام
        // ----------------------------------------------------

        case "name":

            products.sort(
                (a, b) =>
                    String(a.name || "")
                        .localeCompare(
                            String(b.name || ""),
                            "fa"
                        )
            );

            break;


        // ----------------------------------------------------
        // رشد
        // ----------------------------------------------------

        case "growth":

            products.sort(
                (a, b) =>
                    getRankChange(b.id) -
                    getRankChange(a.id)
            );

            break;


        // ----------------------------------------------------
        // افت
        // ----------------------------------------------------

        case "decline":

            products.sort(
                (a, b) =>
                    getRankChange(a.id) -
                    getRankChange(b.id)
            );

            break;


        // ----------------------------------------------------
        // رتبه فعلی
        // ----------------------------------------------------

        case "rank":

        default:

            products.sort(
                (a, b) =>
                    (a.rank || 999999) -
                    (b.rank || 999999)
            );

            break;
    }
}


// ============================================================
// RENDER
// ============================================================

function render() {

    const total =
        state.filteredProducts.length;


    if (elements.resultsCount) {

        elements.resultsCount.textContent =
            formatNumber(total);
    }


    if (!total) {

        elements.productsGrid.innerHTML = "";

        elements.emptyState.classList.remove(
            "hidden"
        );

        elements.pagination.innerHTML = "";

        return;
    }


    elements.emptyState.classList.add(
        "hidden"
    );


    const start =
        (state.page - 1) *
        state.perPage;


    const end =
        start +
        state.perPage;


    const visibleProducts =
        state.filteredProducts.slice(
            start,
            end
        );


    renderProducts(
        visibleProducts
    );


    renderPagination(
        total
    );
}


// ============================================================
// PRODUCTS
// ============================================================

function renderProducts(products) {

    elements.productsGrid.innerHTML =
        products
            .map(
                product =>
                    createProductCard(
                        product
                    )
            )
            .join("");
}


function createProductCard(product) {

    const categories =
        Array.isArray(product.categories)
            ? product.categories
            : [];


    const categoryHTML =
        categories
            .slice(0, 2)
            .map(
                category =>
                    `<span class="tag">
                        ${escapeHTML(
                            category.name
                        )}
                    </span>`
            )
            .join("");


    const sold =
        Number(
            product.sold_count || 0
        );


    const rank =
        product.rank
            ? `#${formatNumber(product.rank)}`
            : "—";


    const rankChange =
        getRankChange(product.id);


    let movementHTML = "";

    if (rankChange > 0) {

        movementHTML = `
            <span class="rank-up">
                ↑ ${formatNumber(rankChange)}
            </span>
        `;

    } else if (rankChange < 0) {

        movementHTML = `
            <span class="rank-down">
                ↓ ${formatNumber(
                    Math.abs(rankChange)
                )}
            </span>
        `;
    }


    const url =
        product.url
            ? `https://geektori.ir${product.url}`
            : "https://geektori.ir";


    return `
        <article class="product-card">

            <div class="product-top">

                <span class="rank">
                    ${rank}
                </span>

                <span class="sold">
                    🔥 ${formatNumber(sold)}
                </span>

            </div>


            <h2>
                ${escapeHTML(
                    product.name ||
                    "بدون نام"
                )}
            </h2>


            <div class="tags">
                ${categoryHTML}
            </div>


            <div class="product-meta">

                <span>
                    ایجاد:
                    ${formatDate(
                        product.created_at
                    )}
                </span>

                <span>
                    بروزرسانی:
                    ${formatDate(
                        product.updated_at
                    )}
                </span>

            </div>


            <div class="product-movement">

                ${movementHTML}

            </div>


            <a
                class="product-link"
                href="${escapeAttribute(url)}"
                target="_blank"
                rel="noopener noreferrer"
            >
                مشاهده محصول
                <span>↗</span>
            </a>

        </article>
    `;
}


// ============================================================
// ADVANCED SECTIONS
// ============================================================

function renderAdvancedSections() {

    /*
     * این تابع اطلاعات پیشرفته را آماده می‌کند.
     *
     * اگر HTML این بخش‌ها را هنوز اضافه نکرده باشی،
     * هیچ خطایی ایجاد نمی‌شود.
     */

    renderCategoryRanking();
    renderTopMovers();
    renderFreshBestSellers();
    renderProductStatus();
}


// ============================================================
// CATEGORY RANKING
// ============================================================

function renderCategoryRanking() {

    const container =
        document.getElementById(
            "categoryRanking"
        );

    if (!container) {
        return;
    }

    const stats = new Map();

    for (const product of state.products) {

        const categories =
            Array.isArray(product.categories)
                ? product.categories
                : [];

        for (const category of categories) {

            const id =
                String(category.id);

            if (!stats.has(id)) {

                stats.set(
                    id,
                    {
                        id,
                        name:
                            category.name ||
                            "بدون نام",
                        count: 0,
                        sold: 0
                    }
                );
            }

            const item =
                stats.get(id);

            item.count++;

            item.sold +=
                Number(
                    product.sold_count || 0
                );
        }
    }


    const ranking =
        [...stats.values()]
            .sort(
                (a, b) =>
                    b.count - a.count
            )
            .slice(0, 20);


    container.innerHTML =
        ranking
            .map(
                (item, index) => `
                    <div class="category-ranking-item">

                        <span>
                            #${formatNumber(
                                index + 1
                            )}
                        </span>

                        <strong>
                            ${escapeHTML(
                                item.name
                            )}
                        </strong>

                        <small>
                            ${formatNumber(
                                item.count
                            )}
 محصول
                        </small>

                    </div>
                `
            )
            .join("");
}


// ============================================================
// MOVERS
// ============================================================

function getProductStats(id) {

    if (
        !state.stats ||
        !state.stats.products
    ) {
        return null;
    }

    return (
        state.stats.products[
            String(id)
        ] || null
    );
}


function getRankChange(id) {

    const stats =
        getProductStats(id);

    return Number(
        stats?.rank_change || 0
    );
}


function renderTopMovers() {

    const growthContainer =
        document.getElementById(
            "topGrowth"
        );

    const declineContainer =
        document.getElementById(
            "topDecline"
        );


    if (
        !growthContainer &&
        !declineContainer
    ) {
        return;
    }


    const productsById =
        new Map(
            state.products.map(
                product => [
                    String(product.id),
                    product
                ]
            )
        );


    const movers =
        state.products
            .map(product => {

                const change =
                    getRankChange(
                        product.id
                    );

                return {
                    product,
                    change
                };
            });


    const growth =
        movers
            .filter(
                item =>
                    item.change > 0
            )
            .sort(
                (a, b) =>
                    b.change - a.change
            )
            .slice(0, 10);


    const decline =
        movers
            .filter(
                item =>
                    item.change < 0
            )
            .sort(
                (a, b) =>
                    a.change - b.change
            )
            .slice(0, 10);


    if (growthContainer) {

        growthContainer.innerHTML =
            growth.length
                ? growth
                    .map(
                        item =>
                            createMoverHTML(
                                item.product,
                                item.change,
                                true
                            )
                    )
                    .join("")
                : "<p>هنوز تاریخچه کافی وجود ندارد.</p>";
    }


    if (declineContainer) {

        declineContainer.innerHTML =
            decline.length
                ? decline
                    .map(
                        item =>
                            createMoverHTML(
                                item.product,
                                item.change,
                                false
                            )
                    )
                    .join("")
                : "<p>هنوز تاریخچه کافی وجود ندارد.</p>";
    }
}


function createMoverHTML(
    product,
    change,
    positive
) {

    return `
        <div class="mover-item">

            <strong>
                ${escapeHTML(
                    truncate(
                        product.name,
                        35
                    )
                )}
            </strong>

            <span>
                ${positive ? "↑" : "↓"}
                ${formatNumber(
                    Math.abs(change)
                )}
            </span>

        </div>
    `;
}


// ============================================================
// FRESH BEST SELLERS
// ============================================================

function renderFreshBestSellers() {

    const container =
        document.getElementById(
            "freshBestSellers"
        );

    if (!container) {
        return;
    }


    const products =
        [...state.products]
            .sort(
                (a, b) =>
                    dateValue(
                        b.created_at
                    ) -
                    dateValue(
                        a.created_at
                    )
            )
            .filter(
                product =>
                    Number(
                        product.sold_count || 0
                    ) > 0
            )
            .sort(
                (a, b) =>
                    Number(
                        b.sold_count || 0
                    ) -
                    Number(
                        a.sold_count || 0
                    )
            )
            .slice(0, 10);


    container.innerHTML =
        products.length
            ? products
                .map(
                    product =>
                        `
                        <div class="fresh-best-item">

                            <strong>
                                ${escapeHTML(
                                    truncate(
                                        product.name,
                                        35
                                    )
                                )}
                            </strong>

                            <span>
                                🔥
                                ${formatNumber(
                                    product.sold_count
                                )}
                            </span>

                        </div>
                        `
                )
                .join("")
            : "<p>محصولی پیدا نشد.</p>";
}


// ============================================================
// PRODUCT STATUS
// ============================================================

function renderProductStatus() {

    const container =
        document.getElementById(
            "productStatus"
        );

    if (!container) {
        return;
    }


    const total =
        state.products.length;


    const soldProducts =
        state.products.filter(
            product =>
                Number(
                    product.sold_count || 0
                ) > 0
        ).length;


    const zeroSales =
        total -
        soldProducts;


    const newProducts =
        state.products.filter(
            product =>
                isRecent(
                    product.created_at,
                    30
                )
        ).length;


    container.innerHTML = `
        <div class="status-item">
            <strong>
                ${formatNumber(total)}
            </strong>
            <span>
                کل محصولات
            </span>
        </div>

        <div class="status-item">
            <strong>
                ${formatNumber(soldProducts)}
            </strong>
            <span>
                دارای فروش
            </span>
        </div>

        <div class="status-item">
            <strong>
                ${formatNumber(zeroSales)}
            </strong>
            <span>
                بدون فروش
            </span>
        </div>

        <div class="status-item">
            <strong>
                ${formatNumber(newProducts)}
            </strong>
            <span>
                محصولات ۳۰ روز اخیر
            </span>
        </div>
    `;
}


// ============================================================
// PAGINATION
// ============================================================

function renderPagination(total) {

    const totalPages =
        Math.ceil(
            total /
            state.perPage
        );


    if (totalPages <= 1) {

        elements.pagination.innerHTML = "";

        return;
    }


    const pages = [];

    const current =
        state.page;


    pages.push(
        `
        <button
            class="page-button"
            ${current === 1 ? "disabled" : ""}
            onclick="changePage(${current - 1})"
        >
            قبلی
        </button>
        `
    );


    const start =
        Math.max(
            1,
            current - 2
        );


    const end =
        Math.min(
            totalPages,
            current + 2
        );


    if (start > 1) {

        pages.push(
            pageButton(1)
        );

        if (start > 2) {
            pages.push(
                `<span class="dots">…</span>`
            );
        }
    }


    for (
        let page = start;
        page <= end;
        page++
    ) {

        pages.push(
            pageButton(page)
        );
    }


    if (end < totalPages) {

        if (end < totalPages - 1) {
            pages.push(
                `<span class="dots">…</span>`
            );
        }

        pages.push(
            pageButton(totalPages)
        );
    }


    pages.push(
        `
        <button
            class="page-button"
            ${
                current === totalPages
                    ? "disabled"
                    : ""
            }
            onclick="changePage(${current + 1})"
        >
            بعدی
        </button>
        `
    );


    elements.pagination.innerHTML =
        pages.join("");
}


function pageButton(page) {

    return `
        <button
            class="page-button ${
                page === state.page
                    ? "active"
                    : ""
            }"
            onclick="changePage(${page})"
        >
            ${formatNumber(page)}
        </button>
    `;
}


function changePage(page) {

    const totalPages =
        Math.ceil(
            state.filteredProducts.length /
            state.perPage
        );


    if (
        page < 1 ||
        page > totalPages
    ) {
        return;
    }


    state.page = page;

    render();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// ============================================================
// EVENTS
// ============================================================

elements.searchInput.addEventListener(
    "input",
    event => {

        state.search =
            event.target.value;

        elements.clearSearch.style.display =
            state.search
                ? "block"
                : "none";

        applyFilters();
    }
);


elements.clearSearch.addEventListener(
    "click",
    () => {

        elements.searchInput.value = "";

        state.search = "";

        elements.clearSearch.style.display =
            "none";

        applyFilters();

        elements.searchInput.focus();
    }
);


elements.categoryFilter.addEventListener(
    "change",
    event => {

        state.category =
            event.target.value;

        applyFilters();
    }
);


elements.sortSelect.addEventListener(
    "change",
    event => {

        state.sort =
            event.target.value;

        applyFilters();
    }
);


// ============================================================
// HELPERS
// ============================================================

function formatNumber(value) {

    return Number(
        value || 0
    ).toLocaleString("fa-IR");
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return date.toLocaleDateString(
        "fa-IR",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    );
}


function dateValue(value) {

    const date =
        new Date(value || 0);

    return date.getTime() || 0;
}


function truncate(text, length) {

    text =
        String(
            text || ""
        );

    if (
        text.length <= length
    ) {
        return text;
    }

    return (
        text.slice(0, length) +
        "…"
    );
}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {

    return escapeHTML(value);
}


function isRecent(value, days) {

    const time =
        dateValue(value);

    if (!time) {
        return false;
    }

    const diff =
        Date.now() - time;

    return (
        diff >= 0 &&
        diff <=
        days *
        24 *
        60 *
        60 *
        1000
    );
}


function setLoading(isLoading) {

    elements.loadingText.textContent =
        isLoading
            ? "در حال دریافت اطلاعات..."
            : "اطلاعات آماده است";
}


// ============================================================
// START
// ============================================================

loadData();
```
