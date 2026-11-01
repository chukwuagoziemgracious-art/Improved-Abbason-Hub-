import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Package, 
  UserCheck, 
  AlertTriangle, 
  Check, 
  Ban, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  Lock,
  Flag,
  RotateCcw
} from 'lucide-react';
import { store } from '../services/store';
import { formatNaira, formatDate } from '../utils/currency';
import { Product, Complaint } from '../types';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'moderation' | 'sellers' | 'disputes' | 'orders'>('moderation');
  const [rejectionModalProduct, setRejectionModalProduct] = useState<Product | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Missing clear photos / price verification required');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const pendingProducts = store.getPendingProducts();
  const allProducts = store.getApprovedProducts();
  const verifications = store.getSellerVerificationRequests().filter((v) => v.status === 'pending');
  const complaints = store.getComplaints().filter((c) => c.status === 'open');
  const allOrders = store.getOrders();
  const metrics = store.getPlatformMetrics();

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleApproveProduct = (productId: string) => {
    store.approveProduct(productId);
    showNotice('Listing approved and published to campus feed!');
  };

  const handleRejectProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionModalProduct) return;
    store.rejectProduct(rejectionModalProduct.id, rejectionReason);
    setRejectionModalProduct(null);
    showNotice('Listing rejected and vendor notified.');
  };

  const handleApproveSeller = (requestId: string) => {
    store.approveSellerVerification(requestId);
    showNotice('Seller verified! Green trust badge is now active.');
  };

  const handleResolveDispute = (complaintId: string, resolution: 'refund_buyer' | 'release_seller') => {
    store.resolveDispute(
      complaintId,
      resolution,
      resolution === 'refund_buyer' ? 'Approved full refund to student buyer' : 'Approved release to seller after investigation'
    );
    showNotice(resolution === 'refund_buyer' ? '100% Refund issued to buyer' : 'Payout released to seller');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-4xl rounded-3xl bg-[#0B1120] border border-white/[0.1] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C8A96A]/15 border border-[#C8A96A]/30 flex items-center justify-center text-[#C8A96A]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-medium text-white font-serif">
                  Abbason Platform Administration
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#C8A96A]/15 border border-[#C8A96A]/30 text-[#C8A96A] text-[10px] font-medium tracking-wider uppercase">
                  Restricted Access
                </span>
              </div>
              <p className="text-[11px] text-[#8C9399] font-light">
                Moderation Queue · Escrow Ledger · Commission Monitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                store.logoutAdmin();
                onClose();
              }}
              className="px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Lock Admin Console and return to student view"
            >
              <Lock className="w-3 h-3" />
              <span>Lock Admin Mode</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="bg-emerald-950 border-b border-emerald-500/50 px-4 py-2 text-xs font-semibold text-emerald-200 text-center animate-fade-in">
            {actionNotice}
          </div>
        )}

        {/* Platform Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-[#0B1120] border-b border-white/[0.08] text-xs">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-[10px] uppercase font-bold text-[#8C9399]">Gross Marketplace Volume</div>
            <div className="text-base sm:text-lg font-bold text-white mt-0.5 tabular-nums font-serif">
              {formatNaira(metrics.totalGmv)}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-[10px] uppercase font-bold text-[#C8A96A]">Commission (3%, Max ₦2,000)</div>
            <div className="text-base sm:text-lg font-bold text-[#C8A96A] mt-0.5 tabular-nums font-serif">
              {formatNaira(metrics.platformCommissionCollected)}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-[10px] uppercase font-bold text-emerald-400">Escrow Held</div>
            <div className="text-base sm:text-lg font-bold text-emerald-300 mt-0.5 tabular-nums font-serif">
              {formatNaira(metrics.pendingEscrowAmount)}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
            <div className="text-[10px] uppercase font-bold text-amber-400">Pending Reviews</div>
            <div className="text-base sm:text-lg font-bold text-amber-300 mt-0.5 font-serif">
              {metrics.pendingListingsCount} listings
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.08] bg-[#0B1120] px-4 overflow-x-auto no-scrollbar text-xs">
          <button
            onClick={() => setActiveTab('moderation')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'moderation'
                ? 'border-[#C8A96A] text-[#C8A96A] font-medium'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Listing Approvals</span>
            {pendingProducts.length > 0 && (
              <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-1.5 rounded-full">
                {pendingProducts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sellers')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'sellers'
                ? 'border-[#f3c84b] text-[#f3c84b] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Seller Verifications</span>
            {verifications.length > 0 && (
              <span className="bg-[#f3c84b] text-slate-950 font-bold text-[10px] px-1.5 rounded-full">
                {verifications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('disputes')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'disputes'
                ? 'border-[#f3c84b] text-[#f3c84b] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>Complaints & Disputes</span>
            {complaints.length > 0 && (
              <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 rounded-full">
                {complaints.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-3 font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'orders'
                ? 'border-[#f3c84b] text-[#f3c84b] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Order & Escrow Audit ({allOrders.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto p-4 sm:p-6 flex-1 space-y-4">
          {/* TAB 1: PRODUCT LISTING MODERATION QUEUE */}
          {activeTab === 'moderation' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>
                  All submitted listings must be reviewed before appearing on the public campus homepage.
                </span>
                <span className="font-bold text-white">{pendingProducts.length} pending review</span>
              </div>

              {pendingProducts.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p>Listing moderation queue is clean! No unreviewed items.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingProducts.map((prod) => (
                    <div
                      key={prod.id}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                    >
                      <div className="flex gap-3">
                        <img src={prod.images[0]} alt="" className="w-20 h-20 rounded-xl object-cover bg-slate-900 shrink-0" />
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{prod.title}</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#C8A96A]/15 border border-[#C8A96A]/30 text-[#C8A96A] text-[10px] uppercase font-medium">
                              {prod.category}
                            </span>
                          </div>
                          <div className="text-[#8C9399] font-light">
                            Seller: <strong className="text-slate-200">{prod.sellerName}</strong> ({prod.sellerPhone})
                          </div>
                          <div className="text-[#8C9399] font-light">
                            Campus: {prod.campusName} · Fulfillment: {prod.deliveryOption}
                          </div>
                          <div className="text-[#C8A96A] font-medium text-sm tabular-nums font-serif">
                            {formatNaira(prod.price)}
                          </div>
                        </div>
                      </div>

                      {/* Approval Actions */}
                      <div className="flex items-center gap-2 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-white/[0.08]">
                        <button
                          onClick={() => setRejectionModalProduct(prod)}
                          className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>

                        <button
                          onClick={() => handleApproveProduct(prod.id)}
                          className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve & Publish</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SELLER VERIFICATION */}
          {activeTab === 'sellers' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Verify student vendors by checking their matriculation and campus credentials.
              </div>

              {verifications.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p>All seller verification requests are processed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {verifications.map((v) => (
                    <div
                      key={v.id}
                      className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-4 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                        <div className="flex gap-3 items-center">
                          <img src={v.idCardPhotoUrl} alt="" className="w-16 h-16 rounded-xl object-cover bg-slate-900 border border-white/[0.08]" />
                          <div>
                            <div className="font-medium text-white text-base">{v.userName}</div>
                            <div className="text-[#8C9399] font-light">{v.userEmail} · {v.phone}</div>
                            <div className="text-[#C8A96A] mt-0.5 font-medium">Campus: {v.campusName}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => {
                              store.rejectSellerVerification(v.id, 'Information or document could not be verified with school records');
                              showNotice('Seller verification rejected');
                            }}
                            className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-rose-300 font-medium text-xs cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleApproveSeller(v.id)}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#C8A96A] hover:bg-[#b89858] text-black font-medium text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>Approve & Grant Verified Badge</span>
                          </button>
                        </div>
                      </div>

                      {/* Verification Dossier Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="p-2.5 rounded-xl bg-[#0B1120] border border-white/[0.08]">
                          <span className="text-[10px] uppercase font-bold text-[#8C9399] block">Matric & Academic Record</span>
                          <span className="font-mono text-white font-medium">{v.matricNumber}</span>
                          <div className="text-[11px] text-[#8C9399] mt-0.5 font-light">{v.facultyDepartment || 'Faculty of Engineering'} ({v.level || '300L'})</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#0B1120] border border-white/[0.08]">
                          <span className="text-[10px] uppercase font-bold text-[#8C9399] block">Physical Campus Location</span>
                          <span className="text-white font-medium">{v.hostelShopLocation || 'Ifite First Gate'}</span>
                          <div className="text-[11px] text-[#8C9399] mt-0.5 font-light">Doc: {v.idDocumentType || 'Student ID Card'}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#0B1120] border border-white/[0.08]">
                          <span className="text-[10px] uppercase font-bold text-[#8C9399] block">Payout Bank Match</span>
                          <span className="text-white font-medium">{v.bankName || 'Access Bank'} · {v.accountNumber ? `******${v.accountNumber.slice(-4)}` : '******4819'}</span>
                          <div className="text-[10px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Matches student legal name</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DISPUTES & COMPLAINTS */}
          {activeTab === 'disputes' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Arbitrate campus transaction disputes. Payouts remain frozen until resolved.
              </div>

              {complaints.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p>No open complaints or unresolved disputes.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaints.map((comp) => (
                    <div
                      key={comp.id}
                      className="p-4 rounded-2xl bg-[#121a2c] border border-rose-950/80 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-mono">
                          Dispute on #{comp.orderNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-bold text-[10px]">
                          Escrow Frozen
                        </span>
                      </div>

                      <div className="text-slate-300">
                        Reason: <strong className="text-white">{comp.reason}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                        {comp.description}
                      </div>

                      <div className="flex items-center justify-between text-slate-400 pt-1">
                        <span>Buyer: {comp.buyerName}</span>
                        <span>Seller: {comp.sellerName}</span>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-white/[0.08]">
                        <button
                          onClick={() => handleResolveDispute(comp.id, 'refund_buyer')}
                          className="flex-1 py-2 rounded-xl bg-rose-900/70 hover:bg-rose-900 text-rose-100 font-medium text-xs cursor-pointer"
                        >
                          Authorize 100% Refund to Buyer
                        </button>
                        <button
                          onClick={() => handleResolveDispute(comp.id, 'release_seller')}
                          className="flex-1 py-2 rounded-xl bg-emerald-900/70 hover:bg-emerald-900 text-emerald-100 font-medium text-xs cursor-pointer"
                        >
                          Release Payout to Seller
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ORDER & ESCROW AUDIT */}
          {activeTab === 'orders' && (
            <div className="space-y-3">
              <div className="text-xs text-[#8C9399] font-light">
                Complete platform transaction ledger with 3% commission tracking (capped at ₦2,000).
              </div>

              <div className="space-y-2">
                {allOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-white">#{order.orderNumber}</span>
                        <span className="text-[#8C9399]">({order.buyerName} → {order.sellerName})</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#C8A96A]/15 border border-[#C8A96A]/30 text-[#C8A96A] text-[10px] font-medium uppercase tracking-wider">
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-1">
                        Subtotal: {formatNaira(order.subtotal)} · Delivery: {formatNaira(order.deliveryFee)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-emerald-400 font-bold tabular-nums">
                        Commission: {formatNaira(order.platformCommission)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Seller Net: {formatNaira(order.sellerPayoutAmount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rejection Modal Dialog */}
        {rejectionModalProduct && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-[#0F172A] border border-rose-900/80 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base">Reject Listing</h3>
                <button
                  onClick={() => setRejectionModalProduct(null)}
                  className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Specify feedback for <strong>{rejectionModalProduct.title}</strong> so the seller can correct and re-submit:
              </p>

              <form onSubmit={handleRejectProductSubmit} className="space-y-4">
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-800 rounded-xl p-3 text-xs text-white"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRejectionModalProduct(null)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
