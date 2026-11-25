/**
 * BottlePOS v6 Complete Features:
 * 1) Cashier View Processed Payment Banner + Cashier Shift Transaction History Table (visible directly in Cashier View!)
 * 2) Payment Complete & Receipt Print Ask Popup Modal (with reliable isolated iframe printing)
 * 3) Auto-clear Current Transaction Cart after Process Payment click
 * 4) Cashier / Manager PIN Login
 * 5) Daily Cash Register Closing (CSV / PDF export + resets Today's Revenue & Shift KPIs to Rs. 0.00)
 * 6) Admin Revenue Breakdown KPIs + Category & Product Delete
 */
const SHOP = { name: "BottlePOS Retail Shop", addr: "123 Main Street, Colombo", tel: "Tel: 011 000 0000" };
const PINS = { cashier: "1111", manager: "9999" };

const rs = n => (n < 0 ? "- " : "") + "Rs. " + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const $ = id => document.getElementById(id);
const show = id => { if ($(id)) { $(id).classList.remove("hidden"); $(id).classList.add("flex"); } };
const hide = id => { if ($(id)) { $(id).classList.add("hidden"); $(id).classList.remove("flex"); } };

let session = JSON.parse(sessionStorage.getItem("bms_session") || "null");
let categories = JSON.parse(localStorage.getItem("bms_categories") || "null") || ["Water", "Gas", "Beverage"];
let closings = JSON.parse(localStorage.getItem("bms_closings") || "[]");
bottles.forEach(b => { if (!categories.includes(b.category)) categories.push(b.category); });
const isMgr = () => session && session.role === "manager";
const saveFx = () => {
  try {
    localStorage.setItem("bms_categories", JSON.stringify(categories));
    localStorage.setItem("bms_closings", JSON.stringify(closings));
  } catch (err) {
    console.error("saveFx failed:", err);
    showToast("Browser storage is full - category / closing data not saved", "error");
  }
};

// ---------- Totals helpers ----------
const lineAmt = i => i.action_type === "New_Sale"
  ? (i.liquid_price + i.deposit_logged) * i.quantity
  : i.action_type === "Exchange"
    ? i.liquid_price * i.quantity
    : -i.deposit_logged * i.quantity;

function breakdown(txs) {
  let liq = 0, add = 0, ref = 0;
  txs.forEach(t => t.items.forEach(i => {
    if (i.action_type === "New_Sale") { liq += i.liquid_price * i.quantity; add += i.deposit_logged * i.quantity; }
    else if (i.action_type === "Exchange") liq += i.liquid_price * i.quantity;
    else ref += i.deposit_logged * i.quantity;
  }));
  return { liq, add, ref, net: liq + add - ref };
}
const label = a => a.replace("_", " ");

// ---------- Inject Modals & Cashier View Panels ----------
const shell = (id, inner, w = "max-w-md") => `<div id="${id}" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center z-[90] p-4"><div class="bg-white text-slate-800 rounded-2xl ${w} w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">${inner}</div></div>`;
const xbtn = id => `<button onclick="hide('${id}')" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark text-lg"></i></button>`;
const inp = "w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-blue-600";

document.body.insertAdjacentHTML("beforeend", `
<div id="login-overlay" class="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-4">
  <div class="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-7 shadow-2xl text-white">
    <div class="text-center mb-5"><div class="inline-block bg-blue-600 p-3 rounded-xl mb-2"><i class="fa-solid fa-bottle-water text-2xl"></i></div>
      <h2 class="text-xl font-bold">BottlePOS Sign In</h2><p class="text-xs text-slate-400">Choose your role and enter your PIN</p></div>
    <div class="grid grid-cols-2 gap-3 mb-4">
      <button id="role-cashier" onclick="pickRole('cashier')" class="py-3 rounded-xl font-bold text-sm border"><i class="fa-solid fa-cash-register block text-lg mb-1"></i>Cashier</button>
      <button id="role-manager" onclick="pickRole('manager')" class="py-3 rounded-xl font-bold text-sm border"><i class="fa-solid fa-user-tie block text-lg mb-1"></i>Manager</button>
    </div>
    <input id="login-pin" type="password" inputmode="numeric" placeholder="Enter PIN" onkeydown="if(event.key==='Enter')doLogin()" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-center tracking-[0.4em] text-lg focus:outline-none focus:border-blue-500">
    <p id="login-err" class="text-rose-400 text-xs text-center h-4 mt-2"></p>
    <button onclick="doLogin()" class="w-full mt-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold">Sign In</button>
    <p class="text-[11px] text-slate-500 text-center mt-4">Demo PINs: Cashier 1111 &middot; Manager 9999</p>
  </div></div>`);

document.body.insertAdjacentHTML("beforeend",
  shell("receipt-modal", `
    <div class="flex justify-between items-start mb-3">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-circle-check text-xl"></i>
        </div>
        <div>
          <h3 id="receipt-modal-title" class="font-extrabold text-slate-900 text-lg">Payment Processed! Print Receipt?</h3>
          <p class="text-xs text-slate-500">Transaction saved &amp; cart cleared. Confirm below to print customer receipt.</p>
        </div>
      </div>
      ${xbtn("receipt-modal")}
    </div>
    <!-- Cashier Quick Summary Banner inside Popup -->
    <div id="receipt-summary-banner" class="bg-slate-900 text-white rounded-xl p-3.5 mb-3 grid grid-cols-4 gap-2 text-center text-xs">
      <div><span class="text-slate-400 block">Contents</span><span id="pop-liq" class="font-bold text-sm text-white">Rs. 0.00</span></div>
      <div class="border-x border-slate-800"><span class="text-slate-400 block">Deposit (+)</span><span id="pop-dep-add" class="font-bold text-sm text-emerald-400">Rs. 0.00</span></div>
      <div class="border-r border-slate-800"><span class="text-slate-400 block">Refund (-)</span><span id="pop-dep-ref" class="font-bold text-sm text-amber-400">Rs. 0.00</span></div>
      <div><span class="text-slate-400 block">Net Total</span><span id="pop-net" class="font-extrabold text-sm text-emerald-400">Rs. 0.00</span></div>
    </div>
    <div id="receipt-body" class="bg-slate-100 border border-slate-200 rounded-xl p-3 flex justify-center max-h-[48vh] overflow-y-auto"></div>
    <div class="grid grid-cols-2 gap-3 mt-4">
      <button id="btn-skip-receipt" onclick="hide('receipt-modal')" class="py-3 px-4 rounded-xl text-sm font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition">
        <i class="fa-solid fa-xmark mr-1.5"></i>No / Skip Print (Esc)
      </button>
      <button id="btn-confirm-print" onclick="printReceiptAndClose()" class="py-3 px-5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition">
        <i class="fa-solid fa-print mr-1.5"></i>Yes, Print Receipt (Enter)
      </button>
    </div>`, "max-w-lg") +
  shell("cashier-history-modal", `
    <div class="flex justify-between items-center mb-3">
      <div>
        <h3 class="font-extrabold text-lg text-slate-900"><i class="fa-solid fa-clock-rotate-left text-blue-600 mr-2"></i>Cashier Shift Transactions &amp; Receipts</h3>
        <p class="text-xs text-slate-500">All payments processed during the current open register shift</p>
      </div>
      ${xbtn("cashier-history-modal")}
    </div>
    <div id="cashier-history-kpis" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"></div>
    <div class="overflow-x-auto border border-slate-200 rounded-xl max-h-[55vh] overflow-y-auto">
      <table class="w-full text-left border-collapse text-sm">
        <thead>
          <tr class="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200 sticky top-0">
            <th class="py-2.5 px-4 font-bold">Receipt</th>
            <th class="py-2.5 px-4 font-bold">Time</th>
            <th class="py-2.5 px-4 font-bold">Customer</th>
            <th class="py-2.5 px-4 font-bold">Items &amp; Actions</th>
            <th class="py-2.5 px-4 font-bold text-right">Net Total</th>
            <th class="py-2.5 px-4 font-bold text-right">Receipt</th>
          </tr>
        </thead>
        <tbody id="cashier-history-tbody" class="divide-y divide-slate-200"></tbody>
      </table>
    </div>
    <div class="flex justify-end mt-4">
      <button onclick="hide('cashier-history-modal')" class="px-5 py-2 rounded-xl text-sm font-bold bg-slate-800 text-white">Close</button>
    </div>`, "max-w-4xl") +
  shell("close-modal", `<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg"><i class="fa-solid fa-lock text-indigo-600 mr-2"></i>Daily Cash Register Closing</h3>${xbtn("close-modal")}</div><div id="close-body"></div>`, "max-w-2xl") +
  shell("cat-modal", `<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg"><i class="fa-solid fa-tags text-blue-600 mr-2"></i>Manage Categories</h3>${xbtn("cat-modal")}</div>
    <form onsubmit="addCategory(event)" class="flex gap-2 mb-4"><input id="new-cat" required maxlength="30" placeholder="New category name..." class="${inp}"><button class="px-4 rounded-xl bg-blue-600 text-white text-sm font-bold whitespace-nowrap">+ Add</button></form>
    <div id="cat-list" class="space-y-2"></div>`));

// Inject User Badge in Top Header
document.querySelector("header > div:last-child").insertAdjacentHTML("afterbegin", `
  <button onclick="openCashierHistoryModal()" class="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition" title="View Cashier Shift Sales & Reprint Receipts">
    <i class="fa-solid fa-receipt text-emerald-400"></i>
    <span>Shift Sales (<span id="header-shift-count">0</span>)</span>
  </button>
  <div id="user-badge" class="hidden items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
    <i class="fa-solid fa-user text-xs text-blue-400"></i><span id="user-name" class="text-xs font-semibold"></span>
    <button onclick="logout()" class="text-slate-400 hover:text-rose-400 ml-1" title="Sign out"><i class="fa-solid fa-right-from-bracket text-xs"></i></button></div>`);

// Inject Admin Header Buttons
document.querySelector("#view-admin .flex.space-x-3").insertAdjacentHTML("afterbegin", `
  <button onclick="openCategoryModal()" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm"><i class="fa-solid fa-tags mr-2"></i>Categories</button>
  <button onclick="openCloseModal()" class="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow"><i class="fa-solid fa-lock mr-2"></i>Close Register</button>`);

// Inject "Last Processed Payment" & "Cashier Shift Recent Transactions" directly inside the Cashier View (#view-pos)!
const posLeftCol = document.querySelector("#view-pos > div:first-child");
if (posLeftCol) {
  posLeftCol.insertAdjacentHTML("beforeend", `
    <div id="cashier-last-tx-bar" class="bg-slate-950 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs">
      <div id="cashier-last-tx-info" class="text-slate-400 truncate">
        <i class="fa-solid fa-clock-rotate-left mr-1 text-slate-500"></i>No payment processed in this shift yet
      </div>
      <div class="flex items-center space-x-2 shrink-0 ml-2">
        <button id="btn-cashier-last-receipt" onclick="reprintReceipt(0)" class="hidden bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-lg font-bold transition">
          <i class="fa-solid fa-print mr-1"></i>Last Receipt
        </button>
        <button onclick="openCashierHistoryModal()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg font-bold transition">
          All Shift Sales
        </button>
      </div>
    </div>
  `);
}

// Also replace the bottom Quick Instructions footer in Cashier View with a live Cashier Shift Recent Transactions strip!
const posRightCol = document.querySelector("#view-pos > div:last-child");
if (posRightCol) {
  const oldFooter = posRightCol.querySelector(".mt-auto");
  if (oldFooter) {
    oldFooter.outerHTML = `
      <div class="mt-auto bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 shadow-lg">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-700/80">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <h3 class="text-xs font-bold uppercase tracking-wider text-white">Cashier Shift Live Activity &amp; Processed Payments</h3>
          </div>
          <div class="flex items-center space-x-4 text-xs">
            <span class="text-slate-400">Shift Tx: <strong id="pos-shift-tx-count" class="text-white">0</strong></span>
            <span class="text-slate-400">Liquid Sales: <strong id="pos-shift-liq" class="text-emerald-400">Rs. 0.00</strong></span>
            <span class="text-slate-400">Net Drawer Cash: <strong id="pos-shift-net" class="text-blue-400">Rs. 0.00</strong></span>
            <button onclick="openCashierHistoryModal()" class="text-blue-400 hover:text-blue-300 font-bold underline">View Full Shift Log</button>
          </div>
        </div>
        <div id="pos-recent-tx-list" class="space-y-1.5 max-h-28 overflow-y-auto pr-1">
          <!-- Populated dynamically with Cashier's recent processed payments -->
        </div>
      </div>
    `;
  }
}

// ---------- Render Cashier View Processed Payments & Shift Info ----------
function renderCashierShiftPanel() {
  const openTxs = transactions.filter(t => !t.closed_id);
  const b = breakdown(openTxs);

  if ($("header-shift-count")) $("header-shift-count").textContent = openTxs.length;
  if ($("pos-shift-tx-count")) $("pos-shift-tx-count").textContent = openTxs.length;
  if ($("pos-shift-liq")) $("pos-shift-liq").textContent = rs(b.liq);
  if ($("pos-shift-net")) $("pos-shift-net").textContent = rs(b.net);

  // Update Left Column Last Processed Payment Bar
  const lastInfo = $("cashier-last-tx-info");
  const lastBtn = $("btn-cashier-last-receipt");
  if (lastInfo) {
    if (openTxs.length > 0) {
      const last = openTxs[0];
      const amtColor = last.total_paid < 0 ? "text-amber-400" : "text-emerald-400";
      lastInfo.innerHTML = `<span class="text-slate-400">Last:</span> <strong class="text-white">#TX-${last.id}</strong> &bull; <strong class="${amtColor}">${rs(last.total_paid)}</strong> <span class="text-slate-400">(${last.items.length} item${last.items.length === 1 ? '' : 's'})</span>`;
      if (lastBtn) lastBtn.classList.remove("hidden");
    } else {
      lastInfo.innerHTML = `<i class="fa-solid fa-clock-rotate-left mr-1 text-slate-500"></i>No payment processed in this shift yet`;
      if (lastBtn) lastBtn.classList.add("hidden");
    }
  }

  // Update Right Column Live Cashier Recent Transactions Strip
  const listEl = $("pos-recent-tx-list");
  if (listEl) {
    if (openTxs.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-400 py-2 text-center">No transactions in current shift yet. Add bottles and click "Process Payment" to see live records here.</p>`;
    } else {
      listEl.innerHTML = openTxs.slice(0, 4).map(tx => {
        const idxInAll = transactions.findIndex(t => t.id === tx.id);
        const summary = tx.items.map(i => `${i.quantity}x ${esc(i.name)} (${label(i.action_type)})`).join(", ");
        const amtClass = tx.total_paid < 0 ? "text-amber-400" : "text-emerald-400";
        return `
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
            <div class="flex items-center space-x-2.5 truncate pr-2">
              <span class="font-mono font-bold text-blue-400 shrink-0">#TX-${tx.id}</span>
              <span class="text-slate-500 shrink-0">${esc(tx.timestamp.split(",")[1] || tx.timestamp)}</span>
              <span class="text-slate-200 truncate">${summary}</span>
            </div>
            <div class="flex items-center space-x-3 shrink-0">
              <span class="font-extrabold ${amtClass}">${rs(tx.total_paid)}</span>
              <button onclick="reprintReceipt(${idxInAll})" class="bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg font-bold transition flex items-center">
                <i class="fa-solid fa-print mr-1"></i>Receipt
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

function openCashierHistoryModal() {
  const openTxs = transactions.filter(t => !t.closed_id);
  const b = breakdown(openTxs);
  const kpiBox = (l, v, c) => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3"><p class="text-[11px] font-bold uppercase text-slate-400">${l}</p><p class="text-lg font-extrabold ${c} mt-0.5">${v}</p></div>`;

  $("cashier-history-kpis").innerHTML =
    kpiBox("Shift Transactions", openTxs.length, "text-slate-900") +
    kpiBox("Liquid Sales", rs(b.liq), "text-emerald-600") +
    kpiBox("Deposits In / Out", `${rs(b.add)} / ${rs(-b.ref)}`, "text-blue-600") +
    kpiBox("Net Drawer Total", rs(b.net), b.net < 0 ? "text-amber-600" : "text-indigo-600");

  const tbody = $("cashier-history-tbody");
  if (openTxs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">No transactions processed in this shift yet.</td></tr>`;
  } else {
    tbody.innerHTML = openTxs.map(tx => {
      const idxInAll = transactions.findIndex(t => t.id === tx.id);
      const itemsHtml = tx.items.map(i =>
        `<span class="inline-block bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-xs mr-1 mb-1">
          <b>${i.quantity}x ${esc(i.name)}</b> (${label(i.action_type)}) &bull; Dep: Rs.${i.deposit_logged}
        </span>`
      ).join("");
      return `
        <tr class="hover:bg-slate-50">
          <td class="py-2.5 px-4 font-mono font-bold text-xs text-blue-600">#TX-${tx.id}</td>
          <td class="py-2.5 px-4 text-xs text-slate-500">${esc(tx.timestamp)}</td>
          <td class="py-2.5 px-4 text-xs font-semibold text-slate-700">${esc(tx.customer_id)}</td>
          <td class="py-2.5 px-4">${itemsHtml}</td>
          <td class="py-2.5 px-4 text-right font-bold ${tx.total_paid < 0 ? 'text-amber-600' : 'text-emerald-600'}">${rs(tx.total_paid)}</td>
          <td class="py-2.5 px-4 text-right">
            <button onclick="reprintReceipt(${idxInAll})" class="bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg">
              <i class="fa-solid fa-print mr-1"></i>View / Print
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }
  show("cashier-history-modal");
}

// ---------- 2. Login / roles ----------
let loginRole = "cashier";
function pickRole(r) {
  loginRole = r;
  ["cashier", "manager"].forEach(x => $("role-" + x).className = "py-3 rounded-xl font-bold text-sm border " + (x === r ? "bg-blue-600 border-blue-500" : "bg-slate-900 border-slate-700 text-slate-400"));
  $("login-pin").focus();
}
function doLogin() {
  if ($("login-pin").value === PINS[loginRole]) {
    session = { role: loginRole, name: loginRole === "manager" ? "Manager" : "Cashier" };
    sessionStorage.setItem("bms_session", JSON.stringify(session));
    $("login-pin").value = ""; $("login-err").textContent = ""; applySession();
  } else { $("login-err").textContent = "Incorrect PIN"; $("login-pin").value = ""; }
}
function logout() { sessionStorage.removeItem("bms_session"); session = null; clearCart(); applySession(); }
function applySession() {
  const on = !!session;
  $("login-overlay").classList.toggle("hidden", on);
  $("user-badge").classList.toggle("hidden", !on); $("user-badge").classList.toggle("flex", on);
  if (on) $("user-name").textContent = `${session.name} (${session.role})`;
  $("btn-admin-view").style.display = isMgr() ? "" : "none";
  switchView("pos");
  renderCashierShiftPanel();
  if (!on) pickRole("cashier");
}
const _sv = switchView;
switchView = function (v) {
  if (v === "admin" && !isMgr()) return showToast("Manager access required", "error");
  _sv(v);
  renderCashierShiftPanel();
};

// ---------- 4. Categories & delete ----------
function renderCategoryFilters() {
  const base = "cat-btn px-3.5 py-2 rounded-xl text-xs font-bold ";
  const on = base + "active bg-blue-600 text-white", off = base + "bg-slate-900 text-slate-400 hover:text-white border border-slate-700";
  $("category-filters").className = "flex flex-wrap items-center gap-2";
  $("category-filters").innerHTML = `<button onclick="filterCategory('ALL')" class="${selectedCategory === "ALL" ? on : off}">All Items</button>` +
    categories.map((c, i) => `<button onclick="filterCategory(categories[${i}])" class="${selectedCategory === c ? on : off}">${esc(c)}</button>`).join("");
}
filterCategory = function (c) { selectedCategory = c; renderCategoryFilters(); renderProductGrid(); };
function fillCategorySelect() {
  const s = $("form-bottle-category");
  s.innerHTML = categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}
["openAddBottleModal", "openEditBottleModal"].forEach(n => { const o = window[n]; window[n] = function (...a) { fillCategorySelect(); o(...a); }; });
function openCategoryModal() { renderCategoryList(); show("cat-modal"); }
function renderCategoryList() {
  $("cat-list").innerHTML = categories.length ? categories.map((c, i) => {
    const n = bottles.filter(b => b.category === c).length;
    return `<div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5"><div><span class="font-semibold">${esc(c)}</span><span class="text-xs text-slate-400 ml-2">${n} product${n === 1 ? "" : "s"}</span></div>
    <button onclick="deleteCategory(${i})" class="text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold"><i class="fa-solid fa-trash mr-1"></i>Delete</button></div>`;
  }).join("") : `<p class="text-sm text-slate-400 text-center py-4">No categories yet.</p>`;
}
function addCategory(e) {
  e.preventDefault();
  const v = $("new-cat").value.trim();
  if (!v) return;
  if (categories.some(c => c.toLowerCase() === v.toLowerCase())) return showToast("Category already exists", "error");
  categories.push(v); saveFx(); $("new-cat").value = "";
  renderCategoryList(); renderCategoryFilters(); showToast(`Category "${v}" created`);
}
function deleteCategory(i) {
  const c = categories[i], n = bottles.filter(b => b.category === c).length;
  if (n) return showToast(`Can't delete "${c}": ${n} product(s) still use it. Move or delete them first.`, "error");
  if (!confirm(`Delete category "${c}"?`)) return;
  categories.splice(i, 1); saveFx();
  if (selectedCategory === c) selectedCategory = "ALL";
  renderCategoryList(); renderCategoryFilters(); renderProductGrid(); showToast(`Category "${c}" deleted`);
}
async function deleteBottle(id) {
  const b = bottles.find(x => x.id === id); if (!b) return;
  const stock = b.full_qty + b.empty_qty;
  if (!confirm(`Delete "${b.name}"?` + (stock ? `\n\nIt still has ${b.full_qty} full and ${b.empty_qty} empty units in stock.` : "") + "\nPast receipts keep their data.")) return;

  if (typeof apiConfig !== "undefined" && apiConfig.useLiveApi) {
    try {
      const res = await fetch(`${apiConfig.baseUrl}/bottles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return showToast(errData.detail || "Failed to delete bottle from MySQL", "error");
      }
    } catch (err) {
      console.warn("FastAPI unreachable during deleteBottle, deleting locally:", err);
    }
  }

  bottles = bottles.filter(x => x.id !== id); cart = cart.filter(i => i.bottle_type_id !== id);
  saveState(); renderCart(); renderProductGrid(); renderAdminDashboard(); showToast(`"${b.name}" deleted`);
}

// ---------- Isolated Iframe Print Engine ----------
function printHtml(html, page) {
  let frame = $("print-iframe");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = "print-iframe";
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
  }
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print Receipt</title>
    <style>
      @page { size: ${page}; margin: 4mm; }
      body { margin: 0; padding: 8px; background: #fff; color: #000; display: flex; justify-content: center; }
    </style>
  </head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }, 150);
}

// ---------- 1. Thermal Receipt & Cashier Confirmation Popup ----------
let currentReceipt = null;
function receiptHtml(tx) {
  const b = breakdown([tx]), row = (l, r, bold) => `<div style="display:flex;justify-content:space-between;gap:8px;${bold ? "font-weight:bold;" : ""}"><span>${l}</span><span>${r}</span></div>`;
  const hr = `<div style="border-top:1px dashed #000;margin:6px 0"></div>`;
  return `<div style="width:72mm;font-family:'Courier New',monospace;font-size:12px;line-height:1.35;color:#000;background:#fff;padding:6px">
    <div style="text-align:center"><div style="font-size:15px;font-weight:bold">${esc(SHOP.name)}</div>${esc(SHOP.addr)}<br>${esc(SHOP.tel)}</div>${hr}
    ${row("Receipt:", "#TX-" + tx.id)}${row("Date:", esc(tx.timestamp))}${row("Cashier:", esc(tx.cashier || "-"))}${row("Customer:", esc(tx.customer_id))}${hr}
    ${tx.items.map(i => `<div style="margin-bottom:4px"><div>${esc(i.name)}</div>${row(`&nbsp;&nbsp;${i.quantity} x ${label(i.action_type)}`, rs(lineAmt(i)))}${i.action_type !== "Exchange" ? `<div style="font-size:10px;color:#444">&nbsp;&nbsp;deposit @ ${rs(i.deposit_logged)}</div>` : ""}</div>`).join("")}${hr}
    ${row("Contents:", rs(b.liq))}${row("Deposits (+):", rs(b.add))}${row("Refunds (-):", rs(-b.ref))}${hr}
    ${row(b.net < 0 ? "REFUND TO CUSTOMER:" : "TOTAL PAID:", rs(b.net), true).replace("<span>", '<span style="font-size:14px">')}${hr}
    <div style="text-align:center;font-size:11px">Deposits refunded on return of empty bottles.<br>Thank you! Come again.</div></div>`;
}

function showReceipt(tx) {
  if (!tx) return;
  currentReceipt = tx;
  const b = breakdown([tx]);
  if ($("receipt-modal-title")) {
    $("receipt-modal-title").textContent = `Receipt #TX-${tx.id} (${rs(b.net)}) • Print Receipt?`;
  }
  if ($("pop-liq")) $("pop-liq").textContent = rs(b.liq);
  if ($("pop-dep-add")) $("pop-dep-add").textContent = rs(b.add);
  if ($("pop-dep-ref")) $("pop-dep-ref").textContent = rs(-b.ref);
  if ($("pop-net")) {
    $("pop-net").textContent = rs(b.net);
    $("pop-net").className = "font-extrabold text-sm " + (b.net < 0 ? "text-amber-400" : "text-emerald-400");
  }
  $("receipt-body").innerHTML = receiptHtml(tx);
  show("receipt-modal");
  setTimeout(() => {
    if ($("btn-confirm-print")) $("btn-confirm-print").focus();
  }, 80);
}

function printReceipt() {
  if (currentReceipt) printHtml(receiptHtml(currentReceipt), "80mm auto");
}

function printReceiptAndClose() {
  if (currentReceipt) {
    printHtml(receiptHtml(currentReceipt), "80mm auto");
  }
  hide("receipt-modal");
}

function reprintReceipt(i) {
  if (transactions[i]) showReceipt(transactions[i]);
}

document.addEventListener("keydown", (e) => {
  const modal = $("receipt-modal");
  if (modal && !modal.classList.contains("hidden")) {
    if (e.key === "Escape") {
      e.preventDefault();
      hide("receipt-modal");
    } else if (e.key === "Enter" && document.activeElement !== $("btn-skip-receipt")) {
      e.preventDefault();
      printReceiptAndClose();
    }
  }
});

// Override processTransaction so Cashier View immediately updates and opens the Receipt Print Popup.
// - Ignores extra clicks while a payment is in flight (prevents duplicate POST / duplicate transactions)
// - Only clears the search box / refreshes the grid when the sale actually committed
//   (a rejected sale keeps the cart and Customer ID so the cashier can fix it)
const _pt = processTransaction;
let _paying = false;
processTransaction = async function () {
  if (_paying) return;
  if (cart.length === 0) return _pt();   // shows the "Cart is empty" toast, touches nothing else
  _paying = true;
  try {
    const n = transactions.length;
    await _pt();

    if (transactions.length > n) {
      // _pt already cleared the cart and Customer ID on success
      if ($("barcode-search")) $("barcode-search").value = "";
      renderCart();
      renderProductGrid();

      const tx = transactions[0];
      tx.ts = Date.now();
      tx.cashier = session ? session.name : "Cashier";
      saveState();

      renderCashierShiftPanel();
      renderAdminDashboard();
      showReceipt(tx);
    }
  } finally {
    _paying = false;
  }
};

// ---------- 3. Day closing ----------
let liveClose = null;
function buildRecord(txs, float, counted, by) {
  const t = breakdown(txs), expected = float + t.net;
  const rows = txs.flatMap(x => x.items.map(i => [`TX-${x.id}`, x.timestamp, x.customer_id, i.name, label(i.action_type), i.quantity, i.liquid_price, i.deposit_logged, lineAmt(i)]));
  return { id: closings.length + 1, at: new Date().toLocaleString(), by, float, counted, expected, variance: counted - expected, count: txs.length, tot: t, rows, txIds: txs.map(x => x.id) };
}
function openCloseModal() {
  liveClose = transactions.filter(t => !t.closed_id);
  $("close-body").innerHTML = closeFormHtml(); updateVariance(); show("close-modal");
}
function closeFormHtml() {
  const t = breakdown(liveClose), card = (l, v, c = "") => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3"><p class="text-[11px] uppercase font-bold text-slate-400">${l}</p><p class="font-extrabold ${c}">${v}</p></div>`;
  const hist = closings.slice().reverse().map(c => `<div class="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><span><b>#${c.id}</b> ${esc(c.at)} &middot; Net ${rs(c.tot.net)} &middot; Var ${rs(c.variance)}</span>
    <span class="space-x-1"><button onclick="exportCsv(closings[${c.id - 1}])" class="text-blue-600 font-bold">CSV</button><button onclick="exportPdf(closings[${c.id - 1}])" class="text-rose-600 font-bold">PDF</button></span></div>`).join("");
  return `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">${card("Open Transactions", liveClose.length)}${card("Contents Sales", rs(t.liq))}${card("Deposits In (+)", rs(t.add), "text-emerald-600")}${card("Refunds Out (-)", rs(-t.ref), "text-amber-600")}</div>
  <div class="grid grid-cols-3 gap-3 mb-3"><div><label class="block text-xs font-bold uppercase text-slate-500 mb-1">Opening Float</label><input id="cl-float" type="number" step="0.01" value="0" oninput="updateVariance()" class="${inp}"></div>
    <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1">Net Sales</label><div class="${inp} bg-slate-100 font-bold">${rs(t.net)}</div></div>
    <div><label class="block text-xs font-bold uppercase text-slate-500 mb-1">Counted Cash</label><input id="cl-count" type="number" step="0.01" oninput="updateVariance()" class="${inp}"></div></div>
  <div class="bg-slate-900 text-white rounded-xl p-4 flex justify-between items-center mb-4"><div><p class="text-xs text-slate-400">Expected in drawer</p><p id="cl-exp" class="font-bold text-lg"></p></div><div class="text-right"><p class="text-xs text-slate-400">Variance (counted - expected)</p><p id="cl-var" class="font-extrabold text-lg"></p></div></div>
  <p class="text-[11px] text-slate-400 mb-3">Assumes all payments are cash. Closing locks these transactions into the report and resets Today's Revenue to Rs. 0.00.</p>
  <div class="flex flex-wrap justify-end gap-2 mb-4"><button onclick="exportCsv(curRecord())" class="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white"><i class="fa-solid fa-file-csv mr-1.5"></i>Export CSV</button>
    <button onclick="exportPdf(curRecord())" class="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700 text-white"><i class="fa-solid fa-file-pdf mr-1.5"></i>Print / Save PDF</button>
    <button onclick="finishClose()" class="px-5 py-2 rounded-xl text-sm font-bold bg-rose-600 text-white"><i class="fa-solid fa-lock mr-1.5"></i>Close Register</button></div>
  ${hist ? `<h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Previous closings</h4><div class="space-y-1.5">${hist}</div>` : ""}`;
}
function updateVariance() {
  const f = parseFloat($("cl-float").value) || 0, c = parseFloat($("cl-count").value), exp = f + breakdown(liveClose).net;
  $("cl-exp").textContent = rs(exp);
  const v = $("cl-var"); if (isNaN(c)) { v.textContent = "-"; v.className = "font-extrabold text-lg"; return; }
  v.textContent = rs(c - exp); v.className = "font-extrabold text-lg " + (Math.abs(c - exp) < 0.005 ? "text-emerald-400" : "text-rose-400");
}
const curRecord = () => buildRecord(liveClose, parseFloat($("cl-float").value) || 0, parseFloat($("cl-count").value) || 0, session ? session.name : "-");
async function finishClose() {
  if (!liveClose.length) return showToast("No open transactions to close", "error");
  if (isNaN(parseFloat($("cl-count").value))) return showToast("Enter the counted cash first", "error");
  if (!confirm("Close the register? These transactions will be locked into this report and Today's Revenue will reset to Rs. 0.00.")) return;
  const rec = curRecord();

  if (typeof apiConfig !== "undefined" && apiConfig.useLiveApi) {
    try {
      const res = await fetch(`${apiConfig.baseUrl}/closings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closed_by: rec.by,
          opening_float: rec.float,
          counted_cash: rec.counted,
          tx_ids: rec.txIds
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return showToast(errData.detail || "Failed to save register closing in MySQL", "error");
      }
      const saved = await res.json();
      rec.id = saved.id;
      rec.at = saved.at;
      if (typeof syncFromBackend === "function") {
        await syncFromBackend();
      }
    } catch (err) {
      console.warn("FastAPI unreachable during register closing, saving locally:", err);
    }
  }

  closings.push(rec);
  transactions.forEach(t => { if (rec.txIds.includes(t.id)) t.closed_id = rec.id; });
  saveState(); saveFx(); liveClose = [];
  $("close-body").innerHTML = closeFormHtml(); updateVariance();
  renderAdminDashboard();
  renderCashierShiftPanel();
  showToast(`Register closed (report #${rec.id}). Today's revenue reset to Rs. 0.00!`);
}
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function exportCsv(r) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`, line = a => a.map(q).join(",");
  const out = [line(["Daily Cash Register Closing Report"]), line(["Closed at", r.at]), line(["Closed by", r.by]), line(["Transactions", r.count]), "",
    line(["Tx ID", "Time", "Customer", "Product", "Action", "Qty", "Unit Liquid Price", "Locked Deposit", "Line Total"]), ...r.rows.map(line), "",
    line(["Contents sales", r.tot.liq]), line(["Deposits charged", r.tot.add]), line(["Deposit refunds", -r.tot.ref]), line(["Net sales", r.tot.net]),
    line(["Opening float", r.float]), line(["Expected cash", r.expected]), line(["Counted cash", r.counted]), line(["Variance", r.variance])];
  download(`register-closing-${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + out.join("\r\n"), "text/csv;charset=utf-8");
}
function exportPdf(r) {
  const agg = {}; r.rows.forEach(x => { const k = x[3] + "|" + x[4]; agg[k] = agg[k] || { n: x[3], a: x[4], q: 0, t: 0 }; agg[k].q += x[5]; agg[k].t += x[8]; });
  const td = "padding:4px 6px;border-bottom:1px solid #ddd;", S = (l, v, b) => `<tr><td style="${td}${b ? "font-weight:bold;" : ""}">${l}</td><td style="${td}text-align:right;${b ? "font-weight:bold;" : ""}">${v}</td></tr>`;
  printHtml(`<div style="font-family:Arial,sans-serif;color:#000;font-size:12px;max-width:180mm">
    <h2 style="margin:0">${esc(SHOP.name)} - Daily Cash Register Closing</h2><p style="margin:2px 0 12px;color:#555">Report #${r.id} &middot; Closed ${esc(r.at)} by ${esc(r.by)} &middot; ${r.count} transactions</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">${S("Contents sales", rs(r.tot.liq))}${S("Deposits charged (+)", rs(r.tot.add))}${S("Deposit refunds (-)", rs(-r.tot.ref))}${S("Net sales", rs(r.tot.net), 1)}${S("Opening float", rs(r.float))}${S("Expected cash in drawer", rs(r.expected))}${S("Counted cash", rs(r.counted))}${S("Variance", rs(r.variance), 1)}</table>
    <h3 style="margin:0 0 4px">Sales by product</h3><table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr style="background:#eee"><th style="${td}text-align:left">Product</th><th style="${td}text-align:left">Action</th><th style="${td}text-align:right">Qty</th><th style="${td}text-align:right">Amount</th></tr>
    ${Object.values(agg).map(a => `<tr><td style="${td}">${esc(a.n)}</td><td style="${td}">${a.a}</td><td style="${td}text-align:right">${a.q}</td><td style="${td}text-align:right">${rs(a.t)}</td></tr>`).join("")}</table>
    <p style="margin-top:36px">Cashier signature: ____________________ &nbsp;&nbsp; Manager signature: ____________________</p></div>`, "A4");
}

// ---------- 5. Revenue Breakdown KPIs ----------
const kpiGrid = document.querySelector("#view-admin .grid.grid-cols-1.md\\:grid-cols-4");
if (kpiGrid) {
  kpiGrid.insertAdjacentHTML("afterend", `
    <div id="revenue-kpi-row" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <div class="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-sm">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-emerald-100">Liquid Sales Revenue</p>
            <h3 id="kpi-rev-liquid" class="text-2xl font-extrabold mt-1">Rs. 0.00</h3>
          </div>
          <div class="bg-white/15 p-2.5 rounded-xl">
            <i class="fa-solid fa-droplet text-lg"></i>
          </div>
        </div>
        <p class="text-xs text-emerald-100 mt-2">Actual earned shop revenue (<span id="kpi-rev-units">0</span> units sold)</p>
      </div>

      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Deposits Collected (+)</p>
            <h3 id="kpi-rev-dep-in" class="text-2xl font-extrabold text-blue-600 mt-1">Rs. 0.00</h3>
          </div>
          <div class="bg-blue-100 text-blue-600 p-2.5 rounded-xl">
            <i class="fa-solid fa-piggy-bank text-lg"></i>
          </div>
        </div>
        <p class="text-xs text-slate-500 mt-2">From <span id="kpi-rev-new-units">0</span> new bottle sales</p>
      </div>

      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Deposits Refunded (-)</p>
            <h3 id="kpi-rev-dep-out" class="text-2xl font-extrabold text-amber-600 mt-1">Rs. 0.00</h3>
          </div>
          <div class="bg-amber-100 text-amber-600 p-2.5 rounded-xl">
            <i class="fa-solid fa-hand-holding-dollar text-lg"></i>
          </div>
        </div>
        <p class="text-xs text-slate-500 mt-2">From <span id="kpi-rev-ret-units">0</span> empty bottle returns</p>
      </div>

      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Net Deposit Liability &amp; Avg</p>
            <h3 id="kpi-rev-dep-net" class="text-2xl font-extrabold text-purple-600 mt-1">Rs. 0.00</h3>
          </div>
          <div class="bg-purple-100 text-purple-600 p-2.5 rounded-xl">
            <i class="fa-solid fa-scale-balanced text-lg"></i>
          </div>
        </div>
        <p class="text-xs text-slate-500 mt-2">Avg Order Value: <strong id="kpi-rev-aov" class="text-slate-700">Rs. 0.00</strong></p>
      </div>
    </div>
  `);
}

function updateRevenueKpis() {
  const openTxs = transactions.filter(t => !t.closed_id);
  const openNetSales = openTxs.reduce((sum, tx) => sum + tx.total_paid, 0);

  if ($("kpi-today-sales")) {
    $("kpi-today-sales").textContent = `Rs. ${openNetSales.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }
  if ($("kpi-tx-count")) {
    $("kpi-tx-count").textContent = openTxs.length;
  }

  if (!$("kpi-rev-liquid")) return;
  const b = breakdown(openTxs);
  let soldUnits = 0, newUnits = 0, retUnits = 0;
  openTxs.forEach(t => t.items.forEach(i => {
    if (i.action_type === "New_Sale") { soldUnits += i.quantity; newUnits += i.quantity; }
    else if (i.action_type === "Exchange") { soldUnits += i.quantity; }
    else if (i.action_type === "Empty_Return") { retUnits += i.quantity; }
  }));
  const netDep = b.add - b.ref;
  const aov = openTxs.length > 0 ? (b.liq / openTxs.length) : 0;

  $("kpi-rev-liquid").textContent = rs(b.liq);
  $("kpi-rev-units").textContent = soldUnits;
  $("kpi-rev-dep-in").textContent = rs(b.add);
  $("kpi-rev-new-units").textContent = newUnits;
  $("kpi-rev-dep-out").textContent = rs(b.ref);
  if ($("kpi-rev-ret-units")) $("kpi-rev-ret-units").textContent = retUnits;
  $("kpi-rev-dep-net").textContent = rs(netDep);
  $("kpi-rev-aov").textContent = rs(aov);
}

const _rad = renderAdminDashboard;
renderAdminDashboard = function () {
  _rad();
  updateRevenueKpis();
  renderCashierShiftPanel();
  document.querySelectorAll("#admin-inventory-tbody tr").forEach((tr, i) => bottles[i] && tr.lastElementChild.insertAdjacentHTML("beforeend",
    `<button onclick="deleteBottle(${bottles[i].id})" class="text-rose-600 hover:text-rose-800 font-semibold text-xs bg-rose-50 px-3 py-1.5 rounded-lg"><i class="fa-solid fa-trash mr-1"></i>Delete</button>`));
  document.querySelectorAll("#admin-tx-tbody tr").forEach((tr, i) => transactions[i] && tr.lastElementChild.insertAdjacentHTML("beforeend",
    `<div><button onclick="reprintReceipt(${i})" class="text-xs text-blue-600 font-semibold mt-1"><i class="fa-solid fa-print mr-1"></i>Receipt${transactions[i].closed_id ? " &middot; closed #" + transactions[i].closed_id : ""}</button></div>`));
};

// ---------- Boot ----------
if ($("pos-receipt-id")) $("pos-receipt-id").textContent = `Receipt #TX-${transactions.length + 1001}`;
renderCategoryFilters();
renderCashierShiftPanel();
applySession();
