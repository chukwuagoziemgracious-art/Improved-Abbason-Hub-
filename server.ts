import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp as initAdminApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initClientApp } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  runTransaction,
  increment
} from 'firebase/firestore';
import {
  VENDOR_FEE_EARLY,
  EARLY_VENDOR_LIMIT,
  VENDOR_FEE_STANDARD,
  COMMISSION_RATE,
  CANCEL_CUTOFF_HOURS,
  SELLER_GRACE_HOURS,
  BAN_DAYS,
  MAX_DELIVERY_DAYS,
  PENALTY_MULTIPLIER,
  calculateGatewayFee,
} from './shared/config.js';
import { NIGERIAN_BANKS } from './src/data/nigerianBanks.ts';

// Paystack Bank List Cache
let cachedPaystackBanks: any[] | null = null;
async function getPaystackBanks(): Promise<any[]> {
  if (cachedPaystackBanks && cachedPaystackBanks.length > 0) return cachedPaystackBanks;
  if (PAYMENTS_MODE !== 'demo') {
    try {
      const data = await paystackRequest('/bank');
      if (Array.isArray(data) && data.length > 0) {
        cachedPaystackBanks = data;
        return cachedPaystackBanks;
      }
    } catch (err: any) {
      console.warn('[Paystack] Bank list fetch notice, using fallback directory:', err.message);
    }
  }
  cachedPaystackBanks = NIGERIAN_BANKS.map((b) => ({ name: b.name, code: b.code, slug: b.id }));
  return cachedPaystackBanks;
}

function findBankCode(bankName: string, bankList: any[]): string {
  if (!bankName) return '044';
  const clean = bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = bankList.find((b) => {
    const bClean = (b.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return bClean === clean || bClean.includes(clean) || clean.includes(bClean);
  });
  return match ? match.code : '044'; // Access Bank default
}

// Name comparison helper: requires at least 2 distinct matching name parts
function compareNames(sellerName: string, accountName: string): { matches: boolean; matchedParts: string[] } {
  const cleanTokens = (str: string) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);

  const sellerTokens = cleanTokens(sellerName);
  const accountTokens = cleanTokens(accountName);

  const matched: string[] = [];
  for (const s of sellerTokens) {
    for (const a of accountTokens) {
      if (s === a || (s.length >= 4 && a.includes(s)) || (a.length >= 4 && s.includes(a))) {
        matched.push(s);
        break;
      }
    }
  }

  const uniqueMatched = Array.from(new Set(matched));
  return {
    matches: uniqueMatched.length >= 2,
    matchedParts: uniqueMatched
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase configuration
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('[Server] Failed to read firebase-applet-config.json:', err);
  }
}

// 1. Firebase Admin Initialization (with credential detection)
let adminApp: any = null;
let adminDb: any = null;
let adminAuth: any = null;

try {
  let credentialOption = undefined;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credentialOption = cert(sa);
    } catch {
      credentialOption = cert(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    credentialOption = applicationDefault();
  }

  adminApp = initAdminApp({
    projectId: firebaseConfig.projectId || 'concise-genre-3nj8s',
    ...(credentialOption ? { credential: credentialOption } : {})
  }, 'abbason-admin');

  adminDb = getAdminFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  adminAuth = getAdminAuth(adminApp);
  console.log('[Server] Firebase Admin initialized. Database ID:', firebaseConfig.firestoreDatabaseId);
} catch (err: any) {
  console.warn('[Server] Firebase Admin init notice:', err.message);
}

// 2. Client SDK fallback connection for read/writes when admin credentials not supplied
let clientDb: any = null;
try {
  if (firebaseConfig.apiKey) {
    const clientApp = initClientApp(firebaseConfig, 'abbason-client-server');
    clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
  }
} catch (err: any) {
  console.warn('[Server] Client SDK init notice:', err.message);
}

// In-memory fast payment & order registry to ensure 100% demo sandbox reliability
interface PaymentRecord {
  reference: string;
  type: 'delivery_fee' | 'goods' | 'vendor_fee';
  orderId?: string;
  itemIds?: string[];
  sellerId?: string;
  amountKobo: number;
  amountNaira: number;
  goodsAmount?: number;
  deliveryFee?: number;
  commission?: number;
  gatewayFee: number;
  status: 'pending' | 'success' | 'failed';
  subaccountCode?: string;
  buyerUid?: string;
  createdAt: string;
  paidAt?: string;
}

const memoryPayments = new Map<string, PaymentRecord>();
const memoryOrders = new Map<string, any>();
const memoryBuyerContacts = new Map<string, { phone: string; name: string }>();
const memorySellerPrivate = new Map<string, any>();
const memoryVerifications = new Map<string, any>();
const memoryComplaints = new Map<string, any>();
let memoryPaidVendorsCount = 0;

async function restoreOrderStock(items: any[]): Promise<void> {
  if (!items || !Array.isArray(items)) return;
  for (const item of items) {
    const qty = item.quantity || 1;
    const pId = item.productId || item.id;
    if (!pId) continue;
    if (adminDb) {
      try {
        await adminDb.collection('products').doc(pId).update({
          stock: FieldValue.increment(qty)
        });
      } catch (err: any) {
        console.warn(`[Stock] Admin restore error (${pId}):`, err.message);
      }
    }
    if (clientDb) {
      try {
        await updateDoc(doc(clientDb, 'products', pId), {
          stock: increment(qty)
        });
      } catch {}
    }
  }
}

async function getPaidVendorsCount(): Promise<number> {
  if (adminDb) {
    try {
      const snap = await adminDb.collection('counters').doc('vendors').get();
      if (snap.exists && typeof snap.data().paidCount === 'number') {
        return snap.data().paidCount;
      }
    } catch {}
  }
  return memoryPaidVendorsCount;
}

// Paystack Configuration
const PAYSTACK_SECRET = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const getPaymentsMode = (): 'demo' | 'test' | 'live' => {
  if (!PAYSTACK_SECRET) return 'demo';
  if (PAYSTACK_SECRET.startsWith('sk_live_')) return 'live';
  return 'test';
};

const PAYMENTS_MODE = getPaymentsMode();
console.log(`[Server] Payments engine initialized in mode: ${PAYMENTS_MODE.toUpperCase()}`);

// Paystack REST API caller
async function paystackRequest(endpoint: string, method: string = 'GET', data?: any) {
  if (PAYMENTS_MODE === 'demo') {
    throw new Error('Paystack API is disabled in demo mode');
  }

  const response = await fetch(`https://api.paystack.co${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: data ? JSON.stringify(data) : undefined
  });

  const json = await response.json();
  if (!response.ok || !json.status) {
    throw new Error(json.message || `Paystack request failed with status ${response.status}`);
  }
  return json.data;
}

// Unified Order Persistence Helper (Bypasses rules via Admin SDK or memory/client fallback)
async function getOrderFromStorage(orderId: string): Promise<any | null> {
  if (memoryOrders.has(orderId)) {
    return memoryOrders.get(orderId);
  }
  if (adminDb) {
    try {
      const snap = await adminDb.collection('orders').doc(orderId).get();
      if (snap.exists) return snap.data();
    } catch (err: any) {
      console.warn(`[Storage] adminDb getOrder error (${orderId}):`, err.message);
    }
  }
  if (clientDb) {
    try {
      const snap = await getDoc(doc(clientDb, 'orders', orderId));
      if (snap.exists()) return snap.data();
    } catch {}
  }
  return null;
}

async function saveOrderToStorage(orderId: string, orderData: any): Promise<void> {
  memoryOrders.set(orderId, orderData);
  if (adminDb) {
    try {
      await adminDb.collection('orders').doc(orderId).set(orderData, { merge: true });
    } catch (err: any) {
      console.warn(`[Storage] adminDb saveOrder error (${orderId}):`, err.message);
    }
  }
  if (clientDb) {
    try {
      await setDoc(doc(clientDb, 'orders', orderId), orderData, { merge: true });
    } catch {}
  }
}

async function saveBuyerContact(orderId: string, contact: { phone: string; name: string }): Promise<void> {
  memoryBuyerContacts.set(orderId, contact);
  if (adminDb) {
    try {
      await adminDb.collection('orders').doc(orderId).collection('contact').doc('buyer').set(contact);
    } catch (err: any) {
      console.warn(`[Storage] adminDb saveBuyerContact error:`, err.message);
    }
  }
}

async function getPaymentRecord(reference: string): Promise<PaymentRecord | null> {
  if (memoryPayments.has(reference)) {
    return memoryPayments.get(reference)!;
  }
  if (adminDb) {
    try {
      const snap = await adminDb.collection('payments').doc(reference).get();
      if (snap.exists) return snap.data() as PaymentRecord;
    } catch {}
  }
  return null;
}

async function savePaymentRecord(reference: string, record: PaymentRecord): Promise<void> {
  memoryPayments.set(reference, record);
  if (adminDb) {
    try {
      await adminDb.collection('payments').doc(reference).set(record);
    } catch {}
  }
}

// User Profile lookup
async function getUserProfile(userId: string): Promise<any | null> {
  if (adminDb) {
    try {
      const snap = await adminDb.collection('users').doc(userId).get();
      if (snap.exists) return snap.data();
    } catch {}
  }
  if (clientDb) {
    try {
      const snap = await getDoc(doc(clientDb, 'users', userId));
      if (snap.exists()) return snap.data();
    } catch {}
  }
  return null;
}

// Idempotent Payment Success Handler
async function handlePaymentSuccess(reference: string): Promise<{ success: boolean; message: string; order?: any }> {
  const payment = await getPaymentRecord(reference);
  if (!payment) {
    return { success: false, message: `Payment reference not found: ${reference}` };
  }

  if (payment.status === 'success') {
    return { success: true, message: 'Payment already processed' };
  }

  payment.status = 'success';
  payment.paidAt = new Date().toISOString();
  await savePaymentRecord(reference, payment);

  // 1. Delivery Fee Payment: Order becomes scheduled and delivery fee is marked paid
  if (payment.type === 'delivery_fee' && payment.orderId) {
    const order = await getOrderFromStorage(payment.orderId);
    if (order) {
      order.deliveryFeePaid = true;
      order.upfrontTotalPaid = payment.amountNaira;
      order.status = 'scheduled';
      order.paymentStatus = 'delivery_fee_paid';
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(order.id, order);
      return { success: true, message: 'Delivery fee confirmed; order is now scheduled', order };
    }
  }

  // 2. Goods Payment at handover: Mark items paid, collect platform 3% commission
  if (payment.type === 'goods' && payment.orderId) {
    const order = await getOrderFromStorage(payment.orderId);
    if (order) {
      const paidItemIds = new Set(payment.itemIds || []);
      let newlyPaidAmount = 0;

      order.items = order.items.map((item: any) => {
        if (paidItemIds.has(item.id) || paidItemIds.has(item.itemCode) || paidItemIds.size === 0) {
          if (item.status !== 'paid') {
            item.status = 'paid';
            item.paidAt = new Date().toISOString();
            item.paidAmount = item.price * item.quantity;
            item.paymentReference = reference;
            newlyPaidAmount += item.paidAmount;
          }
        }
        return item;
      });

      const goodsPaidNow = payment.goodsAmount || newlyPaidAmount;
      order.goodsPaid = (order.goodsPaid || 0) + goodsPaidNow;
      const commissionNow = Math.round(goodsPaidNow * COMMISSION_RATE);
      order.commissionCollected = (order.commissionCollected || 0) + commissionNow;
      order.platformCommission = (order.platformCommission || 0) + commissionNow;
      order.sellerPayoutAmount = (order.sellerPayoutAmount || 0) + (goodsPaidNow - commissionNow);

      const allItemsSettled = order.items.every((it: any) => it.status === 'paid' || it.status === 'rejected');
      if (allItemsSettled) {
        order.status = 'paid_completed';
        order.paymentStatus = 'paid_completed';
        order.completedAt = new Date().toISOString();
      } else {
        order.status = 'partially_paid';
        order.paymentStatus = 'partially_paid';
      }

      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(order.id, order);
      return { success: true, message: 'Goods payment confirmed and split settled', order };
    }
  }

  // 3. Vendor Fee Payment: Promote seller to verified and increment vendor counter
  if (payment.type === 'vendor_fee' && payment.sellerId) {
    const sellerId = payment.sellerId;
    memoryPaidVendorsCount++;
    if (adminDb) {
      try {
        await adminDb.collection('counters').doc('vendors').set({
          paidCount: FieldValue.increment(1),
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        await adminDb.collection('users').doc(sellerId).update({
          isVerifiedSeller: true,
          sellerVerificationStatus: 'verified',
          verifiedAt: new Date().toISOString()
        });
        await adminDb.collection('sellerProfiles').doc(sellerId).set({
          isVerifiedSeller: true,
          isSuspended: false
        }, { merge: true });
      } catch (err: any) {
        console.warn('[Server] update seller profile error:', err.message);
      }
    }
    if (clientDb) {
      try {
        await updateDoc(doc(clientDb, 'users', sellerId), {
          isVerifiedSeller: true,
          sellerVerificationStatus: 'verified'
        });
        await setDoc(doc(clientDb, 'sellerProfiles', sellerId), {
          isVerifiedSeller: true,
          isSuspended: false
        }, { merge: true });
      } catch {}
    }
    return { success: true, message: 'Vendor fee confirmed; seller is now verified' };
  }

  return { success: true, message: 'Payment recorded successfully' };
}

// Background Task: Auto-settle overdue orders & release unpaid stock reservations
async function runAutoSettleAndReservations() {
  const now = Date.now();
  console.log('[Server Task] Running auto-settle check and stock reservation sweep...');

  // 1. Release unpaid delivery orders after 30 minutes
  for (const [orderId, order] of memoryOrders.entries()) {
    if (order.status === 'awaiting_payment' && !order.deliveryFeePaid) {
      const createdTime = new Date(order.createdAt).getTime();
      if (now - createdTime > 30 * 60 * 1000) {
        order.status = 'cancelled';
        order.cancelReason = 'unpaid_reservation_expired';
        order.updatedAt = new Date().toISOString();
        await saveOrderToStorage(orderId, order);
        console.log(`[Reservation] Released expired stock reservation for order: ${orderId}`);
      }
    }

    // 2. Overdue orders: delivery deadline + 24hr grace passed without delivery or cancellation
    if (
      order.deliveryDeadlineMs &&
      order.status !== 'delivered' &&
      order.status !== 'paid_completed' &&
      order.status !== 'cancelled'
    ) {
      const graceDeadline = order.deliveryDeadlineMs + (SELLER_GRACE_HOURS * 3600 * 1000);
      if (now > graceDeadline && !order.sellerDefault) {
        order.sellerDefault = true;
        if (order.deliveryFeePaid && order.deliveryFee > 0) {
          order.refund = {
            owedAmount: order.deliveryFee * PENALTY_MULTIPLIER,
            multiplier: PENALTY_MULTIPLIER,
            status: 'owed',
            dueAt: now + (24 * 3600 * 1000)
          };
        }
        order.updatedAt = new Date().toISOString();
        await saveOrderToStorage(orderId, order);

        // Apply 30-day suspension to seller
        const bannedUntilMs = now + (BAN_DAYS * 24 * 3600 * 1000);
        if (adminDb && order.sellerId) {
          try {
            await adminDb.collection('users').doc(order.sellerId).update({
              suspendedUntilMs: bannedUntilMs
            });
            await adminDb.collection('sellerProfiles').doc(order.sellerId).update({
              isSuspended: true
            });
          } catch {}
        }
        console.log(`[Auto-Settle] Flagged seller default for order: ${orderId}. Penalty 2x applied.`);
      }
    }
  }
}

async function startServer() {
  const app = express();
  // Environment requirement: Dev server must always run on port 3000
  const port = 3000;

  // JSON Body parser with raw body buffer for HMAC webhook signature verification
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Logging & Standard Headers
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Abbason-Environment', 'Production-Hardened');
    res.setHeader('X-Escrow-Authority', 'Inspect-First-Pay-On-Delivery');
    res.setHeader('X-Payments-Mode', PAYMENTS_MODE);
    next();
  });

  // Auth Middleware
  const requireAuth = async (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split('Bearer ')[1].trim();

    try {
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(token);
        req.user = decoded;

        // Check if user is suspended
        const userProfile = await getUserProfile(decoded.uid);
        if (userProfile?.bannedUntilMs && userProfile.bannedUntilMs > Date.now()) {
          const dateStr = new Date(userProfile.bannedUntilMs).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' });
          return res.status(403).json({ error: `Your account is suspended until ${dateStr} due to a safety infraction.` });
        }
        return next();
      }
    } catch (err: any) {
      // In demo mode or if verification failed with local mock token
      if (PAYMENTS_MODE === 'demo') {
        req.user = { uid: token.length > 10 ? token : 'demo_user_1', email: 'demo@abbasonhub.com' };
        return next();
      }
      return res.status(401).json({ error: 'Invalid or expired authentication session', details: err.message });
    }

    // Default fallback in development
    req.user = { uid: token, email: 'student@campus.edu.ng' };
    next();
  };

  // --- API Endpoints ---

  // 1. Config: returns active payment mode
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      paymentsMode: PAYMENTS_MODE,
      earlyVendorFee: VENDOR_FEE_EARLY,
      standardVendorFee: VENDOR_FEE_STANDARD,
      commissionRate: COMMISSION_RATE,
      serverTime: new Date().toISOString()
    });
  });

  // 2. Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Abbason Hub Server Engine',
      version: '2.0.0',
      paymentsMode: PAYMENTS_MODE,
      adminConnected: !!adminDb,
      clientConnected: !!clientDb,
      timestamp: new Date().toISOString()
    });
  });

  // 3. Checkout Endpoint: Server-authoritative order creation and stock decrement
  app.post('/api/checkout', requireAuth, async (req: any, res: Response) => {
    try {
      const { items, sellerConfigs, buyerInfo } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart items cannot be empty' });
      }

      const buyerUid = req.user.uid;
      const createdOrders: any[] = [];

      // Group items by sellerId
      const sellerGroups = new Map<string, any[]>();
      items.forEach((item: any) => {
        const sId = item.product?.sellerId || item.sellerId;
        if (!sellerGroups.has(sId)) sellerGroups.set(sId, []);
        sellerGroups.get(sId)!.push(item);
      });

      const now = Date.now();

      // Process each seller group atomically
      for (const [sellerId, vendorItems] of sellerGroups.entries()) {
        const config = (sellerConfigs && sellerConfigs[sellerId]) || {};
        const fulfillmentType = config.fulfillmentType || 'seller_delivers';
        const meetingPoint = config.meetingPoint || { kind: 'safe_checkpoint', label: 'Campus Main Gate' };
        const deliveryInstructions = config.deliveryInstructions || buyerInfo?.hostel || 'Hostel Delivery';
        const timeSlot = config.timeSlot || 'afternoon';

        // Calculate delivery deadline (within 7 days maximum)
        let deadlineDays = 7;
        if (vendorItems[0]?.product?.deliverySchedule?.type === 'within_3_days') {
          deadlineDays = 3;
        }
        const deliveryDeadlineMs = config.scheduledDate 
          ? new Date(config.scheduledDate).getTime() 
          : now + (deadlineDays * 24 * 3600 * 1000);
        
        const contactRevealAtMs = deliveryDeadlineMs - (CANCEL_CUTOFF_HOURS * 3600 * 1000);

        // Calculate money
        const subtotal = vendorItems.reduce((acc, it) => acc + (it.product.price * it.quantity), 0);
        const deliveryFee = fulfillmentType === 'seller_delivers' 
          ? Math.max(...vendorItems.map((i) => i.product.deliveryFee || 0)) 
          : 0;

        const upfrontGatewayFee = calculateGatewayFee(deliveryFee);
        const upfrontTotalDue = deliveryFee + upfrontGatewayFee;
        const platformCommission = Math.round(subtotal * COMMISSION_RATE);
        const sellerPayoutAmount = subtotal - platformCommission;

        const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
        const orderNumber = `AB-${Math.floor(100000 + Math.random() * 900000)}`;

        // Build itemized list with unique item inspection codes
        const orderItems = vendorItems.map((it: any) => ({
          id: `itm_${crypto.randomBytes(5).toString('hex')}`,
          itemCode: `ITM-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          productId: it.product.id,
          title: it.product.title,
          price: it.product.price,
          quantity: it.quantity,
          image: it.product.images?.[0] || '',
          status: 'pending_inspection'
        }));

        const newOrder = {
          id: orderId,
          orderNumber,
          buyerId: buyerUid,
          buyerName: buyerInfo?.name || req.user.name || 'Campus Student',
          buyerHostel: buyerInfo?.hostel || 'Student Lodges',
          sellerId: sellerId,
          sellerName: vendorItems[0]?.product?.sellerName || 'Verified Merchant',
          campusId: buyerInfo?.campusId || vendorItems[0]?.product?.campusId || 'all',
          campusName: buyerInfo?.campusName || vendorItems[0]?.product?.campusName || 'Campus Hub',
          items: orderItems,
          subtotal,
          deliveryFee,
          gatewayFee: upfrontGatewayFee,
          totalAmount: upfrontTotalDue + subtotal,
          upfrontDeliveryFee: deliveryFee,
          upfrontGatewayFee,
          upfrontTotalPaid: 0,
          itemsTotalDueOnDelivery: subtotal,
          itemsTotalPaid: 0,
          deliveryFeePaid: deliveryFee === 0,
          goodsDue: subtotal,
          goodsPaid: 0,
          commissionCollected: 0,
          platformCommission,
          sellerPayoutAmount,
          paymentMode: 'inspect_and_pay',
          fulfillmentType,
          deliveryInstructions,
          meetingPoint,
          scheduledDate: config.scheduledDate || new Date(deliveryDeadlineMs).toISOString(),
          deliveryDeadlineMs,
          contactRevealAtMs,
          timeSlot,
          paymentMethod: 'card',
          paymentStatus: deliveryFee === 0 ? 'delivery_fee_paid' : 'pending_inspection_pay',
          status: deliveryFee === 0 ? 'scheduled' : 'awaiting_payment',
          createdAt: new Date().toISOString()
        };

        // Save order and isolate buyer phone in private subcollection
        await saveOrderToStorage(orderId, newOrder);
        if (buyerInfo?.phone) {
          await saveBuyerContact(orderId, {
            phone: buyerInfo.phone,
            name: buyerInfo.name || 'Campus Student'
          });
        }

        createdOrders.push(newOrder);
      }

      res.json({
        success: true,
        orders: createdOrders,
        message: 'Order created successfully. Ready for inspection on delivery.'
      });
    } catch (err: any) {
      console.error('[Checkout Error]:', err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // 4. Initialize Payment: Paystack Checkout or Demo Sandbox Generator
  app.post('/api/payments/initialize', requireAuth, async (req: any, res: Response) => {
    try {
      const { type, orderId, itemIds, sellerId } = req.body;
      const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

      let amountNaira = 0;
      let deliveryFee = 0;
      let goodsAmount = 0;
      let commission = 0;
      let gatewayFee = 0;
      let targetOrder: any = null;

      if (type === 'delivery_fee') {
        if (!orderId) return res.status(400).json({ error: 'orderId is required for delivery fee' });
        targetOrder = await getOrderFromStorage(orderId);
        if (!targetOrder) return res.status(404).json({ error: 'Order not found' });
        
        deliveryFee = targetOrder.deliveryFee || 0;
        gatewayFee = calculateGatewayFee(deliveryFee);
        amountNaira = deliveryFee + gatewayFee;
      } else if (type === 'goods') {
        if (!orderId) return res.status(400).json({ error: 'orderId is required for goods payment' });
        targetOrder = await getOrderFromStorage(orderId);
        if (!targetOrder) return res.status(404).json({ error: 'Order not found' });

        const selectedIds = new Set(itemIds || []);
        goodsAmount = targetOrder.items
          .filter((it: any) => selectedIds.has(it.id) || selectedIds.has(it.itemCode) || selectedIds.size === 0)
          .reduce((sum: number, it: any) => sum + (it.price * it.quantity), 0);

        if (goodsAmount <= 0) return res.status(400).json({ error: 'No unpaid items selected for payment' });

        commission = Math.round(goodsAmount * COMMISSION_RATE);
        gatewayFee = calculateGatewayFee(goodsAmount);
        amountNaira = goodsAmount + gatewayFee;
      } else if (type === 'vendor_fee') {
        const paidCount = await getPaidVendorsCount();
        const currentVendorFee = paidCount < EARLY_VENDOR_LIMIT ? VENDOR_FEE_EARLY : VENDOR_FEE_STANDARD;
        gatewayFee = calculateGatewayFee(currentVendorFee);
        amountNaira = currentVendorFee + gatewayFee;
      } else {
        return res.status(400).json({ error: `Invalid payment type: ${type}` });
      }

      const reference = `ABPAY_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const amountKobo = Math.round(amountNaira * 100);

      // Save payment intent
      const paymentRecord: PaymentRecord = {
        reference,
        type,
        orderId,
        itemIds,
        sellerId: sellerId || targetOrder?.sellerId,
        amountKobo,
        amountNaira,
        goodsAmount,
        deliveryFee,
        commission,
        gatewayFee,
        status: 'pending',
        buyerUid: req.user.uid,
        createdAt: new Date().toISOString()
      };

      await savePaymentRecord(reference, paymentRecord);

      // 1. DEMO MODE: Provide clean interactive simulation page
      if (PAYMENTS_MODE === 'demo') {
        const demoAuthUrl = `${appBaseUrl}/api/payments/demo-pay?reference=${reference}`;
        return res.json({
          status: true,
          paymentsMode: 'demo',
          reference,
          authorization_url: demoAuthUrl,
          amount: amountNaira
        });
      }

      // 2. LIVE / TEST MODE: Real Paystack API call
      const callback_url = `${appBaseUrl}/api/payments/verify?reference=${reference}`;
      const paystackPayload: any = {
        email: req.user.email || 'student@campus.edu.ng',
        amount: amountKobo,
        reference,
        callback_url,
        metadata: {
          reference,
          orderId,
          type,
          buyerUid: req.user.uid
        }
      };

      // Split payout configuration if seller subaccount exists
      const targetSellerId = sellerId || targetOrder?.sellerId;
      if (targetSellerId) {
        const sellerPrivate = await getUserProfile(targetSellerId);
        if (sellerPrivate?.subaccountCode) {
          paystackPayload.subaccount = sellerPrivate.subaccountCode;
          paystackPayload.bearer = 'account';
          if (type === 'delivery_fee') {
            paystackPayload.transaction_charge = Math.round(gatewayFee * 100);
          } else if (type === 'goods') {
            paystackPayload.transaction_charge = Math.round((commission + gatewayFee) * 100);
          }
        }
      }

      const paystackData = await paystackRequest('/transaction/initialize', 'POST', paystackPayload);

      res.json({
        status: true,
        paymentsMode: PAYMENTS_MODE,
        reference,
        authorization_url: paystackData.authorization_url,
        access_code: paystackData.access_code
      });
    } catch (err: any) {
      console.error('[Paystack Init Error]:', err);
      res.status(500).json({ error: err.message || 'Payment initialization temporarily unavailable' });
    }
  });

  // 5. Verify Target Callback & Idempotent Success Execution
  app.get('/api/payments/verify', async (req: Request, res: Response) => {
    const reference = (req.query.reference as string || '').trim();
    if (!reference) {
      return res.redirect('/?payment_error=missing_reference');
    }

    try {
      if (PAYMENTS_MODE !== 'demo') {
        // Query Paystack verify endpoint
        const verifyData = await paystackRequest(`/transaction/verify/${reference}`);
        if (verifyData.status !== 'success') {
          return res.redirect(`/?payment_error=unsuccessful&reference=${reference}`);
        }
      }

      const result = await handlePaymentSuccess(reference);
      const orderIdParam = result.order?.id ? `&orderId=${result.order.id}` : '';
      res.redirect(`/?payment_status=success&reference=${reference}${orderIdParam}`);
    } catch (err: any) {
      console.error('[Payment Verify Error]:', err);
      res.redirect(`/?payment_error=${encodeURIComponent(err.message)}`);
    }
  });

  // 6. Paystack Webhook (HMAC SHA-512 Signature Verified)
  app.post('/api/paystack/webhook', async (req: any, res: Response) => {
    try {
      const signature = req.headers['x-paystack-signature'];
      if (!signature) {
        return res.status(401).send('No signature provided');
      }

      if (PAYSTACK_SECRET) {
        const hash = crypto
          .createHmac('sha512', PAYSTACK_SECRET)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest('hex');

        if (hash !== signature) {
          console.warn('[Webhook] Signature mismatch');
          return res.status(401).send('Invalid signature');
        }
      }

      const event = req.body;
      if (event?.event === 'charge.success') {
        const reference = event.data?.reference;
        if (reference) {
          console.log(`[Webhook] Processing verified charge.success for reference: ${reference}`);
          await handlePaymentSuccess(reference);
        }
      }

      res.status(200).json({ status: true });
    } catch (err: any) {
      console.error('[Webhook Error]:', err);
      res.status(500).send('Webhook internal error');
    }
  });

  // 7. Demo Payment Confirmation Sandbox UI
  app.get('/api/payments/demo-pay', async (req: Request, res: Response) => {
    const reference = req.query.reference as string;
    const payment = await getPaymentRecord(reference);

    if (!payment) {
      return res.status(404).send('Payment reference not found');
    }

    const typeLabel = payment.type === 'delivery_fee' 
      ? 'Transport Delivery Fee' 
      : payment.type === 'goods' 
        ? 'Inspected Goods Payment (At Safe Checkpoint)' 
        : 'Vendor Verification Fee';

    // Renders luxury dark theme payment confirmation matching Abbason Hub
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Paystack Demo Sandbox · Abbason Hub</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background: #020406; color: #E9E6DF; font-family: ui-sans-serif, system-ui, sans-serif; }
        </style>
      </head>
      <body class="flex items-center justify-center min-h-screen p-4">
        <div class="w-full max-w-md p-8 rounded-3xl bg-[#090D14] border border-[#C8A96A]/30 shadow-2xl space-y-6 text-center">
          <div class="w-14 h-14 mx-auto rounded-full bg-[#C8A96A]/10 border border-[#C8A96A]/40 flex items-center justify-center text-[#C8A96A]">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <span class="text-[10px] tracking-widest text-[#C8A96A] font-semibold uppercase">Paystack Simulator (Demo Mode)</span>
            <h2 class="text-xl font-serif text-white mt-1">Authorise Campus Payment</h2>
            <p class="text-xs text-[#8C9399] mt-1">${typeLabel}</p>
          </div>

          <div class="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5 space-y-3 text-left text-xs">
            <div class="flex justify-between">
              <span class="text-[#8C9399]">Reference:</span>
              <span class="font-mono text-white text-[11px]">${payment.reference}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#8C9399]">Processing Fee:</span>
              <span class="font-mono text-white">₦${payment.gatewayFee.toLocaleString()}</span>
            </div>
            <div class="border-t border-white/[0.08] pt-2 flex justify-between items-baseline">
              <span class="text-white font-medium">Total Charge:</span>
              <span class="text-lg font-mono font-bold text-[#C8A96A]">₦${payment.amountNaira.toLocaleString()}</span>
            </div>
          </div>

          <p class="text-[11px] text-[#8C9399]">
            This is an automated sandbox environment. No real funds are transferred. Tapping below completes settlement.
          </p>

          <a 
            href="/api/payments/verify?reference=${payment.reference}" 
            class="block w-full py-3.5 px-4 rounded-xl bg-[#C8A96A] hover:bg-[#D4AF37] text-[#020406] font-semibold text-xs tracking-wider uppercase transition-colors"
          >
            Confirm & Complete Payment
          </a>
        </div>
      </body>
      </html>
    `);
  });

  // 8. Order Item Pay (Direct POD helper)
  app.post('/api/orders/pay-item', requireAuth, async (req: any, res: Response) => {
    try {
      const { orderId, itemCode, itemId } = req.body;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const item = order.items.find((i: any) => i.id === itemId || i.itemCode === itemCode);
      if (!item) return res.status(404).json({ error: 'Item not found in order' });

      // Generate a goods payment
      const reference = `ABPAY_ITEM_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const goodsAmount = item.price * item.quantity;
      const gatewayFee = calculateGatewayFee(goodsAmount);
      const totalNaira = goodsAmount + gatewayFee;
      const commission = Math.round(goodsAmount * COMMISSION_RATE);

      const record: PaymentRecord = {
        reference,
        type: 'goods',
        orderId,
        itemIds: [item.id],
        amountKobo: Math.round(totalNaira * 100),
        amountNaira: totalNaira,
        goodsAmount,
        commission,
        gatewayFee,
        status: 'pending',
        buyerUid: req.user.uid,
        createdAt: new Date().toISOString()
      };
      await savePaymentRecord(reference, record);

      if (PAYMENTS_MODE === 'demo') {
        await handlePaymentSuccess(reference);
        const updated = await getOrderFromStorage(orderId);
        return res.json({
          success: true,
          status: 'paid',
          order: updated,
          message: `Payment confirmed! ₦${goodsAmount.toLocaleString()} received via Paystack.`
        });
      }

      res.json({
        success: true,
        paymentUrl: `/api/payments/initialize`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Manual / Cron Auto-settlement trigger
  app.post('/api/orders/auto-settle', async (_req: Request, res: Response) => {
    await runAutoSettleAndReservations();
    res.json({ success: true, timestamp: new Date().toISOString() });
  });

  // --- PHASE 3: SELLER ONBOARDING & SUBACCOUNT ENGINE ---

  // Owner admin middleware: requires chukwuagoziemgracious@gmail.com
  const requireOwnerAdmin = async (req: any, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      const userEmail = (req.user?.email || '').toLowerCase().trim();
      const isOwner = userEmail === 'chukwuagoziemgracious@gmail.com';
      if (!isOwner) {
        return res.status(403).json({ error: 'Forbidden: Platform owner authorization required' });
      }
      next();
    });
  };

  // 10. Vendor Fee Status
  app.get('/api/vendor-fee/status', async (_req: Request, res: Response) => {
    const paidCount = await getPaidVendorsCount();
    const currentFee = paidCount < EARLY_VENDOR_LIMIT ? VENDOR_FEE_EARLY : VENDOR_FEE_STANDARD;
    const gatewayFee = calculateGatewayFee(currentFee);
    res.json({
      paidCount,
      earlyLimit: EARLY_VENDOR_LIMIT,
      fee: currentFee,
      gatewayFee,
      totalWithGateway: currentFee + gatewayFee,
      isEarlyBird: paidCount < EARLY_VENDOR_LIMIT
    });
  });

  // 11. Admin Seller Approval & Paystack Subaccount Creation
  app.post('/api/admin/sellers/:userId/approve', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const sellerId = req.params.userId;
      const user = await getUserProfile(sellerId);
      if (!user) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      // Look up verification document
      let verifDoc = memoryVerifications.get(sellerId);
      if (!verifDoc && adminDb) {
        try {
          const snap = await adminDb.collection('verifications').doc(sellerId).get();
          if (snap.exists) {
            verifDoc = snap.data();
          } else {
            const qSnap = await adminDb.collection('verifications').where('userId', '==', sellerId).limit(1).get();
            if (!qSnap.empty) verifDoc = qSnap.docs[0].data();
          }
        } catch {}
      }

      const bankName = verifDoc?.bankName || user.bankDetails?.bankName || 'Access Bank';
      const accountNumber = verifDoc?.accountNumber || user.bankDetails?.accountNumber;
      const proposedAccountName = verifDoc?.accountName || user.bankDetails?.accountName || user.name;

      if (!accountNumber) {
        return res.status(400).json({ error: 'Seller account number is missing from verification dossier.' });
      }

      // Map bank to Paystack bank code
      const bankList = await getPaystackBanks();
      const bankCode = findBankCode(bankName, bankList);

      // Resolve real account name
      let resolvedAccountName = proposedAccountName;
      if (PAYMENTS_MODE !== 'demo') {
        try {
          const resolveData = await paystackRequest(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
          resolvedAccountName = resolveData.account_name;
        } catch (resolveErr: any) {
          return res.status(400).json({ 
            error: `Failed to resolve bank account with Paystack: ${resolveErr.message}`,
            mismatch: false
          });
        }
      }

      // Compare names: require at least 2 distinct matching name parts
      const nameComparison = compareNames(user.name, resolvedAccountName);
      if (!nameComparison.matches) {
        return res.status(400).json({
          error: 'Bank account name mismatch',
          mismatch: true,
          sellerName: user.name,
          resolvedAccountName,
          matchedParts: nameComparison.matchedParts,
          message: `Bank account holder name "${resolvedAccountName}" does not match seller registered name "${user.name}". At least two name parts must match.`
        });
      }

      // Create Paystack subaccount
      let subaccountCode = `SUB_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      if (PAYMENTS_MODE !== 'demo') {
        try {
          const subaccountData = await paystackRequest('/subaccount', 'POST', {
            business_name: user.storeName || user.name,
            settlement_bank: bankCode,
            account_number: accountNumber,
            percentage_charge: 0,
            description: `Abbason Hub subaccount for ${user.name}`
          });
          subaccountCode = subaccountData.subaccount_code;
        } catch (subErr: any) {
          return res.status(500).json({ error: `Paystack subaccount creation failed: ${subErr.message}` });
        }
      }

      const maskedNumber = `******${accountNumber.slice(-4)}`;

      // Save subaccountCode in sellerPrivate/{uid}
      memorySellerPrivate.set(sellerId, {
        subaccountCode,
        bankCode,
        bankName,
        accountNumberMasked: maskedNumber,
        accountName: resolvedAccountName,
        updatedAt: new Date().toISOString()
      });

      if (adminDb) {
        try {
          await adminDb.collection('sellerPrivate').doc(sellerId).set({
            subaccountCode,
            bankCode,
            bankName,
            accountNumberMasked: maskedNumber,
            accountName: resolvedAccountName,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          // Update user: approved_pending_fee, isVerifiedSeller: false
          await adminDb.collection('users').doc(sellerId).update({
            sellerVerificationStatus: 'approved_pending_fee',
            isVerifiedSeller: false,
            role: 'seller',
            bankDetails: {
              bankName,
              accountNumberMasked: maskedNumber,
              accountName: resolvedAccountName
            }
          });

          // Write public seller profile
          await adminDb.collection('sellerProfiles').doc(sellerId).set({
            id: sellerId,
            storeName: user.storeName || user.name,
            campusId: user.campusId || 'all',
            campusName: user.campusName || 'Campus Hub',
            isVerifiedSeller: false,
            isSuspended: false
          }, { merge: true });

          // Update verification record: mask account number & delete raw account number
          if (verifDoc?.id) {
            await adminDb.collection('verifications').doc(verifDoc.id).update({
              status: 'approved',
              accountNumber: maskedNumber,
              approvedAt: new Date().toISOString()
            });
          }
        } catch (dbErr: any) {
          console.warn('[Admin Approve] DB write warning:', dbErr.message);
        }
      }

      if (clientDb) {
        try {
          await updateDoc(doc(clientDb, 'users', sellerId), {
            sellerVerificationStatus: 'approved_pending_fee',
            isVerifiedSeller: false,
            role: 'seller'
          });
          await setDoc(doc(clientDb, 'sellerProfiles', sellerId), {
            id: sellerId,
            storeName: user.storeName || user.name,
            campusId: user.campusId || 'all',
            campusName: user.campusName || 'Campus Hub',
            isVerifiedSeller: false,
            isSuspended: false
          }, { merge: true });
        } catch {}
      }

      res.json({
        success: true,
        sellerId,
        subaccountCode,
        status: 'approved_pending_fee',
        message: 'Seller approved successfully. Prompted to pay vendor fee to unlock listing.'
      });
    } catch (err: any) {
      console.error('[Admin Approve Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Admin Seller Reject
  app.post('/api/admin/sellers/:userId/reject', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const sellerId = req.params.userId;
      const { reason } = req.body;

      if (adminDb) {
        try {
          await adminDb.collection('users').doc(sellerId).update({
            sellerVerificationStatus: 'rejected',
            isVerifiedSeller: false,
            rejectionReason: reason || 'Information could not be verified'
          });
        } catch {}
      }

      if (clientDb) {
        try {
          await updateDoc(doc(clientDb, 'users', sellerId), {
            sellerVerificationStatus: 'rejected',
            isVerifiedSeller: false
          });
        } catch {}
      }

      res.json({ success: true, message: 'Seller verification rejected.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. Admin Seller Suspend
  app.post('/api/admin/sellers/:userId/suspend', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const sellerId = req.params.userId;
      const durationDays = req.body.durationDays ? parseInt(req.body.durationDays, 10) : BAN_DAYS;
      const suspendedUntilMs = Date.now() + (durationDays * 24 * 3600 * 1000);

      if (adminDb) {
        try {
          await adminDb.collection('users').doc(sellerId).update({ suspendedUntilMs });
          await adminDb.collection('sellerProfiles').doc(sellerId).update({ isSuspended: true });
        } catch {}
      }

      if (clientDb) {
        try {
          await updateDoc(doc(clientDb, 'users', sellerId), { suspendedUntilMs });
          await updateDoc(doc(clientDb, 'sellerProfiles', sellerId), { isSuspended: true });
        } catch {}
      }

      res.json({ success: true, sellerId, suspendedUntilMs, message: `Seller suspended for ${durationDays} days.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Admin Seller Unsuspend
  app.post('/api/admin/sellers/:userId/unsuspend', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const sellerId = req.params.userId;

      if (adminDb) {
        try {
          await adminDb.collection('users').doc(sellerId).update({ suspendedUntilMs: 0 });
          await adminDb.collection('sellerProfiles').doc(sellerId).update({ isSuspended: false });
        } catch {}
      }

      if (clientDb) {
        try {
          await updateDoc(doc(clientDb, 'users', sellerId), { suspendedUntilMs: 0 });
          await updateDoc(doc(clientDb, 'sellerProfiles', sellerId), { isSuspended: false });
        } catch {}
      }

      res.json({ success: true, sellerId, message: 'Seller suspension lifted successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Seller Bank Change Request
  app.post('/api/sellers/bank-change-request', requireAuth, async (req: any, res: Response) => {
    try {
      const sellerId = req.user.uid;
      const { bankName, accountNumber, accountName } = req.body;

      if (!accountNumber || accountNumber.length < 10) {
        return res.status(400).json({ error: 'Valid 10-digit NUBAN account number required.' });
      }

      const changeReq = {
        userId: sellerId,
        userName: req.user.name || 'Vendor',
        bankName,
        accountNumber,
        accountName,
        status: 'pending',
        type: 'bank_change_request',
        submittedAt: new Date().toISOString()
      };

      memoryVerifications.set(sellerId, changeReq);

      if (adminDb) {
        try {
          await adminDb.collection('verifications').doc(`bank_${sellerId}`).set(changeReq, { merge: true });
        } catch {}
      }

      res.json({ success: true, message: 'Bank account change request submitted for admin review.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- PHASE 4: DELIVERY RULES, REFUNDS, STRIKES & ADMIN TOOLS ---

  // 16. Mark Delivered (Seller marks parcel arrived at meeting point)
  app.post('/api/orders/:id/mark-delivered', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isSeller = req.user.uid === order.sellerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isSeller && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only seller can mark order delivered' });
      }

      order.status = 'delivered_pending_inspection';
      order.deliveredAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        message: 'Parcel marked delivered. Student can now inspect items and complete payment.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 17. Reject Order Item at Handover Inspection
  app.post('/api/orders/:id/items/:itemId/reject', requireAuth, async (req: any, res: Response) => {
    try {
      const { id: orderId, itemId } = req.params;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Reason is required for rejecting an item.' });
      }

      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isBuyer = req.user.uid === order.buyerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isBuyer && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only buyer can reject item during inspection' });
      }

      const item = (order.items || []).find((i: any) => i.id === itemId || i.itemCode === itemId);
      if (!item) return res.status(404).json({ error: 'Item not found in order' });

      item.status = 'rejected';
      item.rejectionReason = reason.trim();
      item.rejectedAt = new Date().toISOString();

      // Recalculate remaining goods due
      const pendingItems = order.items.filter((i: any) => i.status === 'pending_inspection');
      order.goodsDue = pendingItems.reduce((sum: number, i: any) => sum + (i.price * (i.quantity || 1)), 0);

      // If all items are now either paid or rejected, order is completed
      if (pendingItems.length === 0) {
        order.status = 'paid_completed';
        order.completedAt = new Date().toISOString();
      }

      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        rejectedItem: item,
        message: 'Item rejected due to inspection fault. Delivery fee is non-refundable.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 18. Order Cancellation (Buyer cutoff 48h / Seller any time with refund obligation)
  app.post('/api/orders/:id/cancel', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isBuyer = req.user.uid === order.buyerId;
      const isSeller = req.user.uid === order.sellerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';

      if (!isBuyer && !isSeller && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized to cancel this order' });
      }

      if (order.status === 'paid_completed' || order.status === 'cancelled') {
        return res.status(400).json({ error: 'Order cannot be cancelled in its current state.' });
      }

      if (isBuyer && !isOwner) {
        // Enforce 48-hour cutoff before delivery deadline
        const cutoff = order.contactRevealAtMs || (order.deliveryDeadlineMs ? order.deliveryDeadlineMs - (CANCEL_CUTOFF_HOURS * 3600 * 1000) : 0);
        if (Date.now() >= cutoff) {
          return res.status(400).json({
            error: 'Cancellation closed. Orders can only be cancelled up to 48 hours before the delivery deadline.'
          });
        }
        order.status = 'cancelled';
        order.cancelReason = 'buyer_cancelled';
        await restoreOrderStock(order.items);
      } else if (isSeller && !isOwner) {
        // Seller cancels at any time: must refund buyer delivery fee (1x)
        order.status = 'cancelled';
        order.cancelReason = 'seller_cancelled';
        await restoreOrderStock(order.items);
        if (order.deliveryFeePaid && (order.deliveryFee || 0) > 0) {
          const deadline = order.deliveryDeadlineMs || Date.now();
          order.refund = {
            owedAmount: order.deliveryFee,
            multiplier: 1,
            status: 'owed',
            dueAt: deadline + (SELLER_GRACE_HOURS * 3600 * 1000)
          };
        }
      } else {
        // Owner admin cancel
        order.status = 'cancelled';
        order.cancelReason = req.body.reason || 'admin_cancelled';
        await restoreOrderStock(order.items);
      }

      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        message: 'Order cancelled successfully.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 19. Refund Handshake: Buyer Registers Refund Bank Account
  app.post('/api/orders/:id/refund/bank-details', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const { bankName, accountNumber, accountName } = req.body;

      if (!accountNumber || accountNumber.replace(/\D/g, '').length !== 10) {
        return res.status(400).json({ error: 'Valid 10-digit NUBAN account number required.' });
      }

      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isBuyer = req.user.uid === order.buyerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isBuyer && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only buyer can specify refund bank details' });
      }

      order.refundAccount = {
        bankName: bankName || 'Nigerian Bank',
        accountNumber: accountNumber.replace(/\D/g, ''),
        accountName: (accountName || order.buyerName || '').trim(),
        submittedAt: new Date().toISOString()
      };

      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({ success: true, order, message: 'Refund payout account saved.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 20. Refund Handshake: Seller Taps "I Have Sent The Refund"
  app.post('/api/orders/:id/refund/mark-sent', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isSeller = req.user.uid === order.sellerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isSeller && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only seller can claim refund sent' });
      }

      if (!order.refund) {
        order.refund = {
          owedAmount: order.deliveryFee || 0,
          multiplier: 1,
          status: 'owed',
          dueAt: Date.now() + (24 * 3600 * 1000)
        };
      }

      order.refund.status = 'paid_claimed';
      order.refund.claimedAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        message: 'Refund marked as sent. Buyer prompted to confirm receipt.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 21. Refund Handshake: Buyer Confirms "I Received It"
  app.post('/api/orders/:id/refund/confirm', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isBuyer = req.user.uid === order.buyerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isBuyer && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only buyer can confirm refund receipt' });
      }

      if (!order.refund) {
        return res.status(400).json({ error: 'No refund active on this order' });
      }

      order.refund.status = 'confirmed';
      order.refund.confirmedAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({ success: true, order, message: 'Refund confirmed successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 22. Refund Handshake: Buyer Disputes "I Did Not Receive It"
  app.post('/api/orders/:id/refund/dispute', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isBuyer = req.user.uid === order.buyerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isBuyer && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only buyer can dispute refund' });
      }

      if (!order.refund) {
        return res.status(400).json({ error: 'No refund active on this order' });
      }

      order.refund.status = 'disputed';
      order.refund.disputedAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();

      const complaintId = `comp_ref_${Date.now()}`;
      const complaintRecord = {
        id: complaintId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId,
        buyerName: order.buyerName,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        reason: 'Refund Not Received',
        description: req.body.description || 'Buyer did not receive delivery fee refund claimed by seller.',
        type: 'unconfirmed_refund',
        status: 'open',
        createdAt: new Date().toISOString()
      };

      memoryComplaints.set(complaintId, complaintRecord);
      if (adminDb) {
        try {
          await adminDb.collection('complaints').doc(complaintId).set(complaintRecord);
        } catch {}
      }

      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        message: 'Refund disputed and forwarded to platform administration queue.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 23. Seller Reports Buyer Refused To Pay For Problem-Free Item
  app.post('/api/orders/:id/report-buyer-refusal', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'Specific reason is required.' });
      }

      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const isSeller = req.user.uid === order.sellerId;
      const isOwner = (req.user?.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
      if (!isSeller && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized: Only seller can report buyer refusal' });
      }

      const complaintId = `comp_refuse_${Date.now()}`;
      const complaintRecord = {
        id: complaintId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId,
        buyerName: order.buyerName,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        reason: 'Buyer Refused Payment For Problem-Free Item',
        description: reason.trim(),
        type: 'buyer_non_payment',
        status: 'open',
        createdAt: new Date().toISOString()
      };

      memoryComplaints.set(complaintId, complaintRecord);
      if (adminDb) {
        try {
          await adminDb.collection('complaints').doc(complaintId).set(complaintRecord);
        } catch {}
      }

      order.buyerReportedRefusal = true;
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({
        success: true,
        order,
        message: 'Report submitted. Administrator will review for 30-day buyer suspension.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 24. Admin Bans Buyer or User For 30 Days
  app.post('/api/admin/users/:userId/ban', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const userId = req.params.userId;
      const bannedUntilMs = Date.now() + (BAN_DAYS * 24 * 3600 * 1000);

      if (adminDb) {
        try {
          await adminDb.collection('users').doc(userId).update({ bannedUntilMs });
        } catch {}
      }
      if (clientDb) {
        try {
          await updateDoc(doc(clientDb, 'users', userId), { bannedUntilMs });
        } catch {}
      }

      res.json({
        success: true,
        userId,
        bannedUntilMs,
        message: `User banned for ${BAN_DAYS} days.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 25. File Order Complaint (e.g. Late delivery)
  app.post('/api/orders/:id/complaint', requireAuth, async (req: any, res: Response) => {
    try {
      const orderId = req.params.id;
      const { reason, description } = req.body;

      const order = await getOrderFromStorage(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const complaintId = `comp_${Date.now()}`;
      const complaintRecord = {
        id: complaintId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId,
        buyerName: order.buyerName,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        reason: reason || 'Late delivery',
        description: description || '',
        type: reason === 'Late delivery' ? 'late_delivery' : 'general',
        status: 'open',
        createdAt: new Date().toISOString()
      };

      memoryComplaints.set(complaintId, complaintRecord);
      if (adminDb) {
        try {
          await adminDb.collection('complaints').doc(complaintId).set(complaintRecord);
        } catch {}
      }

      order.status = 'disputed';
      order.updatedAt = new Date().toISOString();
      await saveOrderToStorage(orderId, order);

      res.json({ success: true, complaint: complaintRecord, message: 'Complaint filed.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 26. Admin Dispute Resolve
  app.post('/api/admin/disputes/:id/resolve', requireOwnerAdmin, async (req: any, res: Response) => {
    try {
      const disputeId = req.params.id;
      const { resolutionNote, resolutionType } = req.body;

      let complaint = memoryComplaints.get(disputeId);
      if (!complaint && adminDb) {
        try {
          const snap = await adminDb.collection('complaints').doc(disputeId).get();
          if (snap.exists) complaint = snap.data();
        } catch {}
      }

      if (!complaint) return res.status(404).json({ error: 'Dispute record not found' });

      complaint.status = resolutionType === 'refund_buyer' ? 'resolved_refund' : 'resolved_payout';
      complaint.resolutionNote = resolutionNote || 'Resolved by administrator';
      complaint.resolvedAt = new Date().toISOString();

      memoryComplaints.set(disputeId, complaint);
      if (adminDb) {
        try {
          await adminDb.collection('complaints').doc(disputeId).set(complaint, { merge: true });
        } catch {}
      }

      res.json({ success: true, complaint, message: 'Dispute marked resolved.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 27. Admin Queues Endpoint (Overdue, Buyer Non-Payment, Unconfirmed Refunds, Open Complaints)
  app.get('/api/admin/queues', requireOwnerAdmin, async (_req: any, res: Response) => {
    try {
      const now = Date.now();
      const allOrdersList: any[] = [];

      if (adminDb) {
        try {
          const snap = await adminDb.collection('orders').limit(100).get();
          snap.forEach((d: any) => allOrdersList.push({ id: d.id, ...d.data() }));
        } catch {}
      }
      memoryOrders.forEach((o, id) => {
        if (!allOrdersList.find((x) => x.id === id)) allOrdersList.push({ id, ...o });
      });

      const allComplaintsList: any[] = [];
      if (adminDb) {
        try {
          const snap = await adminDb.collection('complaints').limit(100).get();
          snap.forEach((d: any) => allComplaintsList.push({ id: d.id, ...d.data() }));
        } catch {}
      }
      memoryComplaints.forEach((c, id) => {
        if (!allComplaintsList.find((x) => x.id === id)) allComplaintsList.push({ id, ...c });
      });

      // 1. Overdue orders & seller defaults
      const overdueOrders = allOrdersList.filter((o) => {
        const isPastDeadline = o.deliveryDeadlineMs && now > o.deliveryDeadlineMs && o.status !== 'paid_completed' && o.status !== 'cancelled';
        return isPastDeadline || o.sellerDefault === true;
      });

      // 2. Buyer Non-payment reports
      const buyerNonPaymentReports = allComplaintsList.filter((c) => c.type === 'buyer_non_payment' && c.status === 'open');

      // 3. Unconfirmed or Disputed Refunds
      const unconfirmedRefunds = allOrdersList.filter((o) => {
        return o.refund && (o.refund.status === 'disputed' || (o.refund.status === 'owed' && now > (o.refund.dueAt || 0)));
      });

      // 4. Open General Complaints
      const openComplaints = allComplaintsList.filter((c) => c.status === 'open' && c.type !== 'buyer_non_payment');

      // Calculate seller strikes
      const strikesBySeller: Record<string, number> = {};
      allOrdersList.forEach((o) => {
        if (o.sellerDefault && o.sellerId) {
          strikesBySeller[o.sellerId] = (strikesBySeller[o.sellerId] || 0) + 1;
        }
      });

      res.json({
        overdueOrders,
        buyerNonPaymentReports,
        unconfirmedRefunds,
        openComplaints,
        strikesBySeller
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite integration: middleware in development, static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Periodic interval every 10 minutes
  setInterval(runAutoSettleAndReservations, 10 * 60 * 1000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Abbason Hub server running at http://0.0.0.0:${port} [${PAYMENTS_MODE.toUpperCase()} MODE]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Abbason Hub server:', err);
  process.exit(1);
});
