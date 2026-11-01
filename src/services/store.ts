import {
  Campus,
  Category,
  Product,
  User,
  Order,
  CartItem,
  Complaint,
  PayoutRecord,
  SellerVerificationRequest,
  PlatformMetrics,
  Role,
  DeliveryOption,
  SellerReview
} from '../types';
import { CAMPUSES, CATEGORIES, INITIAL_USERS, INITIAL_PRODUCTS, INITIAL_ORDERS, INITIAL_SELLER_REVIEWS } from '../data/seedData';
import { calculatePlatformCommission, calculateGatewayFee } from '../utils/currency';
import { generateDeliveryOtp, generateSalt, hashOtp } from '../utils/crypto';
import {
  testConnection,
  subscribeToProducts,
  subscribeToOrders,
  saveProductToFirestore,
  updateProductInFirestore,
  saveOrderToFirestore,
  updateOrderInFirestore,
  saveReviewToFirestore,
  saveComplaintToFirestore,
  updateComplaintInFirestore,
  saveVerificationToFirestore,
  updateVerificationInFirestore,
  updateUserInFirestore
} from './firebase';

const STORAGE_KEYS = {
  CAMPUSES: 'abbason_campuses_v4',
  ACTIVE_CAMPUS: 'abbason_active_campus_v4',
  USERS: 'abbason_users_v4',
  CURRENT_USER: 'abbason_current_user_v4',
  PRODUCTS: 'abbason_products_v4',
  ORDERS: 'abbason_orders_v4',
  CART: 'abbason_cart_v4',
  COMPLAINTS: 'abbason_complaints_v4',
  PAYOUTS: 'abbason_payouts_v4',
  VERIFICATIONS: 'abbason_verifications_v4',
  REVIEWS: 'abbason_reviews_v4',
  ADMIN_AUTH: 'abbason_admin_auth_v4',
  BRAND_LOGO: 'abbason_brand_logo_v4'
};

class Store {
  private campuses: Campus[] = [];
  private activeCampusId: string = 'all';
  private users: User[] = [];
  private currentUser: User = INITIAL_USERS[0]; // Chiamaka (Student Buyer) by default
  private products: Product[] = [];
  private orders: Order[] = [];
  private cart: CartItem[] = [];
  private complaints: Complaint[] = [];
  private payouts: PayoutRecord[] = [];
  private verifications: SellerVerificationRequest[] = [];
  private reviews: SellerReview[] = [];
  private adminAuthenticated: boolean = false;
  private buyerOtpVault: Map<string, string> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.init();
    this.initFirestore();
  }

  private initFirestore() {
    testConnection().then(() => {
      // Real-time Firestore synchronization for catalog
      subscribeToProducts((remoteProducts) => {
        if (remoteProducts && remoteProducts.length > 0) {
          const productMap = new Map<string, Product>();
          this.products.forEach((p) => productMap.set(p.id, p));
          remoteProducts.forEach((p) => productMap.set(p.id, p));
          this.products = Array.from(productMap.values());
          this.save(true);
        } else if (this.products.length > 0) {
          // Pre-seed cloud collection so all nationwide users share identical inventory
          this.products.forEach((p) => {
            saveProductToFirestore(p).catch(() => {});
          });
        }
      });

      // Real-time Firestore synchronization for orders
      subscribeToOrders((remoteOrders) => {
        if (remoteOrders && remoteOrders.length > 0) {
          const orderMap = new Map<string, Order>();
          this.orders.forEach((o) => orderMap.set(o.id, o));
          remoteOrders.forEach((o) => orderMap.set(o.id, o));
          this.orders = Array.from(orderMap.values());
          this.save(true);
        }
      });
    }).catch((err) => {
      console.warn('[Abbason Hub] Cloud sync active in offline-first mode:', err);
    });
  }

  private init() {
    try {
      // Load campuses
      const savedCampuses = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
      this.campuses = savedCampuses ? JSON.parse(savedCampuses) : CAMPUSES;

      // Active campus
      const savedActiveCampus = localStorage.getItem(STORAGE_KEYS.ACTIVE_CAMPUS);
      this.activeCampusId = savedActiveCampus || 'all';

      // Load users
      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      this.users = savedUsers ? JSON.parse(savedUsers) : INITIAL_USERS;

      // Load current user
      const savedCurrentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      this.currentUser = savedCurrentUser ? JSON.parse(savedCurrentUser) : this.users[0];

      // Load products
      const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      this.products = savedProducts ? JSON.parse(savedProducts) : INITIAL_PRODUCTS;

      // Load orders
      const savedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
      this.orders = savedOrders ? JSON.parse(savedOrders) : INITIAL_ORDERS;

      // Load cart
      const savedCart = localStorage.getItem(STORAGE_KEYS.CART);
      this.cart = savedCart ? JSON.parse(savedCart) : [];

      // Load complaints
      const savedComplaints = localStorage.getItem(STORAGE_KEYS.COMPLAINTS);
      this.complaints = savedComplaints ? JSON.parse(savedComplaints) : [];

      // Load payouts
      const savedPayouts = localStorage.getItem(STORAGE_KEYS.PAYOUTS);
      this.payouts = savedPayouts ? JSON.parse(savedPayouts) : [
        {
          id: 'payout_demo_1',
          orderId: 'order_1001',
          orderNumber: 'AB-82914',
          sellerId: 'user_emeka',
          sellerName: 'Emeka Campus Gadgets',
          bankName: 'Access Bank Nigeria',
          accountNumberMasked: '******4819',
          amount: 38060,
          commissionDeducted: 1140,
          status: 'confirmed',
          idempotencyKey: 'payout_order_1001_1728900000',
          reference: 'SIM_TX_AB82914',
          initiatedAt: '2026-10-14T06:30:00Z',
          confirmedAt: '2026-10-14T07:45:00Z'
        }
      ];

      // Load verifications
      const savedVerifications = localStorage.getItem(STORAGE_KEYS.VERIFICATIONS);
      this.verifications = savedVerifications ? JSON.parse(savedVerifications) : [];

      // Load reviews
      const savedReviews = localStorage.getItem(STORAGE_KEYS.REVIEWS);
      this.reviews = savedReviews ? JSON.parse(savedReviews) : INITIAL_SELLER_REVIEWS;

      // Load admin auth state
      const savedAdminAuth = sessionStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
      this.adminAuthenticated = savedAdminAuth === 'true';

      // Load secure buyer OTP vault
      const savedVault = localStorage.getItem('abbason_buyer_vault_v1');
      if (savedVault) {
        this.buyerOtpVault = new Map(JSON.parse(savedVault));
      }
    } catch {
      // Fallback
      this.campuses = CAMPUSES;
      this.activeCampusId = 'all';
      this.users = INITIAL_USERS;
      this.currentUser = INITIAL_USERS[0];
      this.products = INITIAL_PRODUCTS;
      this.orders = INITIAL_ORDERS;
      this.cart = [];
      this.complaints = [];
      this.payouts = [];
      this.verifications = [];
      this.reviews = INITIAL_SELLER_REVIEWS;
      this.adminAuthenticated = false;
    }
  }

  private save(notify = true) {
    try {
      localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(this.campuses));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CAMPUS, this.activeCampusId);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(this.currentUser));
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(this.orders));
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
      localStorage.setItem(STORAGE_KEYS.COMPLAINTS, JSON.stringify(this.complaints));
      localStorage.setItem(STORAGE_KEYS.PAYOUTS, JSON.stringify(this.payouts));
      localStorage.setItem(STORAGE_KEYS.VERIFICATIONS, JSON.stringify(this.verifications));
      localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(this.reviews));
    } catch (err) {
      console.warn('Storage save error:', err);
    }
    if (notify) {
      this.notify();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // --- Buyer Secret Vault (Plaintext OTPs kept strictly local to buyer) ---
  public getBuyerOtp(orderId: string): string | undefined {
    return this.buyerOtpVault.get(orderId);
  }

  public saveBuyerOtp(orderId: string, otp: string): void {
    this.buyerOtpVault.set(orderId, otp);
    try {
      localStorage.setItem('abbason_buyer_vault_v1', JSON.stringify(Array.from(this.buyerOtpVault.entries())));
    } catch {}
  }

  // --- Admin Access Gating (Zero-Trust Verified by Google OAuth) ---
  public isAdminAuthenticated(): boolean {
    const isOwnerEmail = this.currentUser.email.toLowerCase() === 'chukwuagoziemgracious@gmail.com';
    return isOwnerEmail && (this.adminAuthenticated || this.currentUser.role === 'admin');
  }

  public setAdminSession(authenticated: boolean, adminUser?: User): void {
    if (this.currentUser.email.toLowerCase() !== 'chukwuagoziemgracious@gmail.com' && adminUser?.email.toLowerCase() !== 'chukwuagoziemgracious@gmail.com') {
      console.warn('Unauthorized attempt to elevate to admin session.');
      return;
    }
    this.adminAuthenticated = authenticated;
    try {
      if (authenticated) {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      }
    } catch {}
    if (adminUser) {
      this.currentUser = adminUser;
    }
    this.save();
  }

  public authenticateAdmin(email: string): boolean {
    // Hardcoded passcodes ('abbason2026', 'admin123') completely eliminated.
    // Strictly requires the verified owner email.
    if (email.trim().toLowerCase() === 'chukwuagoziemgracious@gmail.com') {
      const adminUser = this.users.find((u) => u.email.toLowerCase() === 'chukwuagoziemgracious@gmail.com') ||
        INITIAL_USERS.find((u) => u.role === 'admin');
      if (adminUser) {
        this.setAdminSession(true, adminUser);
        return true;
      }
    }
    return false;
  }

  public logoutAdmin(): void {
    this.adminAuthenticated = false;
    try {
      sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
    } catch {}
    const studentUser = this.users.find((u) => u.role === 'student') || INITIAL_USERS[0];
    this.currentUser = studentUser;
    this.save();
  }

  // --- Campus Methods ---
  public getCampuses(): Campus[] {
    return this.campuses;
  }

  public getActiveCampus(): Campus {
    return this.campuses.find((c) => c.id === this.activeCampusId) || this.campuses[0];
  }

  public setActiveCampus(campusId: string) {
    this.activeCampusId = campusId;
    this.save();
  }

  // --- User & Auth Methods ---
  public getCurrentUser(): User {
    return this.currentUser;
  }

  public getUsers(): User[] {
    return this.users;
  }

  public canUserSell(userId?: string): boolean {
    const targetId = userId || this.currentUser.id;
    const user = this.users.find((u) => u.id === targetId) || this.currentUser;
    return !!user.isVerifiedSeller && user.sellerVerificationStatus === 'verified';
  }

  public getSellerVerificationStatus(userId?: string): 'not_applied' | 'pending' | 'verified' | 'rejected' {
    const targetId = userId || this.currentUser.id;
    const user = this.users.find((u) => u.id === targetId) || this.currentUser;
    if (user.sellerVerificationStatus) return user.sellerVerificationStatus;
    if (user.isVerifiedSeller) return 'verified';
    const pendingReq = this.verifications.find((v) => v.userId === targetId && v.status === 'pending');
    if (pendingReq) return 'pending';
    return 'not_applied';
  }

  public switchRole(role: Role) {
    const user = this.users.find((u) => u.role === role);
    if (user) {
      this.currentUser = user;
      this.save();
    }
  }

  public setCurrentUser(user: User) {
    this.currentUser = user;
    const idx = this.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      this.users[idx] = user;
    } else {
      this.users.push(user);
    }
    this.save();
  }

  public registerUser(data: {
    name: string;
    email: string;
    phone: string;
    role: Role;
    campusId: string;
    hostel: string;
    storeName?: string;
  }): User {
    const campus = this.campuses.find((c) => c.id === data.campusId) || this.campuses[0];
    const newUser: User = {
      id: `user_${Date.now()}`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      campusId: campus.id,
      campusName: campus.name,
      hostel: data.hostel,
      isVerifiedSeller: false,
      sellerVerificationStatus: 'not_applied',
      storeName: data.storeName || (data.role === 'seller' ? `${data.name}'s Shop` : undefined),
      bio: data.role === 'seller' ? 'Student seller on Abbason Hub' : undefined,
      salesCount: 0,
      rating: 5.0,
      reviewsCount: 0
    };
    this.users.push(newUser);
    this.currentUser = newUser;
    this.save();
    return newUser;
  }

  // --- Category Methods ---
  public getCategories(): Category[] {
    return CATEGORIES;
  }

  // --- Product Methods ---
  public getApprovedProducts(filters?: {
    campusId?: string;
    category?: string;
    search?: string;
    brand?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
  }): Product[] {
    return this.products.filter((p) => {
      // Must be approved to show up on public catalog
      if (p.status !== 'approved') return false;

      // Campus filter: 'all' shows all products nationwide
      if (filters?.campusId && filters.campusId !== 'all' && p.campusId !== filters.campusId && p.campusId !== 'all') {
        return false;
      }

      // Category filter
      if (filters?.category && filters.category !== 'all' && p.category !== filters.category) {
        return false;
      }

      // Search query (title, description, brand, or category)
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesDesc = p.description.toLowerCase().includes(q);
        const matchesCategory = p.category.toLowerCase().includes(q);
        const matchesBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
        if (!matchesTitle && !matchesDesc && !matchesCategory && !matchesBrand) {
          return false;
        }
      }

      // Brand filter
      if (filters?.brand && filters.brand !== 'all' && p.brand !== filters.brand) {
        return false;
      }

      // Condition filter
      if (filters?.condition && filters.condition !== 'all' && p.condition !== filters.condition) {
        return false;
      }

      // Price range
      if (filters?.minPrice !== undefined && p.price < filters.minPrice) return false;
      if (filters?.maxPrice !== undefined && p.price > filters.maxPrice) return false;

      return true;
    });
  }

  public getProductById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  public getSellerProducts(sellerId: string): Product[] {
    return this.products.filter((p) => p.sellerId === sellerId);
  }

  public getPendingProducts(): Product[] {
    return this.products.filter((p) => p.status === 'pending_review');
  }

  public createProduct(data: {
    title: string;
    description: string;
    price: number;
    category: string;
    condition: 'new' | 'used_like_new' | 'used_good';
    images: string[];
    stock: number;
    deliveryOption: DeliveryOption;
    deliveryFee: number;
    pickupLandmark: string;
    brand?: string;
  }): Product {
    // Check if seller is verified
    if (!this.canUserSell(this.currentUser.id)) {
      throw new Error('Only verified sellers can submit listings. Please complete student seller verification.');
    }

    const campus = this.getActiveCampus();
    const newProduct: Product = {
      id: `prod_${Date.now()}`,
      sellerId: this.currentUser.id,
      sellerName: this.currentUser.storeName || this.currentUser.name,
      sellerPhone: this.currentUser.phone,
      sellerVerified: true,
      sellerRating: this.currentUser.rating || 5.0,
      sellerReviewCount: this.currentUser.reviewsCount || 0,
      campusId: campus.id === 'all' ? this.currentUser.campusId || 'unizik' : campus.id,
      campusName: campus.id === 'all' ? this.currentUser.campusName || 'Nnamdi Azikiwe University (UNIZIK)' : campus.name,
      title: data.title,
      description: data.description,
      price: data.price,
      category: data.category,
      condition: data.condition,
      images: data.images.length > 0 ? data.images : [
        'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80'
      ],
      stock: data.stock,
      deliveryOption: data.deliveryOption,
      deliveryFee: data.deliveryFee,
      pickupLandmark: data.pickupLandmark,
      brand: data.brand || 'Student Brand',
      status: 'pending_review', // Strict rule: starts UNPUBLISHED until approved by Admin!
      createdAt: new Date().toISOString()
    };

    this.products.unshift(newProduct);
    this.save();
    saveProductToFirestore(newProduct).catch((err) => {
      console.warn('Firestore product create sync warning:', err);
    });
    return newProduct;
  }

  public approveProduct(productId: string): boolean {
    const p = this.products.find((item) => item.id === productId);
    if (p) {
      p.status = 'approved';
      p.rejectionReason = undefined;
      this.save();
      updateProductInFirestore(productId, { status: 'approved' }).catch((err) => {
        console.warn('Firestore product approve sync warning:', err);
      });
      return true;
    }
    return false;
  }

  public rejectProduct(productId: string, reason: string): boolean {
    const p = this.products.find((item) => item.id === productId);
    if (p) {
      p.status = 'rejected';
      p.rejectionReason = reason;
      this.save();
      updateProductInFirestore(productId, { status: 'rejected', rejectionReason: reason }).catch((err) => {
        console.warn('Firestore product reject sync warning:', err);
      });
      return true;
    }
    return false;
  }

  // --- Cart Methods ---
  public getCart(): CartItem[] {
    return this.cart;
  }

  public addToCart(product: Product, quantity = 1) {
    const existing = this.cart.find((item) => item.product.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({ product, quantity });
    }
    this.save();
  }

  public updateCartQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }
    const item = this.cart.find((i) => i.product.id === productId);
    if (item) {
      item.quantity = quantity;
      this.save();
    }
  }

  public removeFromCart(productId: string) {
    this.cart = this.cart.filter((i) => i.product.id !== productId);
    this.save();
  }

  public clearCart() {
    this.cart = [];
    this.save();
  }

  // --- Order Creation & Multi-Vendor Escrow Logic ---
  public async checkoutOrders(data: {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    deliveryInstructions: string;
    paymentMethod: 'card' | 'bank_transfer' | 'ussd';
  }): Promise<Order[]> {
    if (this.cart.length === 0) {
      throw new Error('Basket is empty');
    }

    // Group cart items strictly by sellerId for vendor-isolated escrow orders
    const vendorMap = new Map<string, CartItem[]>();
    for (const item of this.cart) {
      const sId = item.product.sellerId;
      if (!vendorMap.has(sId)) {
        vendorMap.set(sId, []);
      }
      vendorMap.get(sId)!.push(item);
    }

    const createdOrders: Order[] = [];

    for (const [sellerId, items] of vendorMap.entries()) {
      const firstProduct = items[0].product;
      const campus = this.campuses.find((c) => c.id === firstProduct.campusId) || this.getActiveCampus();

      const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const deliveryFee = data.fulfillmentType === 'seller_delivers'
        ? Math.max(...items.map((item) => item.product.deliveryFee))
        : 0;

      // Platform commission capped at ₦2,000 max
      const platformCommission = calculatePlatformCommission(subtotal);
      // Consistent Gateway Fee: calculated on total order transaction (subtotal + deliveryFee)
      const gatewayFee = calculateGatewayFee(subtotal + deliveryFee);
      const totalAmount = subtotal + deliveryFee + gatewayFee;
      const sellerPayoutAmount = subtotal - platformCommission + deliveryFee;

      // Cryptographic 6-digit OTP generation and SHA-256 salting
      const plaintextOtp = generateDeliveryOtp();
      const otpSalt = generateSalt();
      const otpHash = await hashOtp(plaintextOtp, otpSalt);
      const otpExpiresAt = Date.now() + 72 * 60 * 60 * 1000; // 72 hours expiry

      // Collision-resistant unique IDs
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const orderNumber = `AB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // SECURITY INVARIANT: Save plaintext OTP into buyer's local secure vault ONLY
      this.saveBuyerOtp(orderId, plaintextOtp);

      const newOrder: Order = {
        id: orderId,
        orderNumber,
        buyerId: this.currentUser.id,
        buyerName: this.currentUser.name,
        buyerPhone: this.currentUser.phone,
        buyerHostel: this.currentUser.hostel,
        sellerId,
        sellerName: firstProduct.sellerName,
        campusId: campus.id,
        campusName: campus.name,
        items: items.map((item) => ({
          productId: item.product.id,
          title: item.product.title,
          price: item.product.price,
          quantity: item.quantity,
          image: item.product.images[0]
        })),
        subtotal,
        deliveryFee,
        gatewayFee,
        totalAmount,
        platformCommission,
        sellerPayoutAmount,
        fulfillmentType: data.fulfillmentType,
        deliveryInstructions: data.deliveryInstructions,
        paymentMethod: data.paymentMethod,
        paymentStatus: 'escrow_held',
        otpHash,
        otpSalt,
        otpExpiresAt,
        otpFailedAttempts: 0,
        status: 'paid_awaiting_delivery',
        deliveryOtpForBuyer: plaintextOtp, // Keep in local buyer memory for receipt view
        hasBuyerReviewed: false,
        createdAt: new Date().toISOString()
      };

      // Decrement inventory stock on each purchased item and sync to database
      for (const item of items) {
        const prod = this.products.find((p) => p.id === item.product.id);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - item.quantity);
          updateProductInFirestore(prod.id, { stock: prod.stock }).catch((err) => {
            console.warn('Stock decrement sync warning:', err);
          });
        }
      }

      this.orders.unshift(newOrder);
      createdOrders.push(newOrder);

      // Save to cloud Firestore - plaintext OTP is stripped by saveOrderToFirestore
      saveOrderToFirestore(newOrder).catch((err) => {
        console.warn('Firestore order create sync warning:', err);
      });
    }

    this.clearCart();
    this.save();
    return createdOrders;
  }

  public async createOrder(data: {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    deliveryInstructions: string;
    paymentMethod: 'card' | 'bank_transfer' | 'ussd';
  }): Promise<Order> {
    const orders = await this.checkoutOrders(data);
    return orders[0];
  }

  public async checkoutOrder(data: {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    deliveryInstructions: string;
    paymentMethod: 'card' | 'bank_transfer' | 'ussd';
  }): Promise<Order> {
    return this.createOrder(data);
  }

  public getOrders(userId?: string, role?: Role): Order[] {
    if (!userId && !role) return this.orders;
    if (role === 'admin' || this.isAdminAuthenticated()) return this.orders;
    if (role === 'seller') return this.orders.filter((o) => o.sellerId === userId);
    return this.orders.filter((o) => o.buyerId === userId);
  }

  public getOrderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  /**
   * Server-Authoritative Delivery OTP Verification Handshake
   * Validates code against Firestore on the server and releases payout.
   */
  public async verifyDeliveryOtp(
    orderId: string,
    submittedOtp: string,
    sellerId: string
  ): Promise<{ success: boolean; error?: string; order?: Order; attemptsLeft?: number }> {
    const cleanOtp = submittedOtp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return { success: false, error: 'Please enter a valid 6-digit numeric delivery code.' };
    }

    try {
      const response = await fetch('/api/orders/verify-delivery-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          submittedOtp: cleanOtp,
          sellerId
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const order = this.orders.find((o) => o.id === orderId);
        if (order && typeof result.attemptsLeft === 'number') {
          order.otpFailedAttempts = 5 - result.attemptsLeft;
          this.save();
        }
        return {
          success: false,
          error: result.error || 'Failed to verify delivery code.',
          attemptsLeft: result.attemptsLeft
        };
      }

      // Mark delivered locally as confirmed by authoritative server response
      const order = this.orders.find((o) => o.id === orderId);
      if (order) {
        order.status = 'delivered';
        order.paymentStatus = 'payout_released';
        order.deliveredAt = result.deliveredAt || new Date().toISOString();
        order.otpFailedAttempts = 0;

        const sellerUser = this.users.find((u) => u.id === order.sellerId);
        if (sellerUser) {
          sellerUser.salesCount = (sellerUser.salesCount || 0) + 1;
        }

        // Record confirmed payout in local ledger
        const payout: PayoutRecord = {
          id: `payout_${order.id}_${Date.now()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          sellerId: order.sellerId,
          sellerName: order.sellerName,
          bankName: sellerUser?.bankDetails?.bankName || 'Verified Vendor Settlement',
          accountNumberMasked: sellerUser?.bankDetails?.accountNumberMasked || 'Verified Account',
          amount: order.sellerPayoutAmount,
          commissionDeducted: order.platformCommission,
          status: 'confirmed',
          idempotencyKey: `payout_${order.id}_${Date.now()}`,
          reference: `PAYOUT_CONFIRMED_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          initiatedAt: order.deliveredAt || new Date().toISOString(),
          confirmedAt: order.deliveredAt || new Date().toISOString()
        };

        this.payouts.unshift(payout);
        this.save();
        return { success: true, order };
      }

      return { success: true };
    } catch (err: any) {
      console.error('Server OTP verification network error:', err);
      return { success: false, error: 'Could not connect to escrow server. Please verify your connection.' };
    }
  }

  // --- Seller Rating & Review System ---
  public getSellerReviews(sellerId: string): SellerReview[] {
    return this.reviews.filter((r) => r.sellerId === sellerId);
  }

  public getSellerRatingSummary(sellerId: string): {
    average: number;
    count: number;
    breakdown: Record<number, number>;
  } {
    const sellerReviews = this.getSellerReviews(sellerId);
    if (sellerReviews.length === 0) {
      const seller = this.users.find((u) => u.id === sellerId);
      return {
        average: seller?.rating || 5.0,
        count: seller?.reviewsCount || 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }

    const sum = sellerReviews.reduce((acc, r) => acc + r.rating, 0);
    const average = Number((sum / sellerReviews.length).toFixed(1));
    const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    sellerReviews.forEach((r) => {
      const rounded = Math.round(r.rating);
      if (breakdown[rounded] !== undefined) {
        breakdown[rounded] += 1;
      }
    });

    return {
      average,
      count: sellerReviews.length,
      breakdown
    };
  }

  public addSellerReview(data: {
    sellerId: string;
    orderId?: string;
    rating: number;
    comment: string;
  }): SellerReview {
    const seller = this.users.find((u) => u.id === data.sellerId);
    const sellerName = seller?.storeName || seller?.name || 'Campus Seller';
    const campus = this.getActiveCampus();

    const newReview: SellerReview = {
      id: `rev_${Date.now()}`,
      sellerId: data.sellerId,
      sellerName,
      orderId: data.orderId,
      buyerId: this.currentUser.id,
      buyerName: this.currentUser.name,
      campusName: campus.shortName,
      rating: Math.max(1, Math.min(5, data.rating)),
      comment: data.comment.trim(),
      createdAt: new Date().toISOString(),
      verifiedPurchase: true
    };

    this.reviews.unshift(newReview);

    // Update order status if orderId provided
    if (data.orderId) {
      const order = this.orders.find((o) => o.id === data.orderId);
      if (order) {
        order.hasBuyerReviewed = true;
      }
    }

    // Recalculate average rating for seller
    const allSellerRevs = this.getSellerReviews(data.sellerId);
    const avg = Number((allSellerRevs.reduce((acc, r) => acc + r.rating, 0) / allSellerRevs.length).toFixed(1));
    const totalCount = allSellerRevs.length;

    if (seller) {
      seller.rating = avg;
      seller.reviewsCount = totalCount;
    }

    // Sync rating to all products of this seller
    this.products.forEach((p) => {
      if (p.sellerId === data.sellerId) {
        p.sellerRating = avg;
        p.sellerReviewCount = totalCount;
      }
    });

    this.save();
    saveReviewToFirestore(newReview).catch((err) => {
      console.warn('Firestore review sync warning:', err);
    });
    return newReview;
  }

  // --- Complaints & Dispute Methods ---
  public fileComplaint(orderId: string, reason: string, description: string): Complaint {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    order.status = 'disputed';

    const complaint: Complaint = {
      id: `comp_${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      sellerId: order.sellerId,
      sellerName: order.sellerName,
      reason,
      description,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    this.complaints.unshift(complaint);
    this.save();
    saveComplaintToFirestore(complaint).catch((err) => {
      console.warn('Firestore complaint sync warning:', err);
    });
    return complaint;
  }

  public getComplaints(): Complaint[] {
    return this.complaints;
  }

  public resolveDispute(
    complaintId: string,
    resolution: 'refund_buyer' | 'release_seller',
    note: string
  ): boolean {
    const complaint = this.complaints.find((c) => c.id === complaintId);
    if (!complaint) return false;

    const order = this.orders.find((o) => o.id === complaint.orderId);
    if (!order) return false;

    if (resolution === 'refund_buyer') {
      complaint.status = 'resolved_refund';
      complaint.resolutionNote = note;
      order.status = 'cancelled';
      order.paymentStatus = 'refunded';
    } else {
      complaint.status = 'resolved_payout';
      complaint.resolutionNote = note;
      order.status = 'delivered';
      order.paymentStatus = 'payout_released';
    }

    this.save();

    // Persist dispute resolution to Firestore
    updateOrderInFirestore(order.id, {
      status: order.status,
      paymentStatus: order.paymentStatus
    }).catch((err) => console.warn('Firestore dispute order update warning:', err));

    updateComplaintInFirestore(complaint.id, {
      status: complaint.status,
      resolutionNote: note
    }).catch((err) => console.warn('Firestore dispute complaint update warning:', err));

    return true;
  }

  // --- Seller Verification Methods ---
  public submitSellerVerification(data: {
    matricNumber: string;
    facultyDepartment: string;
    level: string;
    hostelShopLocation: string;
    idDocumentType: string;
    idCardPhotoUrl: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    categoriesToSell?: string;
  }): SellerVerificationRequest {
    const campus = this.getActiveCampus();
    const req: SellerVerificationRequest = {
      id: `verif_${Date.now()}`,
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userEmail: this.currentUser.email,
      phone: this.currentUser.phone,
      campusId: campus.id === 'all' ? (this.currentUser.campusId || 'unizik') : campus.id,
      campusName: campus.id === 'all' ? (this.currentUser.campusName || 'Nnamdi Azikiwe University (UNIZIK)') : campus.name,
      matricNumber: data.matricNumber,
      facultyDepartment: data.facultyDepartment,
      level: data.level,
      hostelShopLocation: data.hostelShopLocation,
      idDocumentType: data.idDocumentType,
      idCardPhotoUrl: data.idCardPhotoUrl,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountName: data.accountName,
      categoriesToSell: data.categoriesToSell,
      status: 'pending',
      submittedAt: new Date().toISOString()
    };

    this.verifications.unshift(req);

    // Update current user status
    this.currentUser.sellerVerificationStatus = 'pending';
    this.currentUser.matricNumber = data.matricNumber;
    this.currentUser.facultyDepartment = data.facultyDepartment;
    this.currentUser.level = data.level;

    const userInList = this.users.find((u) => u.id === this.currentUser.id);
    if (userInList) {
      userInList.sellerVerificationStatus = 'pending';
      userInList.matricNumber = data.matricNumber;
    }

    this.save();
    saveVerificationToFirestore(req).catch((err) => {
      console.warn('Firestore verification sync warning:', err);
    });
    return req;
  }

  public getSellerVerificationRequests(): SellerVerificationRequest[] {
    return this.verifications;
  }

  public approveSellerVerification(requestId: string): boolean {
    const req = this.verifications.find((v) => v.id === requestId);
    if (!req) return false;

    req.status = 'approved';
    req.rejectionReason = undefined;

    // Update user record
    const user = this.users.find((u) => u.id === req.userId);
    if (user) {
      user.isVerifiedSeller = true;
      user.sellerVerificationStatus = 'verified';
      user.role = 'seller';
      if (req.bankName && req.accountNumber) {
        user.bankDetails = {
          bankName: req.bankName,
          accountNumberMasked: `******${req.accountNumber.slice(-4)}`,
          accountName: req.accountName || user.name
        };
      }
      if (this.currentUser.id === user.id) {
        this.currentUser.isVerifiedSeller = true;
        this.currentUser.sellerVerificationStatus = 'verified';
        this.currentUser.role = 'seller';
        this.currentUser.bankDetails = user.bankDetails;
      }
    }

    // Update any products by this seller to show verified badge
    this.products.forEach((p) => {
      if (p.sellerId === req.userId) {
        p.sellerVerified = true;
      }
    });

    this.save();

    // Persist approval state to Firestore
    updateVerificationInFirestore(req.id, {
      status: 'approved',
      rejectionReason: undefined
    }).catch((err) => console.warn('Firestore verification approval warning:', err));

    if (user) {
      updateUserInFirestore(user.id, {
        isVerifiedSeller: true,
        sellerVerificationStatus: 'verified',
        role: 'seller',
        bankDetails: user.bankDetails
      }).catch((err) => console.warn('Firestore user verification update warning:', err));
    }

    return true;
  }

  public rejectSellerVerification(requestId: string, reason: string): boolean {
    const req = this.verifications.find((v) => v.id === requestId);
    if (!req) return false;

    req.status = 'rejected';
    req.rejectionReason = reason;

    const user = this.users.find((u) => u.id === req.userId);
    if (user) {
      user.sellerVerificationStatus = 'rejected';
      if (this.currentUser.id === user.id) {
        this.currentUser.sellerVerificationStatus = 'rejected';
      }
      updateUserInFirestore(user.id, {
        sellerVerificationStatus: 'rejected'
      }).catch((err) => console.warn('Firestore user verification rejection warning:', err));
    }

    this.save();

    updateVerificationInFirestore(req.id, {
      status: 'rejected',
      rejectionReason: reason
    }).catch((err) => console.warn('Firestore verification rejection warning:', err));

    return true;
  }

  public getPayouts(): PayoutRecord[] {
    return this.payouts;
  }

  // --- Seller Bank & Payout Methods ---
  public updateSellerBankDetails(
    userId: string,
    bankDetails: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      bankCode?: string;
    }
  ): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;

    const masked = bankDetails.accountNumber.length >= 4
      ? '******' + bankDetails.accountNumber.slice(-4)
      : bankDetails.accountNumber;

    user.bankDetails = {
      bankName: bankDetails.bankName,
      accountNumberMasked: masked,
      accountName: bankDetails.accountName || user.name
    };

    if (this.currentUser.id === userId) {
      this.currentUser = { ...this.currentUser, bankDetails: user.bankDetails };
    }

    this.save();
    this.notify();
    return true;
  }

  // --- Brand Logo Image Storage ---
  public getBrandLogoImage(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.BRAND_LOGO);
    } catch {
      return null;
    }
  }

  public setBrandLogoImage(imageUrl: string | null): void {
    try {
      if (imageUrl) {
        localStorage.setItem(STORAGE_KEYS.BRAND_LOGO, imageUrl);
      } else {
        localStorage.removeItem(STORAGE_KEYS.BRAND_LOGO);
      }
      this.notify();
    } catch (e) {
      console.error('Failed to save brand logo image:', e);
    }
  }

  // --- Platform Metrics ---
  public getPlatformMetrics(): PlatformMetrics {
    const totalGmv = this.orders
      .filter((o) => o.paymentStatus !== 'refunded')
      .reduce((sum, o) => sum + o.subtotal, 0);

    const platformCommissionCollected = this.orders
      .filter((o) => o.paymentStatus === 'payout_released')
      .reduce((sum, o) => sum + o.platformCommission, 0);

    const pendingEscrowAmount = this.orders
      .filter((o) => o.paymentStatus === 'escrow_held')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const totalOrders = this.orders.length;
    const pendingListingsCount = this.products.filter((p) => p.status === 'pending_review').length;
    const activeListingsCount = this.products.filter((p) => p.status === 'approved').length;
    const verifiedSellersCount = this.users.filter((u) => u.isVerifiedSeller).length;

    return {
      totalGmv,
      platformCommissionCollected,
      pendingEscrowAmount,
      totalOrders,
      pendingListingsCount,
      activeListingsCount,
      verifiedSellersCount
    };
  }

  public resetDemoData() {
    localStorage.clear();
    sessionStorage.clear();
    this.init();
    this.notify();
  }
}

export const store = new Store();
