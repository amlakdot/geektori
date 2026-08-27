```javascript
"use strict";

/*
 * Geektori Explorer
 * Data source:
 * data/current.json
 */

const DATA_URL = "./data/current.json";

const PRODUCTS_PER_PAGE = 40;

let products = [];
let filteredProducts = [];

let currentPage = 1;

const state = {
    search: "",
    category: "all",
    sort: "rank"
};


/* =========================
   DOM
========================= */

const $ = (selector) =>
    document.querySelector(selector);

const productsGrid = $("#productsGrid");
const pagination = $("#pagination");
const emptyState = $("#emptyState");

const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");
const sortSelect = $("#sortSelect");

const totalProducts = $("#totalProducts");
const visibleProducts = $("#visibleProducts");
const categoryName = $("#categoryName");
const updatedAt = $("#updatedAt");

const resultCount = $("#resultCount");
const searchInfo = $("#searchInfo");

const clearFilters = $("#clearFilters");

const statusText = $("#statusText");
const footerUpdated = $("#footerUpdated");


/* =========================
   FORMATTERS
========================= */

function formatNumber(number) {

    return new Intl.NumberFormat("fa-IR")
        .format(Number(number) || 0);
}


function formatDate(dateString) {

    if (!dateString) {
        return "نامشخص";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return "نامشخص";
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
}


function formatDateTime(dateString) {

    if (!dateString) {
        return "نامشخص";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return "نامشخص";
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}


/* =========================
   LOAD DATA
========================= */

async function loadData() {

    try {

        statusText.textContent =
            "در حال دریافت اطلاعات...";

        const response =
            await fetch(
                `${DATA_URL}?v=${Date.now()}`
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            !Array.isArray(data.products)
        ) {
            throw new Error(
                "ساختار current.json معتبر نیست."
            );
        }

        products =
            data.products.map(
                normalizeProduct
            );

        totalProducts.textContent =
            formatNumber(
                data.total_products ??
                products.length
            );

        categoryName.textContent =
            data.category?.name ||
            "—";

        updatedAt.textContent =
            formatDateTime(
                data.updated_at
            );

        footerUpdated.textContent =
            `آخرین بروزرسانی: ${
                formatDateTime(data.updated_at)
            }`;

        buildCategoryFilter();

        filteredProducts =
            [...products];

        applyFilters();

        statusText.textContent =
            "اطلاعات بروزرسانی شده";

    } catch (error) {

        console.error(error);

        statusText.textContent =
            "خطا در دریافت اطلاعات";

        productsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">!</div>

                <h2>
                    دریافت اطلاعات ناموفق بود
                </h2>

                <p>
                    فایل data/current.json پیدا نشد
                    یا ساختار آن صحیح نیست.
                </p>
            </div>
        `;
    }
}


/* =========================
   NORMALIZE
========================= */

function normalizeProduct(product, index) {

    return {

        id: product.id,

        name:
            product.name ||
            "بدون نام",

        url:
            product.url ||
            "#",

        sold_count:
            Number(product.sold_count) || 0,

        created_at:
            product.created_at || null,

        updated_at:
            product.updated_at || null,

        categories:
            Array.isArray(product.categories)
                ? product.categories
                : [],

        rank:
            Number(product.rank) ||
            index + 1
    };
}


/* =========================
   CATEGORY FILTER
========================= */

function buildCategoryFilter() {

    const categories = new Map();

    for (const product of products) {

        for (
            const category
            of product.categories
        ) {

            if (
                category &&
                category.id != null
            ) {

                categories.set(
                    String(category.id),
                    category.name ||
                    `دسته ${category.id}`
                );
            }
        }
    }

    const sorted =
        [...categories.entries()]
            .sort(
                (a, b) =>
                    a[1].localeCompare(
                        b[1],
                        "fa"
                    )
            );

    categoryFilter.innerHTML = `
        <option value="all">
            همه دسته‌بندی‌ها
        </option>
    `;

    for (
        const [id, name]
        of sorted
    ) {

        const option =
            document.createElement("option");

        option.value = id;
        option.textContent = name;

        categoryFilter.appendChild(option);
    }
}


/* =========================
   FILTERS
========================= */

function applyFilters() {

    const search =
        state.search
            .trim()
            .toLocaleLowerCase("fa");

    filteredProducts =
        products.filter(product => {

            /* Search */

            if (search) {

                const searchable = [

                    product.name,

                    String(product.id),

                    ...product.categories.map(
                        category =>
                            category.name
                    )

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLocaleLowerCase("fa");

                if (
                    !searchable.includes(search)
                ) {
                    return false;
                }
            }


            /* Category */

            if (
                state.category !== "all"
            ) {

                const found =
                    product.categories.some(
                        category =>
                            String(category.id) ===
                            String(state.category)
                    );

                if (!found) {
                    return false;
                }
            }

            return true;
        });


    sortProducts();

    currentPage = 1;

    render();
}


/* =========================
   SORT
========================= */

function sortProducts() {

    switch (state.sort) {

        case "rank":

            filteredProducts.sort(
                (a, b) =>
                    a.rank - b.rank
            );

            break;


        case "sold":

            filteredProducts.sort(
                (a, b) =>
                    b.sold_count -
                    a.sold_count
            );

            break;


        case "newest":

            filteredProducts.sort(
                (a, b) =>
                    getTime(b.created_at) -
                    getTime(a.created_at)
            );

            break;


        case "oldest":

            filteredProducts.sort(
                (a, b) =>
                    getTime(a.created_at) -
                    getTime(b.created_at)
            );

            break;


        case "name":

            filteredProducts.sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        "fa"
                    )
            );

            break;
    }
}


function getTime(value) {

    const time =
        new Date(value || 0)
            .getTime();

    return Number.isNaN(time)
        ? 0
        : time;
}


/* =========================
   RENDER
========================= */

function render() {

    const total =
        filteredProducts.length;

    const pageCount =
        Math.ceil(
            total /
            PRODUCTS_PER_PAGE
        );


    if (
        currentPage >
        Math.max(pageCount, 1)
    ) {
        currentPage =
            Math.max(pageCount, 1);
    }


    const start =
        (currentPage - 1) *
        PRODUCTS_PER_PAGE;

    const end =
        start +
        PRODUCTS_PER_PAGE;

    const pageProducts =
        filteredProducts.slice(
            start,
            end
        );


    visibleProducts.textContent =
        formatNumber(total);

    resultCount.textContent =
        `${formatNumber(total)} محصول`;


    if (
        state.search ||
        state.category !== "all"
    ) {

        searchInfo.textContent =
            "با فیلتر فعلی";

    } else {

        searchInfo.textContent =
            "";
    }


    if (pageProducts.length === 0) {

        productsGrid.innerHTML = "";

        emptyState.classList.remove(
            "hidden"
        );

    } else {

        emptyState.classList.add(
            "hidden"
        );

        renderProducts(
            pageProducts
        );
    }


    renderPagination(
        pageCount
    );
}


/* =========================
   PRODUCTS
========================= */

function renderProducts(items) {

    /*
     * فقط 40 محصول صفحه فعلی ساخته می‌شود.
     * بنابراین 10k محصول وارد DOM نمی‌شوند.
     */

    productsGrid.innerHTML =
        items
            .map(createProductCard)
            .join("");
}


function createProductCard(product) {

    const categories =
        product.categories
            .slice(0, 3)
            .map(category => {

                return `
                    <span class="category-tag">
                        ${escapeHTML(
                            category.name ||
                            "بدون نام"
                        )}
                    </span>
                `;
            })
            .join("");


    const safeUrl =
        buildProductUrl(
            product.url
        );


    return `
        <article class="product-card">

            <div class="product-top">

                <span class="rank">
                    #${formatNumber(product.rank)}
                </span>

                <span class="sold">
                    فروش:
                    ${formatNumber(
                        product.sold_count
                    )}
                </span>

            </div>


            <h2 class="product-name">
                ${escapeHTML(product.name)}
            </h2>


            <div class="product-meta">
                ${
                    categories ||
                    `
                    <span class="category-tag">
                        بدون دسته
                    </span>
                    `
                }
            </div>


            <div class="product-date">
                ایجاد:
                ${formatDate(
                    product.created_at
                )}
            </div>


            <a
                class="product-link"
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
            >
                مشاهده محصول
            </a>

        </article>
    `;
}


/* =========================
   URL
========================= */

function buildProductUrl(url) {

    if (!url) {
        return "#";
    }

    if (
        url.startsWith("http://") ||
        url.startsWith("https://")
    ) {
        return url;
    }

    return `https://geektori.ir${
        url.startsWith("/")
            ? url
            : `/${url}`
    }`;
}


/* =========================
   ESCAPE
========================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================
   PAGINATION
========================= */

function renderPagination(pageCount) {

    pagination.innerHTML = "";

    if (pageCount <= 1) {
        return;
    }


    const previous =
        createPageButton(
            "‹",
            currentPage - 1,
            currentPage === 1
        );

    pagination.appendChild(
        previous
    );


    const pages =
        getVisiblePages(
            currentPage,
            pageCount
        );


    for (
        const page
        of pages
    ) {

        if (page === "...") {

            const dots =
                document.createElement(
                    "span"
                );

            dots.className =
                "page-dots";

            dots.textContent =
                "…";

            pagination.appendChild(
                dots
            );

            continue;
        }


        pagination.appendChild(
            createPageButton(
                formatNumber(page),
                page,
                false,
                page === currentPage
            )
        );
    }


    const next =
        createPageButton(
            "›",
            currentPage + 1,
            currentPage === pageCount
        );

    pagination.appendChild(
        next
    );
}


function createPageButton(
    label,
    page,
    disabled = false,
    active = false
) {

    const button =
        document.createElement(
            "button"
        );

    button.className =
        "page-btn";

    if (active) {
        button.classList.add(
            "active"
        );
    }

    button.textContent =
        label;

    button.disabled =
        disabled;

    button.addEventListener(
        "click",
        () => {

            currentPage = page;

            render();

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    );

    return button;
}


function getVisiblePages(
    current,
    total
) {

    if (total <= 7) {

        return Array.from(
            { length: total },
            (_, i) => i + 1
        );
    }


    const pages = [
        1
    ];


    if (current > 4) {
        pages.push("...");
    }


    const start =
        Math.max(
            2,
            current - 1
        );

    const end =
        Math.min(
            total - 1,
            current + 1
        );


    for (
        let i = start;
        i <= end;
        i++
    ) {

        pages.push(i);
    }


    if (current < total - 3) {
        pages.push("...");
    }


    pages.push(total);

    return pages;
}


/* =========================
   EVENTS
========================= */

let searchTimer = null;

searchInput.addEventListener(
    "input",
    () => {

        clearTimeout(
            searchTimer
        );

        searchTimer =
            setTimeout(
                () => {

                    state.search =
                        searchInput.value;

                    applyFilters();

                },
                120
            );
    }
);


categoryFilter.addEventListener(
    "change",
    () => {

        state.category =
            categoryFilter.value;

        applyFilters();
    }
);


sortSelect.addEventListener(
    "change",
    () => {

        state.sort =
            sortSelect.value;

        applyFilters();
    }
);


clearFilters.addEventListener(
    "click",
    () => {

        state.search = "";
        state.category = "all";
        state.sort = "rank";

        searchInput.value = "";
        categoryFilter.value = "all";
        sortSelect.value = "rank";

        applyFilters();
    }
);


/* =========================
   START
========================= */

loadData();
```
