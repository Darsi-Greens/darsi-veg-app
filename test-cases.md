# Darsi Greens — Test Cases

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
