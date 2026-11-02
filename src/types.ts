export type Role = 'student' | 'seller' | 'admin';

export type ProductCondition = 'new' | 'used_like_new' | 'used_good';

export type ProductStatus = 'pending_review' | 'approved' | 'rejected';

export type DeliveryOption = 'seller_delivers' | 'buyer_pickup' | 'both';

export type OrderStatus =
  | 'delivery_fee_paid'
  | 'in_transit'
  | 'delivered_pending_inspection'
  | 'partially_paid'
  | 'paid_completed'
  | 'paid_awaiting_delivery'
  | 'delivered'
  | 'disputed'
  | 'cancelled';

export type PaymentStatus =
  | 'delivery_fee_paid'
  | 'pending_inspection_pay'
  | 'partially_paid'
  | 'paid_completed'
  | 'escrow_held'
  | 'payout_released'
  | 'refunded';

export type DisputeStatus = 'open' | 'resolved_refund' | 'resolved_payout';

export interface Campus {
  id: string;
  name: string;
  shortName: string;
  state: string;
  hostels: string[];
  safeMeetupPoints: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subtitle: string;
  icon: string;
  imageUrl?: string;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  sellerName: string;
  orderId?: string;
  buyerId: string;
  buyerName: string;
  campusName: string;
  rating: number; // 1 to 5
  comment: string;
  createdAt: string;
  verifiedPurchase: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  campusId: string;
  campusName: string;
  hostel: string;
  isVerifiedSeller?: boolean;
  sellerVerificationStatus?: 'not_applied' | 'pending' | 'verified' | 'rejected';
  storeName?: string;
  bio?: string;
  studentIdCardUrl?: string;
  matricNumber?: string;
  facultyDepartment?: string;
  level?: string;
  bankDetails?: {
    bankName: string;
    accountNumberMasked: string;
    accountName: string;
  };
  rating?: number;
  reviewsCount?: number;
  salesCount?: number;
}

export interface Product {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerVerified: boolean;
  sellerRating?: number;
  sellerReviewCount?: number;
  campusId: string;
  campusName: string;
  title: string;
  description: string;
  price: number; // in Naira (₦)
  category: string;
  condition: ProductCondition;
  images: string[];
  stock: number;
  deliveryOption: DeliveryOption;
  deliveryFee: number; // in Naira (₦)
  pickupLandmark: string;
  status: ProductStatus;
  rejectionReason?: string;
  createdAt: string;
  brand?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id: string;
  itemCode: string; // e.g. "ITM-9A4B"
  productId: string;
  title: string;
  price: number;
  quantity: number;
  image: string;
  status: 'pending_inspection' | 'paid' | 'rejected';
  paidAt?: string;
  paidAmount?: number;
  paymentReference?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  buyerHostel: string;
  sellerId: string;
  sellerName: string;
  campusId: string;
  campusName: string;
  items: OrderItem[];
  subtotal: number; // Sum of items (P)
  deliveryFee: number; // Upfront delivery transport fee (D)
  gatewayFee: number; // Transaction fee paid at checkout
  totalAmount: number; // Total floor value of everything (P + D + G)
  upfrontDeliveryFee: number; // Small commitment fee paid upfront
  upfrontGatewayFee: number;
  upfrontTotalPaid: number; // What the student paid right now at checkout
  itemsTotalDueOnDelivery: number; // What the student owes upon physical inspection
  itemsTotalPaid: number; // What has been paid so far at handoff
  paymentMode: 'inspect_and_pay' | 'escrow';
  platformCommission: number;
  sellerPayoutAmount: number;
  fulfillmentType: 'seller_delivers' | 'buyer_pickup';
  deliveryInstructions: string;
  paymentMethod: 'card' | 'bank_transfer' | 'ussd';
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  otpHash?: string;
  otpSalt?: string;
  otpExpiresAt?: number;
  otpFailedAttempts?: number;
  deliveryOtpForBuyer?: string;
  hasBuyerReviewed?: boolean;
  createdAt: string;
  deliveredAt?: string;
  completedAt?: string;
}

export interface Complaint {
  id: string;
  orderId: string;
  orderNumber: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolutionNote?: string;
  createdAt: string;
}

export interface PayoutRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  bankName: string;
  accountNumberMasked: string;
  amount: number;
  commissionDeducted: number;
  status: 'queued' | 'confirmed' | 'failed';
  idempotencyKey: string;
  reference: string;
  initiatedAt: string;
  confirmedAt?: string;
}

export interface SellerVerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  phone: string;
  campusId: string;
  campusName: string;
  matricNumber: string;
  facultyDepartment?: string;
  level?: string;
  hostelShopLocation?: string;
  idDocumentType?: string;
  idCardPhotoUrl: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  categoriesToSell?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedAt: string;
}

export interface PlatformMetrics {
  totalGmv: number;
  platformCommissionCollected: number;
  pendingEscrowAmount: number;
  totalOrders: number;
  pendingListingsCount: number;
  activeListingsCount: number;
  verifiedSellersCount: number;
}
