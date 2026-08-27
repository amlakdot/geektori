"use strict";

const DATA_URL = "./data/current.json";
const STATS_URL = "./data/stats.json";

const state = {

    products: [],
    filteredProducts: [],

    stats: null,

    categories: new Map(),

    search: "",
    category: "all",

    sort: "rank",

    view: "all",

    page: 1,
    perPage: 48
};


// ============================================================
// ELEMENTS
// ============================================================

const elements = {

    totalProducts:
        document.getElementById("totalProducts"),

    topProduct:
        document.getElementById("topProduct"),

    totalCategories:
        document.getElementById("totalCategories"),

    lastUpdate:
        document.getElementById("lastUpdate"),


    searchInput:
        document.getElementById("searchInput"),

    clearSearch:
        document.getElementById("clearSearch"),


    categoryFilter:
        document.getElementById("categoryFilter"),

    sortSelect:
        document.getElementById("sortSelect"),


    resultsCount:
        document.getElementById("resultsCount"),

    loadingText:
        document.getElementById("loadingText"),


    productsGrid:
        document.getElementById("productsGrid"),

    emptyState:
        document.getElementById("emptyState"),

    pagination:
        document.getElementById("pagination"),


    todayGrowthTitle:
        document.getElementById("todayGrowthTitle"),

    todayGrowthValue:
        document.getElementById("todayGrowthValue"),

    todayGrowthList:
        document.getElementById("todayGrowthList"),


    declineTitle:
        document.getElementById("declineTitle"),

    declineValue:
        document.getElementById("declineValue"),

    declineList:
        document.getElementById("declineList"),


    freshBestList:
        document.getElementById("freshBestList"),

    categoryRanking:
        document.getElementById("categoryRanking")
};


// ============================================================
// LOAD
// ============================================================

async function loadData() {

    try {

        setLoading(true);


        const [
            currentResponse,
            statsResponse
        ] = await Promise.all([

            fetch(
                `${DATA_URL}?v=${Date.now()}`
            ),

            fetch(
                `${STATS_URL}?v=${Date.now()}`
            )

        ]);


        if (!currentResponse.ok) {

            throw new Error(
                `Current data HTTP ${currentResponse.status}`
            );
        }


        const currentData =
            await currentResponse.json();


        let statsData = null;


        if (statsResponse.ok) {

            statsData =
                await statsResponse.json();
        }


        state.products =
            Array.isArray(
                currentData.products
            )
                ? currentData.products
                : [];


        state.stats =
            statsData;


        buildCategories();

        renderStats(
            currentData
        );

        renderCategoryFilter();

        renderAnalytics();

        applyFilters();

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
            Array.isArray(
                product.categories
            )
                ? product.categories
                : [];


        for (const category of categories) {

            if (
                category &&
                category.id !== undefined
            ) {

                state.categories.set(

                    String(
                        category.id
                    ),

                    category.name ||
                    "بدون نام"
                );
            }
        }
    }
}


function renderCategoryFilter() {

    const categories = [
        ...state.categories.entries()
    ];


    categories.sort(
        (a, b) =>
            a[1].localeCompare(
                b[1],
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
            document.createElement(
                "option"
            );


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

    elements.totalProducts.textContent =
        formatNumber(
            data.total_products ??
            state.products.length
        );


    const top =
        [...state.products]
            .sort(
                (a, b) =>
                    Number(
                        b.sold_count || 0
                    ) -
                    Number(
                        a.sold_count || 0
                    )
            )[0];


    elements.topProduct.textContent =
        top
            ? truncate(
                top.name,
                22
            )
            : "—";


    elements.totalCategories.textContent =
        formatNumber(
            state.categories.size
        );


    elements.lastUpdate.textContent =
        data.updated_at
            ? formatDate(
                data.updated_at
            )
            : "—";
}


// ============================================================
// ANALYTICS
// ============================================================

function renderAnalytics() {

    if (!state.stats) {

        renderAnalyticsFallback();

        return;
    }


    renderTodayGrowth();

    renderDecline();

    renderFreshBest();

    renderCategoryRanking();
}


// ============================================================
// TODAY GROWTH
// ============================================================

function renderTodayGrowth() {

    const products =
        getProductStats();


    const growth =
        products
            .filter(
                item =>
                    item.rank_change > 0
            )
            .sort(
                (a, b) =>
                    b.rank_change -
                    a.rank_change
            );


    if (!growth.length) {

        elements.todayGrowthTitle.textContent =
            "بدون تغییر";

        elements.todayGrowthValue.textContent =
            "—";

        elements.todayGrowthList.innerHTML =
            emptyMiniList(
                "هنوز رشد رتبه‌ای ثبت نشده"
            );

        return;
    }


    const top =
        growth[0];


    elements.todayGrowthTitle.textContent =
        truncate(
            top.name,
            20
        );


    elements.todayGrowthValue.textContent =
        `↑ ${formatNumber(
            top.rank_change
        )}`;


    elements.todayGrowthList.innerHTML =
        growth
            .slice(0, 4)
            .map(
                item =>
                    miniProduct(
                        item,
                        "up"
                    )
            )
            .join("");
}


// ============================================================
// DECLINE
// ============================================================

function renderDecline() {

    const products =
        getProductStats();


    const decline =
        products
            .filter(
                item =>
                    item.rank_change < 0
            )
            .sort(
                (a, b) =>
                    a.rank_change -
                    b.rank_change
            );


    if (!decline.length) {

        elements.declineTitle.textContent =
            "بدون افت";

        elements.declineValue.textContent =
            "—";

        elements.declineList.innerHTML =
            emptyMiniList(
                "هنوز افت رتبه‌ای ثبت نشده"
            );

        return;
    }


    const top =
        decline[0];


    elements.declineTitle.textContent =
        truncate(
            top.name,
            20
        );


    elements.declineValue.textContent =
        `↓ ${formatNumber(
            Math.abs(
                top.rank_change
            )
        )}`;


    elements.declineList.innerHTML =
        decline
            .slice(0, 4)
            .map(
                item =>
                    miniProduct(
                        item,
                        "down"
                    )
            )
            .join("");
}


// ============================================================
// FRESH BEST SELLERS
// ============================================================

function renderFreshBest() {

    const fresh =
        [...state.products]
            .filter(
                product =>
                    isNewProduct(
                        product
                    )
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
            .slice(0, 5);


    if (!fresh.length) {

        elements.freshBestList.innerHTML =
            emptyMiniList(
                "محصول جدیدی پیدا نشد"
            );

        return;
    }


    elements.freshBestList.innerHTML =
        fresh
            .map(
                product =>
                    `
                    <div class="mini-item">

                        <span class="mini-name">
                            ${escapeHTML(
                                product.name ||
                                "بدون نام"
                            )}
                        </span>

                        <span class="mini-value">
                            🔥 ${formatNumber(
                                product.sold_count
                            )}
                        </span>

                    </div>
                    `
            )
            .join("");
}


// ============================================================
// CATEGORY RANKING
// ============================================================

function renderCategoryRanking() {

    const categoryStats =
        new Map();


    for (const product of state.products) {

        const sold =
            Number(
                product.sold_count || 0
            );


        const categories =
            Array.isArray(
                product.categories
            )
                ? product.categories
                : [];


        for (const category of categories) {

            const id =
                String(
                    category.id
                );


            const current =
                categoryStats.get(
                    id
                ) || {

                    id,

                    name:
                        category.name ||
                        "بدون نام",

                    products: 0,

                    sales: 0
                };


            current.products += 1;

            current.sales += sold;


            categoryStats.set(
                id,
                current
            );
        }
    }


    const ranking =
        [...categoryStats.values()]
            .sort(
                (a, b) =>
                    b.sales -
                    a.sales
            )
            .slice(0, 5);


    if (!ranking.length) {

        elements.categoryRanking.innerHTML =
            emptyMiniList(
                "دسته‌ای وجود ندارد"
            );

        return;
    }


    elements.categoryRanking.innerHTML =
        ranking
            .map(
                (category, index) =>
                    `
                    <div class="mini-item">

                        <span class="mini-name">
                            #${formatNumber(
                                index + 1
                            )}
                            ${escapeHTML(
                                category.name
                            )}
                        </span>

                        <span class="mini-value">
                            🔥 ${formatNumber(
                                category.sales
                            )}
                        </span>

                    </div>
                    `
            )
            .join("");
}


// ============================================================
// FALLBACK
// ============================================================

function renderAnalyticsFallback() {

    elements.todayGrowthList.innerHTML =
        emptyMiniList(
            "stats.json در دسترس نیست"
        );


    elements.declineList.innerHTML =
        emptyMiniList(
            "stats.json در دسترس نیست"
        );


    renderFreshBest();

    renderCategoryRanking();
}


// ============================================================
// PRODUCT STATS
// ============================================================

function getProductStats() {

    if (!state.stats) {
        return [];
    }


    const history =
        state.stats.products || {};


    return state.products
        .map(product => {

            const item =
                history[
                    String(
                        product.id
                    )
                ] || {};


            return {

                ...product,

                previous_rank:
                    item.previous_rank ??
                    null,

                rank_change:
                    Number(
                        item.rank_change || 0
                    ),

                sold_change:
                    Number(
                        item.sold_change || 0
                    )
            };
        });
}


// ============================================================
// NEW PRODUCT
// ============================================================

function isNewProduct(product) {

    if (!product.created_at) {
        return false;
    }


    const created =
        dateValue(
            product.created_at
        );


    const now =
        Date.now();


    const days =
        (
            now -
            created
        ) /
        (
            1000 *
            60 *
            60 *
            24
        );


    return days <= 14;
}


// ============================================================
// FILTER
// ============================================================

function applyFilters() {

    const search =
        state.search
            .trim()
            .toLocaleLowerCase(
                "fa"
            );


    let products =
        getProductStats()
            .filter(
                product => {

                    if (search) {

                        const name =
                            String(
                                product.name ||
                                ""
                            )
                            .toLocaleLowerCase(
                                "fa"
                            );


                        if (
                            !name.includes(
                                search
                            )
                        ) {
                            return false;
                        }
                    }


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


    applyView(
        products
    );


    sortProducts(
        products
    );


    state.filteredProducts =
        products;


    state.page = 1;


    render();
}


// ============================================================
// VIEWS
// ============================================================

function applyView(products) {

    switch (state.view) {

        case "best":

            products.sort(
                (a, b) =>
                    Number(
                        b.sold_count || 0
                    ) -
                    Number(
                        a.sold_count || 0
                    )
            );

            break;


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


        case "growth":

        case "today-growth":

            products.sort(
                (a, b) =>
                    b.rank_change -
                    a.rank_change
            );

            break;


        case "decline":

            products.sort(
                (a, b) =>
                    a.rank_change -
                    b.rank_change
            );

            break;


        case "all":

        default:

            break;
    }
}


// ============================================================
// SORT
// ============================================================

function sortProducts(products) {

    if (
        state.view !==
        "all"
    ) {
        return;
    }


    switch (state.sort) {

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


        case "growth":

            products.sort(
                (a, b) =>
                    b.rank_change -
                    a.rank_change
            );

            break;


        case "decline":

            products.sort(
                (a, b) =>
                    a.rank_change -
                    b.rank_change
            );

            break;


        case "name":

            products.sort(
                (a, b) =>
                    String(
                        a.name || ""
                    ).localeCompare(
                        String(
                            b.name || ""
                        ),
                        "fa"
                    )
            );

            break;


        case "rank":

        default:

            products.sort(
                (a, b) =>
                    (
                        a.rank ||
                        999999
                    ) -
                    (
                        b.rank ||
                        999999
                    )
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


    elements.resultsCount.textContent =
        formatNumber(
            total
        );


    if (!total) {

        elements.productsGrid.innerHTML =
            "";


        elements.emptyState.classList.remove(
            "hidden"
        );


        elements.pagination.innerHTML =
            "";


        return;
    }


    elements.emptyState.classList.add(
        "hidden"
    );


    const start =
        (
            state.page -
            1
        ) *
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
        Array.isArray(
            product.categories
        )
            ? product.categories
            : [];


    const categoryHTML =
        categories
            .slice(0, 2)
            .map(
                category =>
                    `
                    <span class="tag">
                        ${escapeHTML(
                            category.name
                        )}
                    </span>
                    `
            )
            .join("");


    const sold =
        Number(
            product.sold_count || 0
        );


    const rank =
        product.rank
            ? `#${formatNumber(
                product.rank
            )}`
            : "—";


    const url =
        product.url
            ? `https://geektori.ir${product.url}`
            : "https://geektori.ir";


    const change =
        Number(
            product.rank_change || 0
        );


    let changeHTML =
        `
        <div class="rank-change same">
            — بدون تغییر
        </div>
        `;


    if (change > 0) {

        changeHTML =
            `
            <div class="rank-change up">
                ↑ ${formatNumber(
                    change
                )}
                رتبه
            </div>
            `;
    }


    if (change < 0) {

        changeHTML =
            `
            <div class="rank-change down">
                ↓ ${formatNumber(
                    Math.abs(
                        change
                    )
                )}
                رتبه
            </div>
            `;
    }


    return `
        <article class="product-card">

            <div class="product-top">

                <span class="rank">
                    ${rank}
                </span>

                <span class="sold">
                    🔥 ${formatNumber(
                        sold
                    )}
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


            ${changeHTML}


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


            <a
                class="product-link"
                href="${escapeAttribute(
                    url
                )}"
                target="_blank"
                rel="noopener noreferrer"
            >
                مشاهده محصول

                <span>
                    ↗
                </span>

            </a>

        </article>
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


    if (
        totalPages <= 1
    ) {

        elements.pagination.innerHTML =
            "";

        return;
    }


    const pages = [];

    const current =
        state.page;


    pages.push(
        `
        <button
            class="page-button"
            ${
                current === 1
                    ? "disabled"
                    : ""
            }
            onclick="changePage(
                ${current - 1}
            )"
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


    if (
        start > 1
    ) {

        pages.push(
            pageButton(1)
        );


        if (
            start > 2
        ) {

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
            pageButton(
                page
            )
        );
    }


    if (
        end < totalPages
    ) {

        if (
            end <
            totalPages - 1
        ) {

            pages.push(
                `<span class="dots">…</span>`
            );
        }


        pages.push(
            pageButton(
                totalPages
            )
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
            onclick="changePage(
                ${current + 1}
            )"
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
            onclick="changePage(
                ${page}
            )"
        >
            ${formatNumber(
                page
            )}
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


    state.page =
        page;


    render();


    window.scrollTo({

        top: 0,

        behavior: "smooth"
    });
}


// ============================================================
// MINI UI
// ============================================================

function miniProduct(
    item,
    type
) {

    const symbol =
        type === "up"
            ? "↑"
            : "↓";


    return `
        <div class="mini-item">

            <span class="mini-name">
                ${escapeHTML(
                    item.name ||
                    "بدون نام"
                )}
            </span>

            <span class="mini-value">
                ${symbol}
                ${formatNumber(
                    Math.abs(
                        item.rank_change
                    )
                )}
            </span>

        </div>
    `;
}


function emptyMiniList(
    text
) {

    return `
        <div class="mini-empty">
            ${escapeHTML(
                text
            )}
        </div>
    `;
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

        elements.searchInput.value =
            "";


        state.search =
            "";


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


        state.view =
            "all";


        updateActiveTab(
            "all"
        );


        applyFilters();
    }
);


// ============================================================
// ANALYTICS TABS
// ============================================================

document
    .querySelectorAll(
        ".analytics-tab"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    state.view =
                        button.dataset.view;


                    updateActiveTab(
                        state.view
                    );


                    applyFilters();
                }
            );
        }
    );


function updateActiveTab(
    view
) {

    document
        .querySelectorAll(
            ".analytics-tab"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.view ===
                    view
                );
            }
        );
}


// ============================================================
// HELPERS
// ============================================================

function formatNumber(
    value
) {

    return Number(
        value || 0
    ).toLocaleString(
        "fa-IR"
    );
}


function formatDate(
    value
) {

    if (!value) {
        return "—";
    }


    const date =
        new Date(
            value
        );


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


function dateValue(
    value
) {

    const date =
        new Date(
            value || 0
        );


    return (
        date.getTime() ||
        0
    );
}


function truncate(
    text,
    length
) {

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
        text.slice(
            0,
            length
        ) +
        "…"
    );
}


function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );
}


function setLoading(
    isLoading
) {

    elements.loadingText.textContent =
        isLoading
            ? "در حال دریافت اطلاعات..."
            : "اطلاعات آماده است";
}


// ============================================================
// START
// ============================================================

loadData();
