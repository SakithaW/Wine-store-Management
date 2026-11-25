/**
 * Retail Shop Bottle Management System v2.0 - Frontend Application Logic
 * Includes Product Images on POS Cards, Cart Thumbnails, Modal Preview, and Custom Photo Upload
 */

// Initial Master Catalog & Dual-State Inventory with Product Images
const DEFAULT_BOTTLES = [
    { id: 1, sku: "1001", name: "19L Drinking Water Jug", category: "Water", image: "images/19l-water.svg", liquid_price: 200.00, deposit_value: 1500.00, full_qty: 45, empty_qty: 12 },
    { id: 2, sku: "1002", name: "5L Drinking Water Refill", category: "Water", image: "images/5l-water.svg", liquid_price: 110.00, deposit_value: 450.00, full_qty: 30, empty_qty: 8 },
    { id: 3, sku: "2001", name: "12.5kg Domestic Gas Cylinder", category: "Gas", image: "images/12kg-gas.svg", liquid_price: 3650.00, deposit_value: 8500.00, full_qty: 18, empty_qty: 14 },
    { id: 4, sku: "2002", name: "5kg Mini Gas Cylinder", category: "Gas", image: "images/5kg-gas.svg", liquid_price: 1480.00, deposit_value: 4200.00, full_qty: 22, empty_qty: 6 },
    { id: 5, sku: "2003", name: "2.3kg Camping Gas Cylinder", category: "Gas", image: "images/2kg-gas.svg", liquid_price: 720.00, deposit_value: 2800.00, full_qty: 15, empty_qty: 4 },
    { id: 6, sku: "3001", name: "1L Glass Soda Crate (12 Bottles)", category: "Beverage", image: "images/soda-crate.svg", liquid_price: 1800.00, deposit_value: 1200.00, full_qty: 25, empty_qty: 19 },
    { id: 7, sku: "3002", name: "500ml Ginger Beer Glass Bottle", category: "Beverage", image: "images/ginger-beer.svg", liquid_price: 160.00, deposit_value: 100.00, full_qty: 120, empty_qty: 64 }
];

// Load State & Ensure Image Fallbacks for v1 LocalStorage data
let storedBottles = JSON.parse(localStorage.getItem("bms_bottles_v2")) || DEFAULT_BOTTLES;
let bottles = storedBottles.map((b, i) => ({
    ...b,
    image: b.image || (DEFAULT_BOTTLES[i] ? DEFAULT_BOTTLES[i].image : "images/19l-water.svg")
}));

let transactions = JSON.parse(localStorage.getItem("bms_transactions_v2")) || [];
let cart = [];
let selectedCategory = "ALL";
let activeModalBottleId = null;

// FastAPI Configuration
let apiConfig = JSON.parse(localStorage.getItem("bms_api_config")) || {
    baseUrl: "http://localhost:8000",
    useLiveApi: false
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    renderProductGrid();
    renderCart();
    renderAdminDashboard();
    setupBarcodeScannerListener();
    updateApiStatusIndicator();
    if (apiConfig && apiConfig.useLiveApi) { syncFromBackend(); }
});

// Escape user-entered text before putting it into HTML
function escHtml(v) {
    return String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Photos are stored as base64 text. Anything bigger than this is too heavy for LocalStorage (~5 MB total).
const MAX_INLINE_IMAGE_CHARS = 150000;
const DEFAULT_IMAGE = "images/19l-water.svg";

// Persistent warning banner (a normal toast is replaced by the next toast within milliseconds)
function showStorageBanner(message) {
    let el = document.getElementById("storage-banner");
    if (!el) {
        el = document.createElement("div");
        el.id = "storage-banner";
        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:200;background:#b91c1c;color:#fff;padding:10px 16px;font:600 13px system-ui,sans-serif;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(0,0,0,.4)";
        const span = document.createElement("span");
        span.id = "storage-banner-msg";
        const btn = document.createElement("button");
        btn.textContent = "Dismiss";
        btn.style.cssText = "background:rgba(255,255,255,.2);border:0;color:#fff;padding:4px 10px;border-radius:8px;cursor:pointer;font-weight:700";
        btn.onclick = () => el.remove();
        el.appendChild(span);
        el.appendChild(btn);
        document.body.appendChild(el);
    }
    document.getElementById("storage-banner-msg").textContent = message;
}

function writeState() {
    localStorage.setItem("bms_bottles_v2", JSON.stringify(bottles));
    localStorage.setItem("bms_transactions_v2", JSON.stringify(transactions));
}

// Save State to LocalStorage.
// Never throws: a full browser storage must not stop the sale / catalog update from completing on screen.
// If storage is full, oversized inline photos (from older versions) are swapped for the default icon and the save is retried.
function saveState() {
    try {
        writeState();
        return true;
    } catch (err) {
        let shrunk = 0;
        bottles.forEach(b => {
            if (typeof b.image === "string" && b.image.startsWith("data:") && b.image.length > MAX_INLINE_IMAGE_CHARS) {
                b.image = DEFAULT_IMAGE;
                shrunk++;
            }
        });
        try {
            writeState();
            showStorageBanner(`Browser storage was full: ${shrunk} oversized product photo(s) were reset to the default icon so sales can be saved. Re-upload them in Admin (photos are now auto-resized).`);
            return true;
        } catch (err2) {
            console.error("saveState failed:", err2);
            showStorageBanner("Browser storage is full - recent changes are NOT saved. Close the register / export reports and clear old browser data.");
            return false;
        }
    }
}

// Switch between POS Cashier View and Admin Manager View
function switchView(view) {
    const posView = document.getElementById("view-pos");
    const adminView = document.getElementById("view-admin");
    const btnPos = document.getElementById("btn-pos-view");
    const btnAdmin = document.getElementById("btn-admin-view");

    if (view === "pos") {
        posView.classList.remove("hidden");
        adminView.classList.add("hidden");
        btnPos.className = "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white shadow";
        btnAdmin.className = "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-slate-400 hover:text-white";
        renderProductGrid();
    } else {
        posView.classList.add("hidden");
        adminView.classList.remove("hidden");
        btnAdmin.className = "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white shadow";
        btnPos.className = "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-slate-400 hover:text-white";
        renderAdminDashboard();
    }
}

// Filter Categories on POS Grid
function filterCategory(category) {
    selectedCategory = category;
    document.querySelectorAll(".cat-btn").forEach(btn => {
        if (btn.textContent.includes(category) || (category === "ALL" && btn.textContent.includes("All"))) {
            btn.className = "cat-btn active px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white";
        } else {
            btn.className = "cat-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-slate-400 hover:text-white border border-slate-700";
        }
    });
    renderProductGrid();
}

// Render Bottle Cards on POS Screen with Product Images
function renderProductGrid() {
    const grid = document.getElementById("product-grid");
    const searchQuery = document.getElementById("barcode-search").value.trim().toLowerCase();

    const filtered = bottles.filter(b => {
        const matchesCat = selectedCategory === "ALL" || b.category === selectedCategory;
        const matchesSearch = b.name.toLowerCase().includes(searchQuery) || b.sku.toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center text-slate-400">
                <i class="fa-solid fa-box-open text-3xl mb-2"></i>
                <p class="font-semibold">No matching bottle types found.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(b => {
        const stockBadge = b.full_qty > 5 
            ? `<span class="text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">Full: ${b.full_qty}</span>`
            : `<span class="text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full animate-pulse">Low Full: ${b.full_qty}</span>`;

        return `
            <div onclick="openActionModal(${b.id})" class="bottle-card cursor-pointer bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-blue-500 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg">
                <!-- Product Image Showcase Area -->
                <div class="relative bg-slate-900/90 h-40 w-full flex items-center justify-center p-3 border-b border-slate-700/70">
                    <img src="${escHtml(b.image)}" alt="${escHtml(b.name)}" onerror="this.src='images/19l-water.svg'" class="product-img-zoom h-full w-full object-contain">
                    <span class="absolute top-2.5 left-2.5 text-[11px] font-mono bg-slate-950/80 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md">SKU: ${escHtml(b.sku)}</span>
                    <div class="absolute top-2.5 right-2.5">
                        ${stockBadge}
                    </div>
                    <span class="absolute bottom-2 right-2.5 text-[11px] bg-slate-950/80 text-amber-300/90 px-2 py-0.5 rounded">Empty: ${b.empty_qty}</span>
                </div>

                <!-- Product Details & Pricing -->
                <div class="p-4 flex-1 flex flex-col justify-between">
                    <div>
                        <span class="text-[10px] font-bold uppercase tracking-wider text-blue-400">${escHtml(b.category)}</span>
                        <h3 class="font-bold text-base text-white leading-snug mt-0.5">${escHtml(b.name)}</h3>
                    </div>

                    <div class="mt-3 pt-3 border-t border-slate-700/80 flex justify-between items-center text-xs">
                        <div>
                            <span class="text-slate-400 block">Liquid Price</span>
                            <span class="font-bold text-sm text-white">Rs. ${b.liquid_price.toFixed(2)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-slate-400 block">Deposit Value</span>
                            <span class="font-bold text-sm text-amber-400">Rs. ${b.deposit_value.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Open POS Action Modal (Exchange / New Sale / Empty Return)
function openActionModal(bottleId) {
    const bottle = bottles.find(b => b.id === bottleId);
    if (!bottle) return;

    activeModalBottleId = bottleId;
    document.getElementById("modal-bottle-img").src = bottle.image || "images/19l-water.svg";
    document.getElementById("modal-bottle-sku").textContent = `SKU: ${bottle.sku}`;
    document.getElementById("modal-bottle-name").textContent = bottle.name;
    document.getElementById("modal-liquid-price").textContent = `Rs. ${bottle.liquid_price.toFixed(2)}`;
    document.getElementById("modal-deposit-price").textContent = `Rs. ${bottle.deposit_value.toFixed(2)}`;
    document.getElementById("modal-full-stock").textContent = bottle.full_qty;
    document.getElementById("modal-qty-input").value = 1;

    updateModalButtonPrices(bottle, 1);

    const modal = document.getElementById("action-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeActionModal() {
    const modal = document.getElementById("action-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    activeModalBottleId = null;
}

function adjustModalQty(delta) {
    const input = document.getElementById("modal-qty-input");
    let val = parseInt(input.value) || 1;
    val = Math.max(1, val + delta);
    input.value = val;

    const bottle = bottles.find(b => b.id === activeModalBottleId);
    if (bottle) updateModalButtonPrices(bottle, val);
}

function updateModalButtonPrices(bottle, qty) {
    const exchCost = (bottle.liquid_price * qty).toFixed(2);
    const newSaleCost = ((bottle.liquid_price + bottle.deposit_value) * qty).toFixed(2);
    const returnRefund = (bottle.deposit_value * qty).toFixed(2);

    document.getElementById("btn-price-exchange").textContent = `Rs. ${exchCost}`;
    document.getElementById("btn-price-newsale").textContent = `Rs. ${newSaleCost}`;
    document.getElementById("btn-price-return").textContent = `- Rs. ${returnRefund}`;
}

// Confirm Action and Add to POS Cart
function confirmAction(actionType) {
    const bottle = bottles.find(b => b.id === activeModalBottleId);
    const qty = parseInt(document.getElementById("modal-qty-input").value) || 1;
    if (!bottle || qty <= 0) return;

    // Check full stock availability for New_Sale and Exchange
    if (actionType === "New_Sale" || actionType === "Exchange") {
        const alreadyInCartFull = cart
            .filter(item => item.bottle_type_id === bottle.id && (item.action_type === "New_Sale" || item.action_type === "Exchange"))
            .reduce((sum, item) => sum + item.quantity, 0);

        if (alreadyInCartFull + qty > bottle.full_qty) {
            showToast(`Insufficient Full Stock! Only ${bottle.full_qty} available.`, "error");
            return;
        }
    }

    // Check if identical bottle + action_type already exists in cart
    const existingIndex = cart.findIndex(item => item.bottle_type_id === bottle.id && item.action_type === actionType);
    if (existingIndex > -1) {
        cart[existingIndex].quantity += qty;
    } else {
        cart.push({
            bottle_type_id: bottle.id,
            name: bottle.name,
            image: bottle.image,
            action_type: actionType,
            quantity: qty,
            liquid_price: bottle.liquid_price,
            deposit_logged: bottle.deposit_value // Historical Deposit Lock
        });
    }

    closeActionModal();
    renderCart();
    showToast(`${qty}x ${bottle.name} (${actionType.replace("_", " ")}) added`);
}

// Render POS Cart with Product Image Thumbnails & Calculate Totals
function renderCart() {
    const container = document.getElementById("cart-items-container");

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="h-48 flex flex-col items-center justify-center text-slate-500">
                <i class="fa-solid fa-basket-shopping text-3xl mb-2"></i>
                <p class="text-sm font-medium">No bottles in current transaction</p>
                <p class="text-xs">Tap a product card or scan a barcode</p>
            </div>
        `;
    } else {
        container.innerHTML = cart.map((item, idx) => {
            let badgeClass = "";
            let badgeLabel = "";
            let lineTotal = 0;

            if (item.action_type === "New_Sale") {
                badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                badgeLabel = "New Sale (+Deposit)";
                lineTotal = (item.liquid_price + item.deposit_logged) * item.quantity;
            } else if (item.action_type === "Exchange") {
                badgeClass = "bg-blue-500/20 text-blue-300 border-blue-500/30";
                badgeLabel = "1-to-1 Exchange";
                lineTotal = item.liquid_price * item.quantity;
            } else if (item.action_type === "Empty_Return") {
                badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                badgeLabel = "Empty Return (-Refund)";
                lineTotal = -(item.deposit_logged * item.quantity);
            }

            const formattedTotal = lineTotal >= 0 ? `Rs. ${lineTotal.toFixed(2)}` : `- Rs. ${Math.abs(lineTotal).toFixed(2)}`;

            return `
                <div class="bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5 flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <img src="${escHtml(item.image || 'images/19l-water.svg')}" alt="${escHtml(item.name)}" class="w-11 h-11 rounded-lg object-contain bg-slate-950 border border-slate-800 p-1 shrink-0">
                        <div class="space-y-1">
                            <div class="flex items-center space-x-2">
                                <span class="font-bold text-sm text-white">${escHtml(item.name)}</span>
                                <span class="text-xs font-bold text-slate-400">x${item.quantity}</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="text-[11px] border px-2 py-0.5 rounded-md font-semibold ${badgeClass}">${badgeLabel}</span>
                                <span class="text-[11px] text-slate-400">Dep: Rs.${item.deposit_logged}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="font-bold text-sm ${lineTotal < 0 ? 'text-amber-400' : 'text-white'}">${formattedTotal}</span>
                        <button onclick="removeFromCart(${idx})" class="text-slate-500 hover:text-rose-400 transition">
                            <i class="fa-solid fa-circle-xmark text-base"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    // Calculate Summary Totals
    let liquidTotal = 0;
    let depositCharged = 0;
    let depositRefunded = 0;

    cart.forEach(item => {
        if (item.action_type === "New_Sale") {
            liquidTotal += item.liquid_price * item.quantity;
            depositCharged += item.deposit_logged * item.quantity;
        } else if (item.action_type === "Exchange") {
            liquidTotal += item.liquid_price * item.quantity;
        } else if (item.action_type === "Empty_Return") {
            depositRefunded += item.deposit_logged * item.quantity;
        }
    });

    const netGrandTotal = liquidTotal + depositCharged - depositRefunded;

    document.getElementById("summary-liquid").textContent = `Rs. ${liquidTotal.toFixed(2)}`;
    document.getElementById("summary-deposit-add").textContent = `+ Rs. ${depositCharged.toFixed(2)}`;
    document.getElementById("summary-deposit-ref").textContent = `- Rs. ${depositRefunded.toFixed(2)}`;

    const grandEl = document.getElementById("summary-grand-total");
    const refundNotice = document.getElementById("refund-notice");

    if (netGrandTotal < 0) {
        grandEl.textContent = `- Rs. ${Math.abs(netGrandTotal).toFixed(2)}`;
        grandEl.className = "text-2xl font-extrabold text-amber-400";
        refundNotice.classList.remove("hidden");
    } else {
        grandEl.textContent = `Rs. ${netGrandTotal.toFixed(2)}`;
        grandEl.className = "text-2xl font-extrabold text-emerald-400";
        refundNotice.classList.add("hidden");
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function clearCart() {
    cart = [];
    document.getElementById("customer-id-input").value = "";
    renderCart();
}

// Process Transaction (Matches FastAPI Payload & Updates Dual-State Inventory Atomically)
async function processTransaction() {
    if (cart.length === 0) {
        showToast("Cart is empty! Add bottles first.", "error");
        return;
    }

    const customerIdInput = document.getElementById("customer-id-input").value.trim();
    const payload = {
        customer_id: customerIdInput ? parseInt(customerIdInput) : null,
        items: cart.map(item => ({
            bottle_type_id: item.bottle_type_id,
            action_type: item.action_type,
            quantity: item.quantity
        }))
    };

    if (apiConfig.useLiveApi) {
        try {
            const response = await fetch(`${apiConfig.baseUrl}/transactions/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errData = await response.json();
                showToast(`FastAPI Error: ${errData.detail || 'Transaction failed'}`, "error");
                return;
            }
        } catch (err) {
            console.warn("FastAPI Server unreachable, committing to local storage state.", err);
        }
    }

    // Atomic Local Inventory & Transaction Update
    let totalPaid = 0;
    for (const item of cart) {
        const bottle = bottles.find(b => b.id === item.bottle_type_id);
        if (!bottle) continue;

        if (item.action_type === "New_Sale") {
            bottle.full_qty -= item.quantity;
            totalPaid += (bottle.liquid_price + item.deposit_logged) * item.quantity;
        } else if (item.action_type === "Exchange") {
            bottle.full_qty -= item.quantity;
            bottle.empty_qty += item.quantity;
            totalPaid += bottle.liquid_price * item.quantity;
        } else if (item.action_type === "Empty_Return") {
            bottle.empty_qty += item.quantity;
            totalPaid -= item.deposit_logged * item.quantity;
        }
    }

    const newTx = {
        id: transactions.length + 1001,
        timestamp: new Date().toLocaleString(),
        customer_id: payload.customer_id || "Walk-in",
        total_paid: totalPaid,
        items: [...cart]
    };

    transactions.unshift(newTx);
    saveState();

    clearCart();
    if (apiConfig && apiConfig.useLiveApi) { await syncFromBackend(); }
    renderProductGrid();
    document.getElementById("pos-receipt-id").textContent = `Receipt #TX-${newTx.id + 1}`;
    showToast(`Transaction #TX-${newTx.id} Committed! Total: Rs. ${totalPaid.toFixed(2)}`);
}

// Barcode Scanner Listener
function setupBarcodeScannerListener() {
    const searchInput = document.getElementById("barcode-search");
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const query = searchInput.value.trim().toLowerCase();
            if (!query) return;

            const match = bottles.find(b => b.sku.toLowerCase() === query || b.name.toLowerCase().includes(query));
            if (match) {
                openActionModal(match.id);
                searchInput.value = "";
                renderProductGrid();
            } else {
                showToast(`Barcode "${query}" not found in catalog`, "error");
            }
        }
    });
}

// ==========================================
// ADMIN DASHBOARD & IMAGE UPLOAD FUNCTIONS
// ==========================================
function renderAdminDashboard() {
    let totalFullValue = 0;
    let totalFullUnits = 0;
    let totalEmptyUnits = 0;

    bottles.forEach(b => {
        totalFullValue += b.full_qty * (b.liquid_price + b.deposit_value);
        totalFullUnits += b.full_qty;
        totalEmptyUnits += b.empty_qty;
    });

    const openTransactions = transactions.filter(tx => !tx.closed_id);
    const todaySales = openTransactions.reduce((sum, tx) => sum + tx.total_paid, 0);

    document.getElementById("kpi-full-value").textContent = `Rs. ${totalFullValue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById("kpi-full-units").textContent = totalFullUnits;
    document.getElementById("kpi-empty-units").textContent = totalEmptyUnits;
    document.getElementById("kpi-today-sales").textContent = `Rs. ${todaySales.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    document.getElementById("kpi-tx-count").textContent = openTransactions.length;

    // Render Inventory Table with Product Thumbnails
    const tbody = document.getElementById("admin-inventory-tbody");
    tbody.innerHTML = bottles.map(b => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-6">
                <div class="flex items-center space-x-3">
                    <img src="${escHtml(b.image)}" alt="${escHtml(b.name)}" onerror="this.src='images/19l-water.svg'" class="w-12 h-12 rounded-xl object-contain bg-slate-900 border border-slate-200 p-1 shrink-0">
                    <span class="font-bold text-slate-900">${escHtml(b.name)}</span>
                </div>
            </td>
            <td class="py-3.5 px-6 font-mono text-xs text-slate-500">#${b.id} (${escHtml(b.sku)})</td>
            <td class="py-3.5 px-6"><span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${escHtml(b.category)}</span></td>
            <td class="py-3.5 px-6 font-semibold text-slate-700">Rs. ${b.liquid_price.toFixed(2)}</td>
            <td class="py-3.5 px-6 font-semibold text-amber-600">Rs. ${b.deposit_value.toFixed(2)}</td>
            <td class="py-3.5 px-6 text-center">
                <span class="px-3 py-1 rounded-lg font-bold ${b.full_qty > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${b.full_qty}</span>
            </td>
            <td class="py-3.5 px-6 text-center">
                <span class="px-3 py-1 rounded-lg font-bold bg-amber-100 text-amber-700">${b.empty_qty}</span>
            </td>
            <td class="py-3.5 px-6 text-right space-x-2">
                <button onclick="openEditBottleModal(${b.id})" class="text-blue-600 hover:text-blue-800 font-semibold text-xs bg-blue-50 px-3 py-1.5 rounded-lg">
                    <i class="fa-solid fa-camera mr-1"></i>Edit / Photo
                </button>
            </td>
        </tr>
    `).join("");

    // Render Transactions Table
    const txTbody = document.getElementById("admin-tx-tbody");
    if (transactions.length === 0) {
        txTbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">No transactions recorded yet. Process a sale in the POS view!</td></tr>`;
    } else {
        txTbody.innerHTML = transactions.map(tx => {
            const itemsSummary = tx.items.map(i => 
                `<span class="inline-block bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs mr-1.5 mb-1">
                    <strong>${i.quantity}x ${escHtml(i.name)}</strong> (${i.action_type.replace('_', ' ')}) &bull; Locked Dep: Rs.${i.deposit_logged}
                </span>`
            ).join("");

            return `
                <tr class="hover:bg-slate-50">
                    <td class="py-3 px-6 font-mono font-bold text-xs text-blue-600">#TX-${tx.id}</td>
                    <td class="py-3 px-6 text-xs text-slate-500">${tx.timestamp}</td>
                    <td class="py-3 px-6 text-xs font-semibold text-slate-700">${escHtml(tx.customer_id)}</td>
                    <td class="py-3 px-6">${itemsSummary}</td>
                    <td class="py-3 px-6 text-right font-bold ${tx.total_paid < 0 ? 'text-amber-600' : 'text-emerald-600'}">
                        ${tx.total_paid < 0 ? `- Rs. ${Math.abs(tx.total_paid).toFixed(2)}` : `Rs. ${tx.total_paid.toFixed(2)}`}
                    </td>
                </tr>
            `;
        }).join("");
    }
}

// Handle Image File Upload (resized to max 480px JPEG so it fits in LocalStorage)
function handleImageUpload(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please choose an image file", "error"); input.value = ""; return; }

    const applyImage = (dataUrl) => {
        document.getElementById("form-image-preview").src = dataUrl;
        document.getElementById("form-image-url").value = dataUrl;
    };

    const reader = new FileReader();
    reader.onerror = () => showToast("Could not read that image", "error");
    reader.onload = function (e) {
        const original = e.target.result;
        if (file.type === "image/svg+xml") {
            if (original.length > MAX_INLINE_IMAGE_CHARS) showToast("SVG is too large (max ~100 KB)", "error");
            else applyImage(original);
            return;
        }
        const img = new Image();
        img.onerror = () => showToast("Could not open that image", "error");
        img.onload = () => {
            const MAX = 480;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";                       // JPEG has no transparency
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            let out = canvas.toDataURL("image/jpeg", 0.82);
            if (out.length > MAX_INLINE_IMAGE_CHARS) out = canvas.toDataURL("image/jpeg", 0.6);
            if (out.length > MAX_INLINE_IMAGE_CHARS) { showToast("Photo is still too large - choose a smaller image", "error"); return; }
            applyImage(out);
        };
        img.src = original;
    };
    reader.readAsDataURL(file);
}

// Handle Image URL Input
function handleImageUrlInput() {
    const url = document.getElementById("form-image-url").value.trim();
    if (url) {
        document.getElementById("form-image-preview").src = url;
    }
}

// Add / Edit Bottle Catalog Modal
function openAddBottleModal() {
    document.getElementById("bottle-modal-title").textContent = "Add New Bottle Type";
    document.getElementById("edit-bottle-id").value = "";
    document.getElementById("bottle-form").reset();
    document.getElementById("form-image-preview").src = "images/19l-water.svg";
    document.getElementById("form-image-url").value = "images/19l-water.svg";
    const modal = document.getElementById("bottle-form-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function openEditBottleModal(id) {
    const bottle = bottles.find(b => b.id === id);
    if (!bottle) return;

    document.getElementById("bottle-modal-title").textContent = `Edit ${bottle.name}`;
    document.getElementById("edit-bottle-id").value = bottle.id;
    document.getElementById("form-bottle-name").value = bottle.name;
    document.getElementById("form-bottle-sku").value = bottle.sku;
    document.getElementById("form-bottle-category").value = bottle.category;
    document.getElementById("form-liquid-price").value = bottle.liquid_price;
    document.getElementById("form-deposit-value").value = bottle.deposit_value;
    document.getElementById("form-full-qty").value = bottle.full_qty;
    document.getElementById("form-empty-qty").value = bottle.empty_qty;
    document.getElementById("form-image-preview").src = bottle.image || "images/19l-water.svg";
    document.getElementById("form-image-url").value = bottle.image || "images/19l-water.svg";

    const modal = document.getElementById("bottle-form-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeBottleModal() {
    const modal = document.getElementById("bottle-form-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function saveBottleType(e) {
    e.preventDefault();
    const editId = document.getElementById("edit-bottle-id").value;
    const name = document.getElementById("form-bottle-name").value.trim();
    const sku = document.getElementById("form-bottle-sku").value.trim();
    const category = document.getElementById("form-bottle-category").value;
    const image = document.getElementById("form-image-url").value.trim() || "images/19l-water.svg";
    const liquid_price = parseFloat(document.getElementById("form-liquid-price").value) || 0;
    const deposit_value = parseFloat(document.getElementById("form-deposit-value").value) || 0;
    const full_qty = parseInt(document.getElementById("form-full-qty").value) || 0;
    const empty_qty = parseInt(document.getElementById("form-empty-qty").value) || 0;

    if (!name || !sku) { showToast("Name and Barcode / SKU are required", "error"); return; }
    if (bottles.some(b => b.sku.toLowerCase() === sku.toLowerCase() && String(b.id) !== String(editId))) {
        showToast(`SKU "${sku}" is already used by another product`, "error");
        return;
    }
    if (liquid_price < 0 || deposit_value < 0 || full_qty < 0 || empty_qty < 0) { showToast("Prices and quantities cannot be negative", "error"); return; }

    const bodyData = { sku, name, category, image, liquid_price, deposit_value, full_qty, empty_qty };
    let syncedRemote = false;

    if (apiConfig && apiConfig.useLiveApi) {
        try {
            const url = editId
                ? `${apiConfig.baseUrl}/bottles/${parseInt(editId)}`
                : `${apiConfig.baseUrl}/bottles`;
            const method = editId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData)
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.detail || "Failed to save bottle to MySQL", "error");
                return;
            }
            const savedBottle = await res.json();
            if (editId) {
                const idx = bottles.findIndex(b => b.id === savedBottle.id);
                if (idx > -1) bottles[idx] = savedBottle;
                showToast("Product photo & details updated in MySQL!");
            } else {
                bottles.push(savedBottle);
                showToast("New Bottle Type added to MySQL!");
            }
            syncedRemote = true;
        } catch (err) {
            console.warn("FastAPI unreachable during saveBottleType, saving locally:", err);
        }
    }

    if (!syncedRemote) {
        if (editId) {
            const bottle = bottles.find(b => b.id === parseInt(editId));
            if (bottle) {
                Object.assign(bottle, bodyData);
            }
            showToast("Product photo & details updated!");
        } else {
            const newId = bottles.length > 0 ? Math.max(...bottles.map(b => b.id)) + 1 : 1;
            bottles.push({ id: newId, ...bodyData });
            showToast("New Bottle Type added with photo!");
        }
    }

    saveState();
    closeBottleModal();

    // Make sure the new / edited product is actually visible in the POS grid:
    // clear the search box and any category filter that would hide it.
    const searchBox = document.getElementById("barcode-search");
    if (searchBox) searchBox.value = "";
    if (selectedCategory !== "ALL" && selectedCategory !== category) {
        filterCategory("ALL");
    }
    renderAdminDashboard();
    renderProductGrid();
}

// Supplier Truck Delivery Exchange Modal
function openSupplierDeliveryModal() {
    const select = document.getElementById("supplier-bottle-select");
    select.innerHTML = bottles.map(b => `<option value="${b.id}">${escHtml(b.name)} (Full: ${b.full_qty} | Empty: ${b.empty_qty})</option>`).join("");
    const modal = document.getElementById("supplier-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeSupplierModal() {
    const modal = document.getElementById("supplier-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

async function processSupplierDelivery(e) {
    e.preventDefault();
    const bottleId = parseInt(document.getElementById("supplier-bottle-select").value);
    const fullIn = parseInt(document.getElementById("supplier-full-in").value) || 0;
    const emptyOut = parseInt(document.getElementById("supplier-empty-out").value) || 0;

    const bottle = bottles.find(b => b.id === bottleId);
    if (!bottle) return;

    if (emptyOut > bottle.empty_qty) {
        showToast(`Cannot return ${emptyOut} empties! Shop only has ${bottle.empty_qty} empty units.`, "error");
        return;
    }

    const nextFull = bottle.full_qty + fullIn;
    const nextEmpty = bottle.empty_qty - emptyOut;

    if (apiConfig && apiConfig.useLiveApi) {
        try {
            const res = await fetch(`${apiConfig.baseUrl}/bottles/${bottle.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_qty: nextFull, empty_qty: nextEmpty })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.detail || "Failed to update supplier restock in MySQL", "error");
                return;
            }
        } catch (err) {
            console.warn("FastAPI unreachable during supplier restock, saving locally:", err);
        }
    }

    bottle.full_qty = nextFull;
    bottle.empty_qty = nextEmpty;

    saveState();
    closeSupplierModal();
    renderAdminDashboard();
    renderProductGrid();
    showToast(`Supplier exchange logged for ${bottle.name}`);
}

// FastAPI Config Modal
function openApiConfigModal() {
    document.getElementById("fastapi-url-input").value = apiConfig.baseUrl;
    document.getElementById("use-live-api-checkbox").checked = apiConfig.useLiveApi;
    const modal = document.getElementById("api-config-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeApiConfigModal() {
    const modal = document.getElementById("api-config-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

function saveApiConfig() {
    apiConfig.baseUrl = document.getElementById("fastapi-url-input").value.trim();
    apiConfig.useLiveApi = document.getElementById("use-live-api-checkbox").checked;
    localStorage.setItem("bms_api_config", JSON.stringify(apiConfig));
    updateApiStatusIndicator();
    closeApiConfigModal();
    showToast("FastAPI connection settings updated!");
}

function updateApiStatusIndicator() {
    const dot = document.getElementById("api-status-dot");
    const text = document.getElementById("api-status-text");
    if (apiConfig.useLiveApi) {
        dot.className = "w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping";
        text.textContent = `FastAPI: ${apiConfig.baseUrl}`;
    } else {
        dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
        text.textContent = "Standalone / FastAPI Ready";
    }
}

// Toast Notification Helper
function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    const icon = document.getElementById("toast-icon");
    const msg = document.getElementById("toast-msg");

    msg.textContent = message;
    if (type === "error") {
        icon.className = "fa-solid fa-circle-exclamation text-rose-400";
    } else {
        icon.className = "fa-solid fa-circle-check text-emerald-400";
    }

    toast.classList.remove("translate-y-20", "opacity-0");
    setTimeout(() => {
        toast.classList.add("translate-y-20", "opacity-0");
    }, 3000);
}


// Sync bottles & transactions from FastAPI + MySQL when live API mode is enabled
async function syncFromBackend() {
    if (!apiConfig || !apiConfig.useLiveApi) return;
    try {
        const [bottlesRes, txRes, closingsRes] = await Promise.all([
            fetch(`${apiConfig.baseUrl}/bottles`),
            fetch(`${apiConfig.baseUrl}/transactions`),
            fetch(`${apiConfig.baseUrl}/closings`)
        ]);
        if (bottlesRes.ok) {
            const dbBottles = await bottlesRes.json();
            if (Array.isArray(dbBottles) && dbBottles.length > 0) {
                bottles = dbBottles;
            }
        }
        if (txRes.ok) {
            const dbTxs = await txRes.json();
            if (Array.isArray(dbTxs)) {
                transactions = dbTxs;
            }
        }
        if (closingsRes && closingsRes.ok && typeof closings !== "undefined") {
            const dbClosings = await closingsRes.json();
            if (Array.isArray(dbClosings)) {
                closings = dbClosings.map(c => ({
                    id: c.id,
                    at: c.at,
                    by: c.by,
                    float: c.float_amount,
                    counted: c.counted,
                    expected: c.expected,
                    variance: c.variance,
                    count: c.count,
                    tot: {
                        liq: c.contents_sales,
                        add: c.deposits_charged,
                        ref: c.deposit_refunds,
                        net: c.net_sales
                    },
                    rows: [],
                    txIds: c.tx_ids || []
                }));
                if (typeof saveFx === "function") saveFx();
            }
        }
        saveState();
        renderProductGrid();
        renderAdminDashboard();
        if (typeof renderCashierShiftPanel === "function") {
            renderCashierShiftPanel();
        }
    } catch (err) {
        console.warn("Could not sync from FastAPI backend:", err);
    }
}
