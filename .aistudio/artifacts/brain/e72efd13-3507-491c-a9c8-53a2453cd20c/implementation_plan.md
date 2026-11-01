# Comprehensive Security Hardening & Marketplace Integrity Plan

A comprehensive architectural overhaul of Abbason Hub's security, escrow state machines, checkout calculation pipelines, and role-based permissions before real students or money touch the platform.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the interactive clarification turn and guide this implementation:

- **Confirmed Decision 1 (Multi-Vendor Checkout)**: Split the basket at checkout into distinct orders grouped by campus vendor, each with its own escrow tracking, seller payout calculation, and individual delivery OTP.
- **Confirmed Decision 2 (Delivery Code Verification & Escrow Payout)**: Server-authoritative execution via Express endpoint (`/api/orders/verify-delivery-otp`), where the server fetches the order directly from Firestore to evaluate the cryptographic hash and release payouts rather than trusting browser-submitted hashes.
- **Confirmed Decision 3 (Admin Authentication)**: Super Admin console access is strictly tied to verified Google Authentication matching the owner account (`chukwuagoziemgracious@gmail.com`). All client-side hardcoded passcodes (`abbason2026`, `admin123`) are removed.

---

## 1. Overview & Core Concept

- **What It Does**: Hardens Abbason Hub against fraud, unauthorized database scraping, identity spoofing, fee discrepancies, and state rollbacks. Ensures that buyers, vendors, and the platform administrator have strictly isolated access rights and mathematically protected escrow state transitions.
- **Target Audience / Persona**: Nigerian university students (buyers & sellers) using 3G mobile devices, and the platform owner (`chukwuagoziemgracious@gmail.com`) managing nationwide campus operations.
- **Key Value**: Zero-trust security where secrets (plaintext delivery OTPs, bank accounts, matric cards) are hidden from unauthorized eyes, orders cannot be fraudulently manipulated, and financial calculations are 100% consistent across checkout and backend ledgers.

---

## 2. Security & Vulnerability Remediation Matrix

### A. Critical Security Flaws

1. **Plaintext Delivery OTP Exposure & Unrestricted Order Scraping**
   - *Problem*: `deliveryOtpForBuyer` was saved in the root order document, and `/orders` allowed blanket listing. Any student could inspect the network tab or query Firestore to obtain the OTP and claim someone else's order without meeting them.
   - *Fix*: 
     - Remove `deliveryOtpForBuyer` from the cloud `/orders/{orderId}` document. The cloud document stores ONLY `otpHash` and `otpSalt`.
     - The plaintext OTP is stored locally in the authenticated buyer's secure storage or separate private buyer path.
     - Hardened Firestore rules: Only the buyer (`request.auth.uid == resource.data.buyerId`), the assigned seller (`request.auth.uid == resource.data.sellerId`), or the Super Admin can read an order. Blanket list queries by guests are forbidden.

2. **Unauthenticated Order Progression & Listing Tampering**
   - *Problem*: Rules permitted any caller to update orders or edit products without checking identity.
   - *Fix*: 
     - Orders can only be modified by the server or by the assigned buyer/seller for valid status transitions.
     - Product listings can only be edited or deleted by the original listing owner (`request.auth.uid == existing().sellerId`) or the Super Admin.

3. **Public Student ID Photos & Bank Details**
   - *Problem*: `/verifications` allowed public listing, exposing student ID cards and bank account numbers.
   - *Fix*: Restrict `verifications` read/list permissions strictly to `isAdmin() || (isSignedIn() && request.auth.uid == resource.data.userId)`.

4. **Hardcoded Client-Side Admin Passcodes**
   - *Problem*: `authenticateAdmin` evaluated `'abbason2026'` and `'admin123'` directly in client JavaScript.
   - *Fix*: Remove hardcoded strings. Authenticate Super Admin strictly through Firebase Auth Google Sign-In verifying `request.auth.token.email == 'chukwuagoziemgracious@gmail.com'`.

5. **Server OTP Hash Spoofing Bypass**
   - *Problem*: `/api/orders/verify-delivery-otp` trusted the client-supplied `storedHash` and `salt`.
   - *Fix*: The server endpoint reads the verified order directly from the database using `orderId`, compares the submitted code with the authoritative stored hash, enforces rate-limiting (5 attempts max), and updates the status to `delivered` / `payout_released`.

---

### B. High & Lower Priority Integrity Fixes

1. **Checkout & Order Calculation Discrepancies**
   - *Gateway Fee*: Standardize formula to `calculateGatewayFee(totalOrderAmount)` consistently across `CheckoutModal` and `store.ts`.
   - *Delivery Fee*: Align calculation so the checkout summary exactly matches the saved order record.

2. **Multi-Vendor Basket Splitting**
   - When a student checks out items from multiple sellers, `createOrder` groups items by `sellerId` and creates separate order records, each with its own order number, seller payout, delivery instructions, and unique OTP.

3. **Inventory Management (Stock Decrement)**
   - When orders are placed, `product.stock` is decremented in `store.ts` and synced to Firestore. Out-of-stock items are flagged to prevent double-selling.

4. **Dispute Persistence**
   - Connect `resolveDispute` and `fileComplaint` directly to Firestore mutations (`saveComplaintToFirestore`, `updateOrderInFirestore`) so dispute states persist across page reloads and devices.

5. **Elimination of Mock Fallbacks & Collision-Resistant IDs**
   - Replace `Date.now()` + 5-digit random numbers with crypto-random UUIDs and collision-resistant order tags (`AB-XXXXXX`).
   - Remove fake "Access Bank ******4819" mock fallbacks; require real bank submission upon seller verification.

---

## 3. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Student Client (UI)                           │
│  - Multi-vendor Basket (Splits by sellerId at checkout)               │
│  - Buyer Private Vault (Keeps plaintext OTP local to buyer only)       │
│  - Strict Google Auth (Admin locked to chukwuagoziemgracious@...)      │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
            Direct Firestore Mutations               │ Sensitive Operations
          (Protected by hardened ABAC)               │ (OTP & Payout Release)
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Cloud Firestore Rules          │  │     Express Server (/api)    │
│  - /products: Public read, seller auth│  │  - /api/orders/verify-otp:   │
│  - /orders: Buyer, seller & admin only│  │    * Fetches DB order by ID │
│  - /verifications: Private PII       │  │    * Verifies SHA-256 hash  │
│  - /users: Owner & admin read        │  │    * Authorizes escrow payout│
└──────────────────────────────────────┘  └──────────────┬───────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  Escrow Ledger & Firestore   │
                                          │  Order marked 'delivered'    │
                                          │  Payout recorded in ledger   │
                                          └──────────────────────────────┘
```

---

## 4. Implementation Steps

1. **Server Endpoint Hardening (`server.ts`)**:
   - Refactor `/api/orders/verify-delivery-otp` to verify OTP using the authoritative stored hash from the database.
   - Enforce 5-attempt locking and server-authoritative payout release.

2. **Security Rules Update & Deployment (`firestore.rules`)**:
   - Gated `/orders`: Read/list allowed only if `resource.data.buyerId == request.auth.uid || resource.data.sellerId == request.auth.uid || isAdmin()`.
   - Gated `/verifications`: Read/list allowed only if `resource.data.userId == request.auth.uid || isAdmin()`.
   - Gated `/products`: Updates/deletions restricted to listing owner or admin.
   - Deploy rules via `DeployRules` RPC.

3. **Core Store Hardening (`src/services/store.ts` & `src/services/firebase.ts`)**:
   - Remove plaintext `deliveryOtpForBuyer` from cloud payloads. Store it only in buyer-specific local storage.
   - Implement multi-vendor order splitting in `checkoutOrder`.
   - Fix gateway fee and delivery fee calculation parity.
   - Decrement `product.stock` on purchase and sync to Firestore.
   - Wire `resolveDispute` and seller approvals directly to Firestore.
   - Remove hardcoded admin passcodes; enforce `request.auth.token.email === 'chukwuagoziemgracious@gmail.com'`.

4. **UI Updates (`CheckoutModal.tsx`, `AdminLoginModal.tsx`, `AdminDashboard.tsx`)**:
   - Update `CheckoutModal` to display multi-vendor item grouping with sub-totals and consolidated delivery.
   - Update `AdminLoginModal` to remove the passcode field entirely and use Google OAuth directly.
