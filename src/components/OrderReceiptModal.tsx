import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  CheckCircle2, 
  Phone, 
  Truck, 
  Flag, 
  Download, 
  Check, 
  Star, 
  CreditCard, 
  Loader2 
} from 'lucide-react';
import { Order, OrderItem } from '../types';
import { formatNaira, formatDate } from '../utils/currency';
import { store } from '../services/store';

interface OrderReceiptModalProps {
  order: Order | null;
  onClose: () => void;
  onOpenDispute: (order: Order) => void;
  onRateSeller?: (order: Order) => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  order: initialOrder,
  onClose,
  onOpenDispute,
  onRateSeller,
}) => {
  const [downloaded, setDownloaded] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [isPayingVendor, setIsPayingVendor] = useState(false);
  const [payingItemId, setPayingItemId] = useState<string | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);

  if (!initialOrder) return null;

  // Read latest state from store in case an item was just paid
  const order = store.getOrderById(initialOrder.id) || initialOrder;

  const isCompleted = order.status === 'paid_completed' || order.status === 'delivered';
  const isPartiallyPaid = order.status === 'partially_paid';

  // Calculate unpaid items
  const unpaidItems = order.items.filter((i) => i.status !== 'paid');
  const unpaidTotal = unpaidItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handlePayIndividualItem = async (item: OrderItem) => {
    setPayingItemId(item.id);
    setPaymentFeedback(null);
    try {
      await new Promise((r) => setTimeout(r, 900));

      const result = await store.payOrderItem(order.id, item.id);
      if (result.success) {
        setPaymentFeedback(`Payment for ${item.title} confirmed · ${formatNaira(item.price * item.quantity)} received via Paystack.`);
      } else {
        setPaymentFeedback(result.error || 'Payment failed.');
      }
    } catch (err: any) {
      setPaymentFeedback('Payment processing error. Please try again.');
    } finally {
      setPayingItemId(null);
    }
  };

  const handlePayVendorTotal = async () => {
    setIsPayingVendor(true);
    setPaymentFeedback(null);
    try {
      await new Promise((r) => setTimeout(r, 1000));

      const result = await store.payVendorOrder(order.id);
      if (result.success) {
        setPaymentFeedback(`Payment for order #${order.orderNumber} confirmed · ${formatNaira(unpaidTotal)} received via Paystack.`);
      } else {
        setPaymentFeedback(result.error || 'Payment failed.');
      }
    } catch (err: any) {
      setPaymentFeedback('Payment processing error. Please try again.');
    } finally {
      setIsPayingVendor(false);
    }
  };

  const handleDownloadReceipt = () => {
    const receiptContent = `===========================================
ABBASON HUB — OFFICIAL CAMPUS RECEIPT
"Inspect First · Pay On Delivery"
===========================================
ORDER NUMBER: ${order.orderNumber}
TRANSACTION DATE: ${new Date(order.createdAt).toLocaleString('en-NG')}
CAMPUS: ${order.campusName}
PAYMENT STATUS: ${order.paymentStatus.toUpperCase()}

BUYER DETAILS:
Name: ${order.buyerName}
Phone: ${order.buyerPhone}
Delivery Destination: ${order.deliveryInstructions}

SELLER DETAILS:
Vendor / Store: ${order.sellerName}

ITEMIZED TRACKING CODES & STATUS:
${order.items.map((i) => `• [${i.itemCode}] ${i.title} (x${i.quantity}) — ₦${(i.price * i.quantity).toLocaleString()} [Status: ${i.status.toUpperCase()}]`).join('\n')}

FINANCIAL BREAKDOWN:
Upfront Transport Fee Paid: ₦${(order.upfrontTotalPaid || order.deliveryFee).toLocaleString()}
Items Total Due Upon Delivery: ₦${order.subtotal.toLocaleString()}
Items Paid So Far: ₦${(order.itemsTotalPaid || 0).toLocaleString()}
Floor Total: ₦${order.totalAmount.toLocaleString()}

Need help? Contact: support@abbasonhub.com
===========================================`;

    const blob = new Blob([receiptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Abbason_Receipt_${order.orderNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-3xl bg-[#090D14] border border-white/[0.12] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-400' : 'bg-[#C8A96A] animate-pulse'}`} />
            <h3 className="text-sm font-medium text-white font-serif">
              Order #{order.orderNumber}
            </h3>
            <span className="text-[11px] text-[#8C9399]">· {order.sellerName}</span>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[#8C9399] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {paymentFeedback && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{paymentFeedback}</span>
            </div>
            <button 
              onClick={() => setPaymentFeedback(null)} 
              className="text-emerald-400 hover:text-white text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4 text-xs">
          {/* Quick Pay Bar (if unpaid items remain) */}
          {!isCompleted && unpaidTotal > 0 && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-[#C8A96A]/30 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Pay on Inspection</div>
                <div className="text-lg font-mono text-[#C8A96A] font-semibold">{formatNaira(unpaidTotal)}</div>
              </div>

              <button
                type="button"
                onClick={handlePayVendorTotal}
                disabled={isPayingVendor}
                className="px-4 py-2 rounded-xl bg-[#C8A96A] hover:bg-[#d8bb7d] text-[#020406] font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isPayingVendor ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Pay All via Paystack</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Simple Items List */}
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
              Items in Delivery
            </div>

            {order.items.map((item) => {
              const isItemPaid = item.status === 'paid';
              const isProcessingThis = payingItemId === item.id;
              const itemTotal = item.price * item.quantity;

              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={item.image} 
                      alt="" 
                      className="w-10 h-10 rounded-xl object-cover bg-slate-800 shrink-0" 
                    />
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate text-xs">{item.title}</div>
                      <div className="text-[11px] text-slate-400">
                        Qty: {item.quantity} · {formatNaira(itemTotal)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-[#020406] border border-[#C8A96A]/30 text-[#C8A96A] font-mono text-[10px]">
                          {item.itemCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(item.itemCode, item.id)}
                          className="text-[#8C9399] hover:text-[#C8A96A] text-[10px] flex items-center gap-0.5 cursor-pointer"
                        >
                          {copiedCodeId === item.id ? (
                            <span className="text-emerald-400">Copied</span>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {isItemPaid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                        <Check className="w-3 h-3" />
                        <span>Paid</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePayIndividualItem(item)}
                        disabled={isProcessingThis || isPayingVendor}
                        className="px-3 py-1.5 rounded-lg bg-[#C8A96A]/20 hover:bg-[#C8A96A]/30 border border-[#C8A96A]/40 text-[#C8A96A] text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {isProcessingThis ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CreditCard className="w-3 h-3" />
                        )}
                        <span>Pay</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Destination & Seller Info */}
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Truck className="w-4 h-4 text-[#C8A96A] shrink-0" />
              <div className="truncate">
                <div className="text-[10px] text-slate-400">Drop-Off Location</div>
                <div className="text-white truncate max-w-[200px]">{order.deliveryInstructions || order.buyerHostel}</div>
              </div>
            </div>

            <a
              href="tel:+2348034129081"
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#C8A96A] text-[11px] flex items-center gap-1 transition-colors"
            >
              <Phone className="w-3 h-3" />
              <span>Call Seller</span>
            </a>
          </div>

          {/* Simple Totals */}
          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Transport fee (Paid)</span>
              <span className="text-slate-200 font-mono">{formatNaira(order.upfrontTotalPaid || order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between">
              <span>Goods settled so far</span>
              <span className="text-emerald-400 font-mono">{formatNaira(order.itemsTotalPaid || 0)}</span>
            </div>
            <div className="border-t border-white/[0.06] pt-1.5 flex justify-between text-white font-medium">
              <span>Order Total</span>
              <span className="text-[#C8A96A] font-mono">{formatNaira(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/[0.08] flex items-center gap-2 bg-white/[0.01]">
          <button
            type="button"
            onClick={handleDownloadReceipt}
            className="py-2.5 px-3 rounded-xl border border-white/[0.12] hover:border-[#C8A96A] text-slate-300 hover:text-[#C8A96A] text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
            <span>Receipt</span>
          </button>

          {!isCompleted && (
            <button
              onClick={() => {
                onClose();
                onOpenDispute(order);
              }}
              className="py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-rose-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report Issue</span>
            </button>
          )}

          {isCompleted && onRateSeller && (
            <button
              onClick={() => {
                onClose();
                onRateSeller(order);
              }}
              className="py-2.5 px-3 rounded-xl bg-[#C8A96A] text-[#020406] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>{order.hasBuyerReviewed ? 'Review' : 'Rate Seller'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs text-center transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
