# Darsi Greens — Test Cases

> **Last audit:** 2026-06-21 — Pre-launch audit completed. Local-first architecture, dual PIN, vendor cards, admin panel added.

---

## 6. Pre-Launch Audit Regression Results

### Bugs confirmed fixed

| ID | Bug | Fix |
|----|-----|-----|
| B1 | `adjustCount` created new daily_summary doc every tap | `setDoc` with merge:true |
| B2 | Credit tab always empty (orderBy index missing) | Removed orderBy, sort client-side |
| B3 | Orders never loaded (orderBy index crash in Promise.all) | Split queries, client-sort |
| B4 | Orders couldn't be saved (vendor always null) | Free-text TextInput |
| B5 | Veg picker invisible on Android | Modal moved inside parent Modal |
| B6 | Wastage could exceed remaining stock | qty > remaining check added |
| B7 | Stock action buttons too small for parents (~28px) | Raised to minHeight:48 |

### TC-AUDIT-01: Customer count persists correctly
1. Open Analytics → ఈరోజు tab → tap "+" customer count 3 times
2. Navigate away and come back
3. **Expected:** Count shows 3 (NOT 0); Firestore `daily_summary/{today}` has `customer_count: 3`
4. **Expected:** Only ONE document for today (not 3 new docs)

### TC-AUDIT-02: Credit tab loads correctly
1. Record a sale with "అప్పు / Credit" payment
2. Navigate to నివేదిక → క్రెడిట్ tab
3. **Expected:** Sale appears in list (previously broken due to missing Firestore index)
4. Tap "✓ అందింది" → **Expected:** Sale disappears from list

### TC-AUDIT-03: Wastage cannot exceed remaining stock
1. Go to స్టాక్ tab → tap "🗑 వేస్ట్" on Tomato (e.g. 10 kg remaining)
2. Enter 15 kg (more than remaining) → tap సేవ్
3. **Expected:** Alert "స్టాక్ సరిపోదు — మిగిలిన స్టాక్: 10.0 కేజీ"
4. Enter 8 kg → tap సేవ్ → **Expected:** saved, remaining = 2 kg

### TC-AUDIT-04: Firestore rules reject invalid data
Using Firestore REST API or Firebase console:
- Write to `sales` with `quantity: -1` → **Expected:** rejected
- Write to `sales` with `payment_mode: 'barter'` → **Expected:** rejected
- Write to `vegetables` → **Expected:** rejected (read-only)
- Write to `vendor_orders` with empty `vendor_name` → **Expected:** rejected

---

## 7. New Feature Test Cases (2026-06-21)

### TC-NEW-01: Dual PIN — Admin flow
1. Launch app → PIN screen appears
2. Enter `9999` → **Expected:** AdminPanel opens (vendors/vegetables/settings tabs), NOT the regular home tabs
3. Tap "🚪 Admin Panel నుండి బయటకు" in Settings tab → **Expected:** returns to PIN screen

### TC-NEW-02: Dual PIN — Regular flow
1. PIN screen → enter `1234` → **Expected:** Home tabs open (ఆర్డర్లు, ధరలు, అమ్మకాలు, స్టాక్, నివేదిక)
2. Enter wrong PIN (e.g. `0000`) → **Expected:** shake animation, "తప్పు PIN · Wrong PIN" error for 2 seconds, PIN cleared

### TC-NEW-03: Admin PIN change
1. Enter `9999` → AdminPanel → Settings tab
2. Enter new admin PIN `7777` and save → **Expected:** "సేవ్ అయింది ✓"
3. Go back to PIN screen, enter `9999` → **Expected:** rejected (old PIN no longer works)
4. Enter `7777` → **Expected:** AdminPanel opens

### TC-NEW-04: Vendor card selection in Orders
1. Open OrdersScreen → tap "+ ఆర్డర్"
2. **Expected:** 2-column card grid shows రాజు, సురేష్, మురళి with area labels
3. Tap "రాజు" card → **Expected:** green border + ✓ tick, green bar at top "✓ రాజు · Darsi Market" with X
4. Tap X in green bar → **Expected:** vendor deselected, cards grid reappears

### TC-NEW-05: Vendor card search
1. Add Order modal → type "సురేష్" in search bar
2. **Expected:** only Suresh card visible, others filtered out
3. Tap X to clear → **Expected:** all 3 cards return

### TC-NEW-06: Local-first order save
1. Disable WiFi on device
2. Open Orders → + ఆర్డర్ → select vendor (రాజు) → add tomatoes 5kg at ₹30
3. Tap "ఆర్డర్ సేవ్ చేయండి" → **Expected:** order appears in pending list IMMEDIATELY without delay
4. Re-enable WiFi → SyncIndicator turns green → check Firestore console: order doc created

### TC-NEW-07: Local-first sale save
1. Disable WiFi → go to అమ్మకాలు → tap Tomato card
2. Set qty, tap "అమ్మకం నమోదు · Record Sale"
3. **Expected:** modal closes immediately with confirmation alert, no waiting spinner
4. Re-enable WiFi → SyncIndicator shows pending count → turns green after sync

### TC-NEW-08: SyncIndicator states
1. Disable WiFi → record 3 sales → **Expected:** 🔴 with pending count (e.g. "🔴 3 ⏳")
2. Re-enable WiFi → tap 🔴 indicator → **Expected:** turns 🟡 while syncing → then 🟢

### TC-NEW-09: Admin panel — Add vendor
1. Admin PIN → Vendors tab → "+ వెండర్ చేర్చండి"
2. Fill: name "నాగ", name_en "Naga", phone "9123456789", area "Ongole"
3. Save → **Expected:** new card appears in list immediately; Firestore `vendors` collection has new doc

### TC-NEW-10: Admin panel — Vegetable toggle
1. Admin PIN → కూరగాయలు tab → find Tomato row
2. Toggle active switch to OFF → **Expected:** row grays out
3. Go to అమ్మకాలు screen → **Expected:** Tomato no longer appears in grid

### TC-NEW-11: Performance — Load time
1. Cold start app (kill + reopen) → **Expected:** vendor cards in Orders visible within 1 second (from LocalDB cache)
2. Firestore sync happens in background without blocking UI

---

## 1. E2E Happy Path (Full Day Flow)

### TC-E2E-01: Complete morning workflow
1. Open app → PinLogin screen → enter PIN 1234 → tap Login
2. Navigate to **ఆర్డర్లు** tab → tap "+ ఆర్డర్"
3. Type vendor name "రాజు వెజ్" → tap "+ కూరగాయ ఎంచుకోండి"
4. Veg picker opens → scroll list → tap "టమాట / Tomato"
5. Enter qty: 50, price: 25 → line total shows ₹1250
6. Tap "+ వేరొక కూరగాయ" → add "ఉల్లిపాయ / Onion" qty: 30, price: 20
7. Grand total shows ₹2350 → tap "✓ ఆర్డర్ పెట్టండి"
8. **Verify:** Order appears in "రాని ఆర్డర్లు / Pending" list
9. **Verify:** Firestore `vendor_orders` collection has new document with vendor_name="రాజు వెజ్", status="placed"

### TC-E2E-02: Mark order received
1. In orders list → toggle Switch on the order placed in TC-E2E-01
2. **Verify:** Order moves to "అందిన ఆర్డర్లు / Received Today" section
3. **Verify:** Switch shows green, label shows "అందింది ✓"
4. **Verify:** Firestore doc has status="received", received_at=timestamp

### TC-E2E-03: Set selling prices (view/edit flow)
1. Navigate to **ధరలు** tab
2. Vegetables with no price today show TextInput (edit mode)
3. Enter price for Tomato: 45, Onion: 30
4. Tap "✓ ధరలు సేవ్ చేయండి"
5. **Verify:** Alert "సేవ్ అయింది! ✓" shown
6. **Verify:** Both rows switch to view mode showing "₹45/కేజీ" and "₹30/కేజీ"
7. **Verify:** Firestore `prices/{today}/vegetables/tomato` has sell_price=45
8. Tap ✏️ pencil on Tomato row → row switches back to edit mode
9. Change price to 48 → tap Save → row shows "₹48/కేజీ" in view mode

### TC-E2E-04: Record customer sale
1. Navigate to **అమ్మకాలు** tab
2. **Verify:** Tomato card shows "₹48/కేజీ" (price from Step 3 above)
3. Tap Tomato card → bottom sheet opens
4. Price shown: ₹48/కేజీ
5. Tap "+" to set qty 2 kg → total shows ₹96.00
6. Select "నగదు / Cash" payment
7. Tap "✓ అమ్మకం నిర్ధారించు"
8. **Verify:** Alert "✓ అమ్మకం నిర్ధారించబడింది" shown
9. **Verify:** Firestore `sales` collection has new doc: veg_id=tomato, quantity=2, sell_price=48, total_amount=96, payment_mode=cash

### TC-E2E-05: View analytics
1. Navigate to **నివేదిక** tab → ఈరోజు (Today) inner tab
2. **Verify:** Total sales shows ₹96
3. **Verify:** Gross profit = sales - buy cost from orders
4. Switch to నెల (Month) tab → current month totals visible
5. Switch to క్రెడిట్ (Credit) tab → no credit entries (paid cash)

---

## 2. Per-Screen Edge Cases

### OrdersScreen

**TC-ORD-01: Save with empty vendor name**
- Open Add Order → leave vendor field blank → tap Place Order
- **Expected:** Alert "వెండర్ లేదు — సరఫరాదారుడి పేరు నమోదు చేయండి"
- Order NOT saved

**TC-ORD-02: Save with no vegetables added**
- Enter vendor name "రాజు" → do not add any veg → tap Place Order
- **Expected:** Alert "ఐటమ్స్ లేవు — కనీసం ఒక కూరగాయ చేర్చండి"

**TC-ORD-03: Save with veg selected but qty = 0**
- Add veg, leave qty empty (or 0) → tap Place Order
- **Expected:** Item filtered out; if no valid items remain → "ఐటమ్స్ లేవు" alert

**TC-ORD-04: Decimal qty input**
- Qty field: type "12.5" → **Expected:** accepted, line total updates correctly
- Type "12,5" → **Expected:** comma auto-replaced with dot, accepted as 12.5

**TC-ORD-05: Same vegetable twice in one order**
- Add Tomato 20 kg @ ₹25, then add Tomato again 10 kg @ ₹28
- **Expected:** Both rows saved as separate line items; grand total = (20×25) + (10×28) = ₹780

**TC-ORD-06: Remove item row**
- Add 3 items → tap "✕ తొలగించు" on middle row
- **Expected:** Middle row removed, other 2 rows remain, grand total recalculates

**TC-ORD-07: Remove last remaining item row**
- Add 1 item → tap "✕ తొలగించు"
- **Expected:** Row resets to blank (new empty item), not removed entirely

**TC-ORD-08: Toggle received then un-toggle**
- Toggle order to "received" → toggle back to "placed"
- **Expected:** Order moves back to Pending section; Firestore status="placed", received_at=null

**TC-ORD-09: Veg picker search**
- Open veg picker → type "టమ" → **Expected:** only Tomato (టమాట) shown
- Clear search → **Expected:** full list returns

### SellingPricesScreen

**TC-PRC-01: First time today — all rows in edit mode**
- Open Prices tab on a day with no prices saved
- **Expected:** All rows show TextInput (edit mode)

**TC-PRC-02: Prices already set — view mode default**
- Open Prices tab after saving prices (e.g. after TC-E2E-03)
- **Expected:** All rows with saved price show "₹XX/కేజీ" text (view mode)
- Rows with price=0 or no price remain in edit mode

**TC-PRC-03: Pencil edit then cancel (navigate away)**
- Tap ✏️ on a row → TextInput appears → do NOT save → navigate to another tab and back
- **Expected:** Row reverts to view mode with original price (edit mode not persisted)

**TC-PRC-04: Loss margin highlighted**
- Buy price for Tomato is ₹30 (from received order)
- Enter sell price ₹25 (below buy price)
- **Expected:** TextInput border turns red, loss hint shown in buy hint row

**TC-PRC-05: Save price = 0**
- Enter 0 for a vegetable → save
- **Expected:** Saved (0 is valid); Sales screen shows "ధర సెట్ చేయండి ⚠️" for that veg

### Sales Screen

**TC-SAL-01: No price set for vegetable**
- Vegetable card for a veg with no price today
- **Expected:** Card shows "ధర సెట్ చేయండి ⚠️" in red/grey
- Tap card → bottom sheet shows "ఈ రోజు ధర లేదు / No price set today" in red
- Tap confirm → **Expected:** Alert "ధర లేదు / No Price Set" — sale blocked

**TC-SAL-02: UPI payment**
- Sell Onion 1 kg @ ₹30 → select "UPI" → confirm
- **Expected:** Firestore sale doc has payment_mode="upi"

**TC-SAL-03: Credit/Udhari payment**
- Sell Potato 2 kg → select "అప్పు / Credit" → confirm
- **Expected:** Firestore sale doc has payment_mode="credit", credit_paid=false (default)
- **Verify:** Sale appears in Analytics → క్రెడిట్ tab with "Mark Paid" option

**TC-SAL-04: Quantity stepper**
- Tap "+" 3 times starting from 0.5 → **Expected:** 0.5 → 1.0 → 1.5 → 2.0 kg
- Tap "−" → **Expected:** 1.5 kg (not below minimum step)

**TC-SAL-05: Manual qty input**
- Clear qty field → type "3.5" → **Expected:** total = 3.5 × price

**TC-SAL-06: gm unit tab**
- Tap veg with kg unit (e.g. Tomato) → Unit tabs show "కేజీ" and "గ్రాముల"
- Switch to గ్రాముల → qty starts at 100 gm, stepper increments by 100
- Set 500 gm → **Expected:** total = (500/1000) × price = 0.5 × price

**TC-SAL-07: Search filter**
- Type "టమ" in search bar → **Expected:** only Tomato visible
- Type "on" → **Expected:** Onion visible (English match)
- Clear search → **Expected:** all vegetables shown

---

## 3. Data Flow Tests (Screen 2 → Screen 3)

**TC-FLOW-01: Price set in SellingPricesScreen appears in Sales**
1. Set Tomato sell price = ₹52 in SellingPricesScreen → Save
2. Navigate to Sales tab
3. **Expected:** Tomato card shows "₹52/కేజీ"
4. Tap Tomato → bottom sheet shows "₹52 / కేజీ"

**TC-FLOW-02: Price update reflects immediately in Sales**
1. Price set to ₹52 → navigate to Sales → price shows ₹52
2. Navigate back to Prices → tap pencil → change to ₹55 → Save
3. Navigate back to Sales (reload trigger)
4. **Expected:** Tomato shows ₹55/కేజీ

**TC-FLOW-03: Buy price hint in SellingPricesScreen from received orders**
1. Place order: Tomato 50 kg @ ₹28 buy price → mark as Received
2. Navigate to SellingPricesScreen
3. **Expected:** Tomato row shows "కొన్న ధర: ₹28" hint below name
4. Enter sell price ₹45 → hint shows "కొన్న ధర: ₹28 · లాభం: ₹17"

**TC-FLOW-04: Order item veg IDs match price veg IDs**
- Both OrdersScreen and SellingPricesScreen use veg IDs from `vegetables` Firestore collection (or FALLBACK_VEGETABLES)
- **Expected:** After placing order and marking received, buy hint appears for the same veg in Prices tab

---

## 4. Offline Scenarios

**TC-OFF-01: Record sale while offline**
1. Disable phone WiFi/mobile data
2. Tap a veg in Sales → set qty → confirm
3. **Expected:** Alert "అఫ్‌లైన్‌లో సేవ్ అయింది / Saved Offline"
4. Sync badge appears in header: "⟳ 1 పెండింగ్"
5. Re-enable internet → badge auto-disappears OR tap badge to sync
6. **Expected:** Sale appears in Firestore `sales` collection with synced_from_offline=true

**TC-OFF-02: Multiple offline sales queue**
1. Go offline → record 3 sales → **Expected:** badge shows "⟳ 3 పెండింగ్"
2. Come online → **Expected:** all 3 synced, badge disappears

**TC-OFF-03: Prices screen offline**
1. Go offline → open Prices tab
2. **Expected:** Previously loaded prices still show (no crash)
3. Tap Save → **Expected:** Alert "లోపం — సేవ్ విఫలమైంది. Connection check చేయండి."

**TC-OFF-04: Orders screen offline**
1. Go offline → open Orders tab
2. **Expected:** Previously loaded orders still visible (cached in state)
3. Tap Toggle on an order → **Expected:** Alert "లోపం — అప్‌డేట్ విఫలమైంది."

**TC-OFF-05: Vegetables fallback when offline + no cache**
1. Fresh install (no cache) → go offline → open Sales tab
2. **Expected:** 20 fallback vegetables shown (FALLBACK_VEGETABLES list)
3. **Expected:** All show "ధర సెట్ చేయండి ⚠️" (no prices loaded offline)

---

## 5. Validation Edge Cases

**TC-VAL-01: Zero quantity in order**
- Order form: select veg → qty = 0 → tap Place Order
- **Expected:** Item treated as invalid (filtered), "ఐటమ్స్ లేవు" alert if only item

**TC-VAL-02: Negative price input**
- Order form price field: type "-20" → **Expected:** regex `/^\d*\.?\d*$/` blocks the minus sign; field stays unchanged

**TC-VAL-03: Very large quantity**
- Order: qty = 99999 kg, price = ₹50 → line total = ₹4,999,950
- **Expected:** Accepted without crash; grand total shows correct value

**TC-VAL-04: Empty vendor name (spaces only)**
- Type "   " (spaces) in vendor field → tap Place Order
- **Expected:** `.trim()` returns empty → Alert "వెండర్ లేదు"

**TC-VAL-05: Sell price = 0 blocks sale**
- Set sell price for Brinjal to 0 → Save
- Navigate to Sales → tap Brinjal → tap Confirm
- **Expected:** Alert "ధర లేదు / No Price Set" — blocks the transaction

**TC-VAL-06: Qty decimal edge cases**
- Type "." alone → **Expected:** allowed in field, treated as 0 on save
- Type "0.5" → **Expected:** accepted, works correctly
- Type "1." → **Expected:** accepted, treated as 1.0

**TC-VAL-07: Unicode in vendor name**
- Type "రాజు వెజ్ 2024" in vendor name → save order
- **Expected:** Saved correctly; displays properly in order card

**TC-VAL-08: PIN entry**
- Enter wrong PIN → **Expected:** Error message, login blocked
- Enter correct PIN 1234 → **Expected:** Navigate to main tabs

---

## 8. Payment Tracking + Receipt Upload (2026-06-21)

### TC-PAY-01: Mark order as paid — Cash
1. Open OrdersScreen → find any order card
2. **Expected:** Bottom of card shows "🔴 చెల్లించలేదు · Unpaid" badge + "💰 చెల్లించాం" button
3. Tap "💰 చెల్లించాం" → bottom sheet slides up
4. **Expected:** Amount pre-filled with order total; mode buttons: నగదు / UPI / క్రెడిట్
5. Select "నగదు (Cash)" → tap "✓ చెల్లింపు నమోదు"
6. **Expected:** Sheet closes immediately; card now shows "✓ చెల్లించాం · Paid" green badge + paid date
7. **Expected:** Firestore `vendor_orders/{id}` has payment_status="paid", payment_mode="cash"

### TC-PAY-02: Mark order as paid — UPI with custom amount
1. Open payment sheet for an order with total ₹2000
2. Clear amount field → type ₹1800 (partial)
3. Select "UPI" → tap Confirm
4. **Expected:** Card shows paid badge with ₹1800 displayed; Firestore amount_paid=1800

### TC-PAY-03: Mark order as paid — Credit
1. Payment sheet → select "క్రెడిట్" mode → Confirm
2. **Expected:** Card shows "✓ చెల్లించాం" with 📋 Credit icon

### TC-PAY-04: Payment persists after navigation
1. Mark order paid → navigate away to another tab
2. Return to ఆర్డర్లు tab
3. **Expected:** Order still shows green "✓ చెల్లించాం" badge (Firestore persisted)

### TC-PAY-05: Payment modal cancel
1. Tap "💰 చెల్లించాం" → payment sheet opens
2. Tap dark overlay or swipe down to dismiss
3. **Expected:** Sheet closes; order still shows "🔴 చెల్లించలేదు" (unchanged)

### TC-REC-01: Add receipt via camera
1. Open any order card → tap "📄 రసీదు చేర్చు · Add"
2. Action sheet opens with Camera + Gallery options
3. Tap "📷 ఫోటో తీయండి" → camera opens → take photo
4. **Expected:** Receipt button immediately shows spinner (uploading)
5. **Expected:** After upload: button turns green "📄 రసీదు చూడు · View"
6. **Expected:** Firestore `vendor_orders/{id}` has receipt_url (Firebase Storage URL)

### TC-REC-02: Add receipt via gallery
1. Order card → "📄 రసీదు చేర్చు" → tap "🖼️ గ్యాలరీ నుండి"
2. Select any image from gallery
3. **Expected:** Same upload flow as TC-REC-01

### TC-REC-03: View receipt full screen
1. Order card with receipt uploaded → tap "📄 రసీదు చూడు · View"
2. **Expected:** Full-screen viewer opens (dark background) showing receipt photo
3. **Expected:** Header shows vendor name + date + order total
4. **Expected:** Tap "✕" closes viewer and returns to orders

### TC-REC-04: Receipt permission denied
1. System: deny camera permission for the app
2. Tap "📄 రసీదు చేర్చు" → Camera option
3. **Expected:** Alert "అనుమతి అవసరం · Permission needed — Settings లో అనుమతి ఇవ్వండి"
4. No crash; order card unchanged

### TC-DUE-01: Vendor dues tab shows outstanding
1. Place 2 orders for "సురేష్" (total ₹3000), mark both received, do NOT mark paid
2. Place 1 order for "రాజు" (₹1500), mark received, do NOT mark paid
3. Navigate to నివేదిక → "వెండర్ బాకీ" tab
4. **Expected:** Total outstanding shows ₹4500 in red at top
5. **Expected:** సురేష్ card shows "2 orders · ₹3000 pending"; రాజు card shows "1 orders · ₹1500 pending"
6. **Expected:** Sorted by amount (సురేష్ first)

### TC-DUE-02: Dues tab updates after payment
1. From TC-DUE-01 state → go to OrdersScreen → mark సురేష్'s first order paid
2. Return to నివేదిక → వెండర్ బాకీ tab → pull to refresh
3. **Expected:** సురేష్ now shows only 1 order remaining, reduced total

### TC-DUE-03: Dues tab badge when no dues
1. Mark all pending vendor orders as paid
2. **Expected:** వెండర్ బాకీ tab shows no 🔴 badge
3. **Expected:** Tab content shows "🎉 వెండర్ బాకీలు లేవు! All vendor dues cleared."

### TC-DUE-04: Dues tab red badge on tab
1. Any vendor order with payment_status="pending" exists
2. **Expected:** Tab label shows "వెండర్ బాకీ 🔴" (red indicator visible)
3. After all orders paid → **Expected:** badge disappears from tab label
