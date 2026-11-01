import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase server connection using authoritative config
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let db: any = null;
try {
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const fbApp = initializeApp(firebaseConfig, 'abbason-server');
    db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
    console.log('[Server] Connected to Firestore database:', firebaseConfig.firestoreDatabaseId);
  }
} catch (err) {
  console.warn('[Server] Firestore init warning on server:', err);
}

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Log all API requests
  app.use('/api', (req, res, next) => {
    res.setHeader('X-Abbason-Environment', 'Production-Hardened');
    res.setHeader('X-Escrow-Authority', 'Server-Authoritative');
    next();
  });

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Abbason Hub Escrow Engine',
      version: '2.0.0',
      databaseConnected: !!db,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Server-Authoritative Cryptographic Delivery OTP Verification
   * 
   * CRITICAL SECURITY INVARIANT:
   * 1. The client NEVER provides the stored hash or salt.
   * 2. The server reads the order directly from the database by orderId.
   * 3. The server computes the SHA-256 hash using the DB-stored salt.
   * 4. Lockout after 5 failed attempts is strictly enforced on the server.
   * 5. No plaintext bypass fallback is accepted.
   */
  app.post('/api/orders/verify-delivery-otp', async (req: Request, res: Response) => {
    try {
      const { orderId, submittedOtp, sellerId } = req.body;

      if (!orderId || !submittedOtp || !sellerId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: orderId, submittedOtp, and sellerId are required.'
        });
      }

      const cleanOtp = String(submittedOtp).trim();
      if (!/^\d{6}$/.test(cleanOtp)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid delivery code format. Must be a 6-digit numeric code.'
        });
      }

      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'Database service unavailable on escrow server.'
        });
      }

      // Fetch authoritative order from Firestore
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'Order not found in platform escrow records.'
        });
      }

      const orderData = orderSnap.data();

      // Ensure caller is the assigned vendor
      if (orderData.sellerId !== sellerId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: You are not the assigned vendor for this order.'
        });
      }

      // Ensure order is awaiting delivery
      if (orderData.status !== 'paid_awaiting_delivery') {
        return res.status(400).json({
          success: false,
          error: `Order cannot be verified. Current status is already: ${orderData.status}`
        });
      }

      // Enforce 5 failed attempts maximum limit
      const currentFailed = orderData.otpFailedAttempts || 0;
      if (currentFailed >= 5) {
        return res.status(403).json({
          success: false,
          error: 'Maximum verification attempts (5) exceeded. Order locked for security. Please contact administrator.',
          locked: true
        });
      }

      // Enforce expiration
      if (orderData.otpExpiresAt && Date.now() > orderData.otpExpiresAt) {
        return res.status(400).json({
          success: false,
          error: 'Delivery verification code has expired (72h limit). Please contact customer support.'
        });
      }

      // Compute SHA-256 hash using the authoritative DB salt
      // Note: Hashing format matches client crypto: sha256(cleanOtp + ':' + orderData.otpSalt)
      const computedHash = crypto
        .createHash('sha256')
        .update(cleanOtp + ':' + orderData.otpSalt)
        .digest('hex');

      if (computedHash !== orderData.otpHash) {
        const newFailed = currentFailed + 1;
        await updateDoc(orderRef, {
          otpFailedAttempts: newFailed
        });
        const attemptsLeft = 5 - newFailed;
        return res.status(400).json({
          success: false,
          error: `Incorrect delivery code. ${attemptsLeft} attempt(s) remaining before order lock.`,
          attemptsLeft
        });
      }

      // MATCH CONFIRMED! Release escrow payout on server
      const deliveredAt = new Date().toISOString();
      await updateDoc(orderRef, {
        status: 'delivered',
        paymentStatus: 'payout_released',
        deliveredAt,
        otpFailedAttempts: 0
      });

      // Write immutable Payout Record
      const payoutId = `payout_${orderData.id}_${Date.now()}`;
      await setDoc(doc(db, 'payouts', payoutId), {
        id: payoutId,
        orderId: orderData.id,
        orderNumber: orderData.orderNumber,
        sellerId: orderData.sellerId,
        sellerName: orderData.sellerName,
        amount: orderData.sellerPayoutAmount,
        commissionDeducted: orderData.platformCommission,
        status: 'confirmed',
        idempotencyKey: `payout_${orderData.id}_${Date.now()}`,
        reference: `PAYOUT_CONFIRMED_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        initiatedAt: deliveredAt,
        confirmedAt: deliveredAt
      });

      return res.json({
        success: true,
        message: 'Delivery confirmed successfully. Escrow funds released to vendor account.',
        deliveredAt
      });
    } catch (err: any) {
      console.error('[Server] OTP verification error:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error processing delivery code verification.'
      });
    }
  });

  // Vite integration: middleware in development, static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Abbason Hub server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Abbason Hub server:', err);
  process.exit(1);
});
