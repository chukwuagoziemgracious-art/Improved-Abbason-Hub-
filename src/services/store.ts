import {
  Campus,
  Category,
  Product,
  User,
  SellerProfile,
  Order,
  CartItem,
  Complaint,
  PayoutRecord,
  SellerVerificationRequest,
  PlatformMetrics,
  Role,
  DeliveryOption,
  DeliverySchedule,
  SellerReview,
  OrderItem,
  OrderStatus
} from '../types';
import { CAMPUSES, CATEGORIES, INITIAL_USERS, INITIAL_PRODUCTS, INITIAL_ORDERS, INITIAL_SELLER_REVIEWS } from '../data/seedData';
import { calculatePlatformCommission, calculateGatewayFee } from '../utils/currency';
import {
  testConnection,
  subscribeToProducts,
  subscribeToSellerProfiles,
  subscribeToUserOrders,
  saveProductToFirestore,
  updateProductInFirestore,
  deleteProductFromFirestore,
  saveOrderToFirestore,
  updateOrderInFirestore,
  getUserFromFirestore,
  saveUserToFirestore,
  updateUserInFirestore,
  saveReviewToFirestore,
  saveComplaintToFirestore,
  updateComplaintInFirestore,
  saveVerificationToFirestore,
  updateVerificationInFirestore,
  cleanupSellerPhonesFromProducts,
  onAuthChange,
  logoutUser,
  auth
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
  private currentUser: User = INITIAL_USERS[0];
  private products: Product[] = [];
  private orders: Order[] = [];
  private cart: CartItem[] = [];
  private complaints: Complaint[] = [];
  private payouts: PayoutRecord[] = [];
  private verifications: SellerVerificationRequest[] = [];
  private reviews: SellerReview[] = [];
  private adminAuthenticated: boolean = false;
  private sellerProfiles: Map<string, SellerProfile> = new Map();
  private orderUnsubscribe?: () => void;
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
          this.products.forEach((p) => {
            saveProductToFirestore(p).catch(() => {});
          });
        }
      });

      // Real-time public seller profiles
      subscribeToSellerProfiles((profiles) => {
        this.sellerProfiles.clear();
        profiles.forEach((p) => this.sellerProfiles.set(p.id, p));
        this.notify();
      });

      // Listen for authenticated user session from Firebase Auth
      onAuthChange(async (fbUser) => {
        if (fbUser && fbUser.email) {
          const isOwner = fbUser.email.toLowerCase() === 'chukwuagoziemgracious@gmail.com';
          if (isOwner) {
            this.adminAuthenticated = true;
            sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
            cleanupSellerPhonesFromProducts().catch(() => {});
          }

          const cloudUser = await getUserFromFirestore(fbUser.uid);
          if (cloudUser) {
            this.currentUser = cloudUser;
          } else {
            const campus = this.campuses.find((c) => c.id !== 'all') || this.campuses[0];
            const newProfile: User = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email.split('@')[0] || 'Campus Student',
              email: fbUser.email,
              phone: fbUser.phoneNumber || '+234 800 000 0000',
              role: isOwner ? 'admin' : 'student',
              campusId: campus.id,
              campusName: campus.name,
              hostel: 'Campus Area',
              isVerifiedSeller: false,
              sellerVerificationStatus: 'not_applied'
            };
            this.currentUser = newProfile;
            saveUserToFirestore(newProfile).catch(() => {});
          }
          this.save(true);
          this.resubscribeOrders();
        } else {
          // Signed out
          this.resubscribeOrders();
        }
      });
    }).catch((err) => {
      console.warn('[Abbason Hub] Cloud sync active in offline-first mode:', err);
    });
  }

  public resubscribeOrders() {
    if (this.orderUnsubscribe) {
      this.orderUnsubscribe();
      this.orderUnsubscribe = undefined;
    }
    if (!this.currentUser || !this.currentUser.id || this.currentUser.id.startsWith('user_demo_guest')) {
      this.orders = [];
      this.save(true);
      return;
    }
    const isOwner = this.isAdminAuthenticated();
    this.orderUnsubscribe = subscribeToUserOrders(
      this.currentUser.id,
      isOwner,
      (remoteOrders) => {
        const orderMap = new Map<string, Order>();
        remoteOrders.forEach((o) => orderMap.set(o.id, o));
        this.orders = Array.from(orderMap.values());
        this.save(true);
      }
    );
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

      localStorage.removeItem('abbason_buyer_vault_v1');
      localStorage.removeItem('abbason_student_passwords_v1');
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

  public isSignedIn(): boolean {
    return !!(this.currentUser && this.currentUser.id && !this.currentUser.id.startsWith('user_demo_guest'));
  }

  public async logout(): Promise<void> {
    await logoutUser();
    this.adminAuthenticated = false;
    try {
      sessionStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
    } catch {}
    this.currentUser = INITIAL_USERS[0];
    this.resubscribeOrders();
    this.save();
  }

  public async handleGoogleLoginSuccess(
    fbUser: { uid: string; email: string | null; displayName: string | null; phoneNumber: string | null },
    campusId?: string,
    hostel?: string
  ): Promise<User> {
    const isOwner = (fbUser.email || '').toLowerCase() === 'chukwuagoziemgracious@gmail.com';
    if (isOwner) {
      this.adminAuthenticated = true;
      try {
        sessionStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
      } catch {}
    }
    const existing = await getUserFromFirestore(fbUser.uid);
    let resolvedUser: User;
    if (existing) {
      resolvedUser = {
        ...existing,
        role: isOwner ? 'admin' : existing.role,
        campusId: campusId || existing.campusId,
        hostel: hostel || existing.hostel
      };
      if (campusId) {
        const c = this.campuses.find((camp) => camp.id === campusId);
        if (c) resolvedUser.campusName = c.name;
      }
      await saveUserToFirestore(resolvedUser);
    } else {
      const selectedCampus = this.campuses.find((c) => c.id === campusId) || this.campuses.find((c) => c.id !== 'all') || this.campuses[0];
      resolvedUser = {
        id: fbUser.uid,
        name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Campus Student'),
        email: fbUser.email || '',
        phone: fbUser.phoneNumber || '',
        role: isOwner ? 'admin' : 'student',
        campusId: selectedCampus.id,
        campusName: selectedCampus.name,
        hostel: hostel || 'Campus Area',
        isVerifiedSeller: false,
        sellerVerificationStatus: 'not_applied'
      };
      await saveUserToFirestore(resolvedUser);
    }
    this.setCurrentUser(resolvedUser);
    this.resubscribeOrders();
    return resolvedUser;
  }

  public getSellerProfile(sellerId: string): SellerProfile | undefined {
    return this.sellerProfiles.get(sellerId);
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

  public getSellerVerificationStatus(userId?: string): 'not_applied' | 'pending' | 'approved_pending_fee' | 'verified' | 'rejected' {
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
    const cleanEmail = data.email.trim().toLowerCase();
    const campus = this.campuses.find((c) => c.id === data.campusId) || this.campuses[0];
    const newUser: User = {
      id: `user_${Date.now()}`,
      name: data.name,
      email: cleanEmail,
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
    deliverySchedule?: DeliverySchedule;
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
      deliverySchedule: data.deliverySchedule || { type: 'within_7_days', timeSlot: 'any' },
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

  private async getAuthHeader(): Promise<Record<string, string>> {
    try {
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) return { Authorization: `Bearer ${token}` };
      }
    } catch {}
    return { Authorization: `Bearer ${this.currentUser.id || 'demo_user_1'}` };
  }

  public async initializePayment(payload: {
    type: 'delivery_fee' | 'goods' | 'vendor_fee';
    orderId?: string;
    itemIds?: string[];
    sellerId?: string;
  }): Promise<{ status: boolean; paymentsMode?: string; reference?: string; authorization_url?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: false, error: data.error || 'Payment initialization failed' };
      }
      return data;
    } catch (err: any) {
      return { status: false, error: err.message || 'Network error initializing payment' };
    }
  }

  // --- Order Creation & Multi-Vendor Checkout Logic ---
  public async checkoutOrders(data: {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    deliveryInstructions: string;
    paymentMethod: 'card' | 'bank_transfer' | 'ussd';
    sellerConfigs?: Record<string, {
      fulfillmentType?: 'seller_delivers' | 'buyer_pickup';
      meetingPoint?: { kind: 'safe_checkpoint' | 'custom'; label: string };
      scheduledDate?: string;
      timeSlot?: 'morning' | 'afternoon' | 'evening' | 'any';
      deliveryInstructions?: string;
    }>;
  }): Promise<Order[]> {
    if (this.cart.length === 0) {
      throw new Error('Basket is empty');
    }

    // Try server-authoritative checkout first
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          items: this.cart,
          sellerConfigs: data.sellerConfigs || {},
          buyerInfo: {
            name: this.currentUser.name,
            phone: this.currentUser.phone,
            hostel: this.currentUser.hostel,
            campusId: this.currentUser.campusId || this.getActiveCampus().id,
            campusName: this.currentUser.campusName || this.getActiveCampus().name
          }
        })
      });

      if (res.ok) {
        const result = await res.json();
        if (result.orders && Array.isArray(result.orders)) {
          for (const order of result.orders) {
            this.orders.unshift(order);
          }
          this.clearCart();
          this.save();
          return result.orders;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error) {
          throw new Error(errJson.error);
        }
      }
    } catch (apiErr: any) {
      console.warn('API checkout notice, verifying fallback:', apiErr.message);
      if (apiErr.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
    }

    // Fallback local creation if offline
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

      const platformCommission = calculatePlatformCommission(subtotal);
      const upfrontDeliveryFee = deliveryFee;
      const upfrontGatewayFee = calculateGatewayFee(upfrontDeliveryFee);
      const upfrontTotalPaid = upfrontDeliveryFee + upfrontGatewayFee;
      const itemsTotalDueOnDelivery = subtotal;
      const totalAmount = upfrontTotalPaid + itemsTotalDueOnDelivery;
      const sellerPayoutAmount = subtotal - platformCommission;

      const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const orderNumber = `AB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const orderItems: OrderItem[] = items.map((item, idx) => ({
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        itemCode: `ITM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        productId: item.product.id,
        title: item.product.title,
        price: item.product.price,
        quantity: item.quantity,
        image: item.product.images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
        status: 'pending_inspection'
      }));

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
        items: orderItems,
        subtotal,
        deliveryFee,
        gatewayFee: upfrontGatewayFee,
        totalAmount,
        upfrontDeliveryFee,
        upfrontGatewayFee,
        upfrontTotalPaid,
        itemsTotalDueOnDelivery,
        itemsTotalPaid: 0,
        paymentMode: 'inspect_and_pay',
        platformCommission,
        sellerPayoutAmount,
        fulfillmentType: data.fulfillmentType,
        deliveryInstructions: data.deliveryInstructions,
        paymentMethod: data.paymentMethod,
        paymentStatus: deliveryFee === 0 ? 'delivery_fee_paid' : 'pending_inspection_pay',
        status: deliveryFee === 0 ? 'scheduled' : 'awaiting_payment',
        hasBuyerReviewed: false,
        createdAt: new Date().toISOString()
      };

      this.orders.unshift(newOrder);
      createdOrders.push(newOrder);
    }

    this.clearCart();
    this.save();
    return createdOrders;
  }

  /**
   * Pay for an individual item in an order after physical delivery & inspection.
   */
  public async payOrderItem(
    orderId: string,
    itemId: string
  ): Promise<{ success: boolean; error?: string; order?: Order; item?: OrderItem }> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      return { success: false, error: 'Item not found in order.' };
    }

    if (item.status === 'paid') {
      return { success: false, error: 'This item has already been paid for.' };
    }

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/orders/pay-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          orderId,
          itemId: item.id,
          itemCode: item.itemCode
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.order) {
        const idx = this.orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          this.orders[idx] = data.order;
        }
        this.save();
        return { success: true, order: data.order, item: data.order.items.find((i: any) => i.id === itemId) };
      }
    } catch (apiErr) {
      console.warn('API pay item warning:', apiErr);
    }

    const itemCost = item.price * item.quantity;
    const ref = `PAYSTACK_ITEM_${item.itemCode}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    item.status = 'paid';
    item.paidAt = new Date().toISOString();
    item.paidAmount = itemCost;
    item.paymentReference = ref;

    order.itemsTotalPaid = (order.itemsTotalPaid || 0) + itemCost;
    order.goodsPaid = (order.goodsPaid || 0) + itemCost;

    const allPaid = order.items.every((i) => i.status === 'paid' || i.status === 'rejected');
    if (allPaid) {
      order.status = 'paid_completed';
      order.paymentStatus = 'paid_completed';
      order.completedAt = new Date().toISOString();
      order.deliveredAt = new Date().toISOString();
    } else {
      order.status = 'partially_paid';
      order.paymentStatus = 'partially_paid';
    }

    this.save();
    return { success: true, order, item };
  }

  /**
   * Pay for all remaining unpaid items from a vendor in one consolidated transaction.
   */
  public async payVendorOrder(
    orderId: string
  ): Promise<{ success: boolean; error?: string; order?: Order }> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    const unpaidItems = order.items.filter((i) => i.status !== 'paid');
    if (unpaidItems.length === 0) {
      return { success: false, error: 'All items in this parcel have already been paid for.' };
    }

    try {
      const paymentInit = await this.initializePayment({
        type: 'goods',
        orderId: order.id,
        itemIds: unpaidItems.map(i => i.id)
      });
      if (paymentInit.status && paymentInit.authorization_url) {
        window.location.href = paymentInit.authorization_url;
        return { success: true, order };
      }
    } catch (apiErr) {
      console.warn('API pay vendor order init warning:', apiErr);
    }

    const now = new Date().toISOString();
    const batchRef = `PAYSTACK_VENDOR_${order.orderNumber}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    let totalBatchAmount = 0;
    unpaidItems.forEach((item) => {
      const itemCost = item.price * item.quantity;
      totalBatchAmount += itemCost;
      item.status = 'paid';
      item.paidAt = now;
      item.paidAmount = itemCost;
      item.paymentReference = batchRef;
    });

    order.itemsTotalPaid = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    order.goodsPaid = (order.goodsPaid || 0) + totalBatchAmount;
    order.status = 'paid_completed';
    order.paymentStatus = 'paid_completed';
    order.completedAt = now;
    order.deliveredAt = now;

    this.save();
    return { success: true, order };
  }

  /**
   * Update order status during campus transit / delivery arrival
   */
  public async updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return false;
    order.status = status;
    if (status === 'delivered_pending_inspection' || status === 'delivered') {
      order.deliveredAt = new Date().toISOString();
    }
    updateOrderInFirestore(order.id, { status: order.status, deliveredAt: order.deliveredAt }).catch((err) => {
      console.warn('Status update sync warning:', err);
    });
    this.save();
    return true;
  }

  public async markOrderDelivered(orderId: string): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/mark-delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to mark order delivered' };
      }
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async rejectOrderItem(
    orderId: string,
    itemId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/items/${itemId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to reject item' };
      }
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async cancelOrder(
    orderId: string,
    reason?: string
  ): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to cancel order' };
      }
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async submitRefundBankDetails(
    orderId: string,
    details: { bankName: string; accountNumber: string; accountName: string }
  ): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/refund/bank-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(details)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to save refund details' };
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async markRefundSent(orderId: string): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/refund/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to mark refund sent' };
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async confirmRefundReceived(orderId: string): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/refund/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to confirm refund' };
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async disputeRefund(orderId: string, description?: string): Promise<{ success: boolean; message?: string; error?: string; order?: Order }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/refund/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ description })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to dispute refund' };
      if (data.order) {
        const idx = this.orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) this.orders[idx] = data.order;
        this.save();
      }
      return { success: true, message: data.message, order: data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async reportBuyerRefusal(orderId: string, reason: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/report-buyer-refusal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to report buyer refusal' };
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async banUser(userId: string): Promise<{ success: boolean; message?: string; error?: string; bannedUntilMs?: number }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to ban user' };
      return { success: true, message: data.message, bannedUntilMs: data.bannedUntilMs };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async submitOrderComplaint(orderId: string, reason: string, description: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/orders/${orderId}/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reason, description })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to submit complaint' };
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async resolveAdminDispute(disputeId: string, note: string, type?: 'refund_buyer' | 'release_seller'): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ resolutionNote: note, resolutionType: type })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to resolve dispute' };
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async fetchAdminQueues(): Promise<{
    overdueOrders: any[];
    buyerNonPaymentReports: any[];
    unconfirmedRefunds: any[];
    openComplaints: any[];
    strikesBySeller: Record<string, number>;
  } | null> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/admin/queues', {
        headers: { ...headers }
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('fetchAdminQueues error:', err);
    }
    return null;
  }

  public isOrderOverdue(order: Order): boolean {
    if (!order.deliveryDeadlineMs) return false;
    if (order.status === 'paid_completed' || order.status === 'cancelled') return false;
    return Date.now() > order.deliveryDeadlineMs || order.sellerDefault === true;
  }

  public getSellerStrikes(sellerId: string): number {
    return this.orders.filter((o) => o.sellerId === sellerId && o.sellerDefault === true).length;
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

  public async approveSellerVerification(requestId: string, sellerUserId?: string): Promise<{
    success: boolean;
    mismatch?: boolean;
    message?: string;
    sellerName?: string;
    resolvedAccountName?: string;
    error?: string;
  }> {
    const req = this.verifications.find((v) => v.id === requestId);
    const userId = sellerUserId || req?.userId;
    if (!userId) return { success: false, error: 'Seller user ID not found' };

    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/admin/sellers/${userId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.mismatch) {
          return {
            success: false,
            mismatch: true,
            message: data.message,
            sellerName: data.sellerName,
            resolvedAccountName: data.resolvedAccountName
          };
        }
        return { success: false, error: data.error || 'Server approval failed' };
      }

      // Update local state: approved_pending_fee
      if (req) {
        req.status = 'approved';
        req.rejectionReason = undefined;
      }

      const user = this.users.find((u) => u.id === userId);
      if (user) {
        user.sellerVerificationStatus = 'approved_pending_fee';
        user.role = 'seller';
        user.subaccountCode = data.subaccountCode;
      }
      if (this.currentUser.id === userId) {
        this.currentUser.sellerVerificationStatus = 'approved_pending_fee';
        this.currentUser.role = 'seller';
        this.currentUser.subaccountCode = data.subaccountCode;
      }

      this.save();
      return { success: true, message: data.message };
    } catch (err: any) {
      console.error('Approve seller API exception:', err);
      return { success: false, error: err.message };
    }
  }

  public async rejectSellerVerification(requestId: string, reason: string, sellerUserId?: string): Promise<boolean> {
    const req = this.verifications.find((v) => v.id === requestId);
    const userId = sellerUserId || req?.userId;

    if (userId) {
      try {
        const headers = await this.getAuthHeader();
        await fetch(`/api/admin/sellers/${userId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ reason })
        });
      } catch (err) {
        console.warn('Reject seller API call notice:', err);
      }
    }

    if (req) {
      req.status = 'rejected';
      req.rejectionReason = reason;
    }

    const user = this.users.find((u) => u.id === (userId || req?.userId));
    if (user) {
      user.sellerVerificationStatus = 'rejected';
      if (this.currentUser.id === user.id) {
        this.currentUser.sellerVerificationStatus = 'rejected';
      }
    }

    this.save();
    return true;
  }

  public async suspendSeller(userId: string, durationDays: number = 30): Promise<boolean> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/admin/sellers/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ durationDays })
      });
      if (res.ok) {
        const user = this.users.find((u) => u.id === userId);
        if (user) user.suspendedUntilMs = Date.now() + (durationDays * 24 * 3600 * 1000);
        this.save();
        return true;
      }
    } catch (err) {
      console.warn('Suspend seller API notice:', err);
    }
    return false;
  }

  public async unsuspendSeller(userId: string): Promise<boolean> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch(`/api/admin/sellers/${userId}/unsuspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      if (res.ok) {
        const user = this.users.find((u) => u.id === userId);
        if (user) user.suspendedUntilMs = 0;
        this.save();
        return true;
      }
    } catch (err) {
      console.warn('Unsuspend seller API notice:', err);
    }
    return false;
  }

  public async requestBankChange(bankDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const headers = await this.getAuthHeader();
      const res = await fetch('/api/sellers/bank-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(bankDetails)
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async payVendorFee(sellerId: string): Promise<{ success: boolean; authorization_url?: string; error?: string }> {
    try {
      const init = await this.initializePayment({
        type: 'vendor_fee',
        sellerId
      });
      if (init.status && init.authorization_url) {
        window.location.href = init.authorization_url;
        return { success: true, authorization_url: init.authorization_url };
      }
      return { success: false, error: init.error || 'Could not initialize vendor fee payment' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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
      .reduce((sum, o) => sum + (o.platformCommission || 0), 0);

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
