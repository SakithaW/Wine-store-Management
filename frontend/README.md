# Retail Shop Bottle Management System v2.0 (With Product Images)

This updated frontend package adds **product images** across the entire application, including a built-in `images/` folder with crisp SVG illustrations and a photo uploader in the Admin Dashboard.

## What's New in v2.0
1. **POS Product Card Image Showcase**:
   - Every bottle card in the POS terminal now features a dedicated top image banner with hover zoom, overlaid SKU badge, and real-time `Full` vs. `Empty` stock pills.
2. **Pre-Packaged Product Graphics (`images/` folder)**:
   - Comes with 7 custom SVG product illustrations (`19l-water.svg`, `5l-water.svg`, `12kg-gas.svg`, `5kg-gas.svg`, `2kg-gas.svg`, `soda-crate.svg`, `ginger-beer.svg`) so it works 100% offline.
3. **Upload Custom Product Photos**:
   - Go to **Admin Dashboard -> Edit / Photo** (or **+ Add New Bottle Type**).
   - Click **Choose Photo** to upload any PNG/JPG/WEBP photo from your computer, or paste an image URL.
4. **Thumbnails Everywhere**:
   - Product thumbnails now appear inside the **Current Transaction Cart**, the **POS Action Popup Modal**, and the **Admin Master Catalog Table**.

## v3.0 additions (js/features.js)
1. Thermal receipt (80mm) after every payment + reprint from the Admin transaction log.
2. Cashier / Manager PIN login (demo PINs 1111 / 9999, edit `PINS` in features.js). Cashiers can't open the Admin Dashboard. Frontend-only: enforce roles on the backend too.
3. Daily cash register closing: float, counted cash, variance, CSV export, print/save-as-PDF report, closing history.
4. Create / delete categories (blocked while products use them) and delete bottle types.

## v6.1 fixes
1. **`js/features.js` failed to load (v6.0)** - a raw line break inside a quoted string in `deleteBottle()` was a JavaScript syntax error, so none of the v6 features (PIN login, cashier shift panel, receipt popup, Shift Sales) ran. Fixed.
2. **New product not appearing / Process Payment not clearing the cart** - both were caused by browser storage (LocalStorage, ~5 MB) filling up: uploaded photos were stored at full size as base64, and `saveState()` threw `QuotaExceededError`, which stopped everything after it (grid refresh, admin table refresh, cart clearing).
   - Uploaded photos are now resized to max 480 px JPEG before saving.
   - `saveState()` never throws. If storage is full, oversized old photos are reset to the default icon, the save is retried, and a red banner explains what happened.
   - Adding a product now clears the search box / category filter so the new product is visible, rejects duplicate SKUs, and escapes names so quotes or `<` in a name can't break the grid or tables.
3. **Process Payment** - rejected sales (live API error) no longer wipe the cart and Customer ID; double-clicking no longer sends two requests or saves a Rs. 0.00 duplicate; an empty-cart click no longer clears the Customer ID / search fields. The receipt number label now starts at the real next number instead of `TMP-001`.
