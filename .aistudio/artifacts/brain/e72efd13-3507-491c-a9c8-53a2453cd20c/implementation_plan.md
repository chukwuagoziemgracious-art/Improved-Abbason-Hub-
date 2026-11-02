# Architecture Plan: Inspect-on-Delivery (POD) & Direct Vendor Settlement Model

A complete architectural transition replacing the locked escrow system with a high-trust, campus-tailored **Inspect-First Pay-on-Delivery (POD)** engine with upfront transport protection.

---

### User Review & Confirmed Product Decisions

> [!IMPORTANT]
> The following core rules guide this new system based on your answers:
> 1. **Upfront Delivery Commitment Fee**: When placing an order, the student pays ONLY the campus delivery transport fee upfront via Paystack. This protects campus vendors from transport loss or ghosting.
> 2. **Item-Level Codes & Vendor Grouping**: Every individual item in the basket is assigned a unique item code (e.g. `ITM-7X49`). Orders are grouped by vendor with clear breakdown of individual items and vendor totals.
> 3. **Dual Payment Options on Delivery**: When the vendor arrives at the hostel, the buyer inspects the goods and can:
>    - **Pay Entire Vendor Total** (1 tap to pay for all items from that vendor), OR
>    - **Pay Individual Item** (pay specifically for item A if item B is rejected or paid separately).
> 4. **Direct In-App Paystack Settlement**: Payment is made directly in the app, crediting the seller's registered account. The seller receives instant on-screen payment confirmation before handing over the goods.
> 5. **Total Escrow Elimination**: No trapped money, no 6-digit secret OTP verification limits, and zero risk of locked funds.

---

## 1. System Architecture & Comparison

```
PREVIOUS ESCROW MODEL (REMOVED)
[Buyer Pays 100% Upfront] ──► [Escrow Vault Traps Funds] ──► [Secret OTP Handshake] ──► [Delayed Release]
                               ▲
               (Subject to lockouts, leaks & bypass bugs)

NEW INSPECT-FIRST CAMPUS MODEL (ACTIVE)
Step 1: [Checkout] ──────► Buyer pays ONLY Delivery Transport Fee upfront (locks seller commitment).
Step 2: [Delivery] ──────► Seller brings parcel to student's hostel/campus spot.
Step 3: [Inspection] ────► Student opens parcel, checks items.
Step 4: [In-App Pay] ────► Student taps "Pay Vendor Total" or "Pay Specific Item".
Step 5: [Instant Alert] ──► Paystack credits seller; seller screen shows "Payment Received" & hands item over.
```

---

## 2. Key Modules & Functional Changes

### A. Checkout & Order Generation (`CheckoutModal.tsx`, `store.ts`)
- **Checkout Breakdown**:
  - Displays each vendor parcel and itemized list with individual item codes (`ITM-XXXXXX`).
  - **Due Now**: Total Delivery Commitment Fee + Gateway Fee (the small amount charged to dispatch the order).
  - **Due Upon Delivery & Inspection**: Item prices total (to be paid directly at the hostel).
- **Floor Total / Summary**: Clear summary showing the grand total of the entire purchase so students know exactly what they will spend.

### B. Order States & Schema Simplification (`types/index.ts`, `firebase-blueprint.json`)
- Order statuses transition cleanly:
  1. `delivery_fee_paid` (Order placed, vendor dispatched to hostel)
  2. `delivered_pending_inspection` (Vendor arrived at drop-off location)
  3. `partially_paid` (When some items are paid individually)
  4. `paid_completed` (All items paid, transaction finalized)
  5. `cancelled_rejected` (Buyer rejects goods after inspection; delivery fee covered transport)
- **Item-Level Schema**:
  ```ts
  interface OrderItem {
    id: string;
    itemCode: string; // e.g. "ITM-98A2"
    productId: string;
    title: string;
    price: number;
    quantity: number;
    status: 'pending_inspection' | 'paid' | 'rejected';
    paidAt?: string;
  }
  ```

### C. Post-Delivery Payment Interface (`OrderReceiptModal.tsx`, `MyOrdersModal.tsx`)
- When viewing the order:
  - Prominent **"Hostel Delivery Arrived? Inspect Your Items"** card.
  - **"Pay Vendor Total: ₦X,XXX"** button (pays all items in parcel in 1 transaction).
  - Itemized rows with an individual **"Pay This Item: ₦X,XXX"** button next to each item code.
  - Instant live settlement confirmation showing: *"₦X,XXX paid to [Vendor Store Name] - Verified"*.

### D. Seller Live Notification (`SellerDashboard.tsx`)
- When the seller delivers the item, their dashboard shows a live status for that order.
- The moment the buyer taps "Pay" and completes payment, the seller's screen turns green with a clear checkmark: **"Payment Confirmed! ₦X,XXX received. You may now hand over item [ITM-XXXX]."**

### E. Security Rules & Database Hardening (`firestore.rules`)
- Remove complex escrow OTP checks and failed attempt counters.
- Enforce that only the buyer can initiate payments on their order.
- Enforce that products cannot have arbitrary stock changes.
- Ensure seller bank details and student verification photos remain private to the owner and admin.

---

## 3. Implementation Steps

1. **Schema & Types Refactoring (`src/types/index.ts`)**:
   - Update `Order` and `OrderItem` models with `itemCode`, `paymentMode: 'inspect_and_pay'`, and item-level payment statuses.
   - Remove legacy OTP hash and salt fields.

2. **Checkout Modal Overhaul (`src/components/CheckoutModal.tsx`)**:
   - Update checkout calculation: Pay delivery transport fee upfront; show item prices due upon hostel delivery.
   - Render multi-vendor parcel groups with individual item codes and floor grand total.

3. **Inspect & Pay Execution in Store (`src/services/store.ts`)**:
   - Implement `payOrderItem(orderId, itemId)` and `payVendorOrder(orderId)`.
   - Record payment transactions and settle directly to vendor ledger.

4. **Delivery Payment & Receipt Interface (`src/components/OrderReceiptModal.tsx`, `src/components/MyOrdersModal.tsx`)**:
   - Add the dual payment buttons: "Pay Vendor Total" & "Pay Item".
   - Include clear student inspection instructions ("Inspect your item before tapping pay").

5. **Seller Live Handover Screen (`src/components/SellerDashboard.tsx`)**:
   - Add instant handoff verification banner showing real-time payment confirmation.

6. **Firestore Rules Simplification & Deployment (`firestore.rules`)**:
   - Streamline rules to reflect the POD workflow without escrow vulnerability gaps.
   - Deploy updated rules via `fax.DeployRules`.

7. **Verification & Testing**:
   - Test upfront delivery fee checkout.
   - Test item-level code generation.
   - Test paying for 1 item vs all items on delivery.
   - Verify seller receives instant confirmation.
