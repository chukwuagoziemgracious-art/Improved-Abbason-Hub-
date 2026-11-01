import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  Phone, 
  Clock, 
  Truck, 
  MapPin,
  Flag,
  Download,
  Check,
  Star
} from 'lucide-react';
import { Order } from '../types';
import { formatNaira, formatDate } from '../utils/currency';
import { store } from '../services/store';

interface OrderReceiptModalProps {
  order: Order | null;
  onClose: () => void;
  onOpenDispute: (order: Order) => void;
  onRateSeller?: (order: Order) => void;
}

export const OrderReceiptModal: React.FC<OrderReceiptModalProps> = ({
  order,
  onClose,
  onOpenDispute,
  onRateSeller,
}) => {
  const [copiedOtp, setCopiedOtp] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  if (!order) return null;

  const isDelivered = order.status === 'delivered';
  const buyerOtp = (order && store.getBuyerOtp(order.id)) || order?.deliveryOtpForBuyer;

  const handleCopyCode = () => {
    if (buyerOtp) {
      navigator.clipboard.writeText(buyerOtp);
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2500);
    }
  };

  const handleDownloadReceipt = () => {
    const receiptContent = `===========================================
ABBASON HUB — OFFICIAL CAMPUS RECEIPT
"Everything you imagined."
===========================================
ORDER NUMBER: ${order.orderNumber}
TRANSACTION DATE: ${new Date(order.createdAt).toLocaleString('en-NG')}
CAMPUS: ${order.campusName}
PAYMENT STATUS: CONFIRMED & SECURED IN PAYLUK ESCROW

-------------------------------------------
YOUR SECRET DELIVERY CONFIRMATION CODE:
>>>  ${buyerOtp || '••••••'}  <<<
-------------------------------------------
SECURITY INSTRUCTION:
Do NOT share this code with the seller beforehand!
Only provide this code in person after you physically 
receive, inspect, and confirm your order is in good condition.

BUYER DETAILS:
Name: ${order.buyerName}
Phone: ${order.buyerPhone}
Delivery Destination: ${order.deliveryInstructions}

SELLER DETAILS:
Vendor / Store: ${order.sellerName}
Contact Phone: +234 803 412 9081

PURCHASED ITEMS:
${order.items.map((i) => `• ${i.title} (x${i.quantity}) — ₦${(i.price * i.quantity).toLocaleString()}`).join('\n')}

FINANCIAL BREAKDOWN:
Subtotal: ₦${order.subtotal.toLocaleString()}
Delivery Fee: ₦${order.deliveryFee.toLocaleString()}
Payment Processing Fee: ₦${order.gatewayFee.toLocaleString()}
TOTAL PAID: ₦${order.totalAmount.toLocaleString()}
Payment Method: ${order.paymentMethod.toUpperCase()} (Online Web Payment)
Platform Escrow: Secured by Payluk Escrow Vault

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-[20px] overflow-y-auto">
      <div 
        className="relative w-full max-w-xl rounded-[6px] bg-[#020406]/95 backdrop-blur-[24px] border border-white/[0.12] shadow-[0_40px_100px_rgba(0,0,0,0.9)] overflow-hidden my-auto max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${isDelivered ? 'bg-emerald-400' : 'bg-[#C8A96A] animate-pulse'}`} />
            <span className="text-[10px] uppercase font-medium tracking-[0.2em] text-[#C8A96A]">
              {isDelivered ? 'Order Delivered & Completed' : 'Payment Confirmed & Verified'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF] flex items-center justify-center border border-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. PAYMENT CONFIRMATION MESSAGE */}
          <div className="text-center space-y-2.5 py-2">
            <div className="w-14 h-14 rounded-2xl bg-[#C8A96A] flex items-center justify-center mx-auto shadow-xl text-[#020406]">
              <CheckCircle2 className="w-8 h-8 stroke-[2]" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-light text-[#E9E6DF] font-serif tracking-wide">
              {isDelivered ? 'Delivery Complete!' : 'Payment Successful!'}
            </h2>

            <p className="text-[#8C9399] text-xs sm:text-sm max-w-md mx-auto leading-relaxed font-light">
              We received your payment of{' '}
              <strong className="text-[#C8A96A] font-normal tabular-nums font-serif">
                {formatNaira(order.totalAmount)}
              </strong>{' '}
              for Order <strong className="text-[#E9E6DF] font-mono">#{order.orderNumber}</strong>. 
              {isDelivered ? ' The order has been handed over and verified.' : ' Your funds are held securely in Payluk Escrow.'}
            </p>
          </div>

          {/* 2. THE PROMINENT 6-DIGIT DELIVERY OTP CARD */}
          <div className="rounded-3xl bg-white/[0.03] border-2 border-[#C8A96A]/80 p-5 sm:p-6 text-center shadow-[0_20px_50px_rgba(200,169,106,0.1)] relative overflow-hidden">
            <div className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-[#C8A96A] mb-1.5">
              <ShieldCheck className="w-4 h-4 text-[#C8A96A]" />
              <span>{isDelivered ? 'Handshake Verification Code Used' : 'Your One-Time Delivery Confirmation Code'}</span>
            </div>

            <p className="text-[11px] text-[#8C9399] mb-4 font-light">
              {isDelivered 
                ? `Successfully verified with ${order.sellerName}. Payout has been released.`
                : `Present this code to ${order.sellerName} only after you inspect your items in person.`}
            </p>

            {/* The Big 6-Digit Monospace Display */}
            <div className="my-3 inline-flex items-center justify-center">
              <div className="font-mono text-3xl sm:text-5xl font-light text-[#E9E6DF] tracking-[0.3em] bg-[#020406]/90 px-6 sm:px-8 py-3 rounded-[4px] border border-[#C8A96A]/60 shadow-inner select-all">
                {buyerOtp || '••••••'}
              </div>
            </div>

            {/* Quick-Save Action Row */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4 pt-4 border-t border-white/[0.08]">
              {!isDelivered && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-[4px] bg-[#C8A96A] hover:bg-[#d8bb7d] text-[#020406] font-semibold text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  {copiedOtp ? (
                    <>
                      <Check className="w-4 h-4 text-[#020406]" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy 6-Digit Code</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadReceipt}
                className="w-full sm:w-auto px-5 py-2.5 rounded-[4px] border border-white/[0.15] hover:border-[#C8A96A] text-[#E9E6DF] hover:text-[#C8A96A] font-light text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {downloaded ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Receipt Downloaded!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-[#C8A96A]" />
                    <span>Download Receipt Summary</span>
                  </>
                )}
              </button>
            </div>

            {!isDelivered && (
              <div className="mt-4 p-3.5 rounded-[4px] bg-[#0e0c08]/80 border border-[#C8A96A]/25 text-[#E9E6DF] text-xs text-left flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#C8A96A] shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed font-light text-[#8C9399]">
                  <strong className="text-[#C8A96A] font-medium tracking-wide">CAMPUS SECURITY RULE:</strong> Never send this code over WhatsApp or phone call prior to handover. When the seller meets you, inspect your order thoroughly. Once satisfied, give them the code so they can unlock their payout.
                </div>
              </div>
            )}
          </div>

          {/* 3. FULFILLMENT & SELLER COORDINATION */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300 uppercase tracking-wider text-[11px]">
                Campus Handover Instructions
              </span>
              <span className="text-[#C8A96A] font-medium flex items-center gap-1">
                {order.fulfillmentType === 'seller_delivers' ? (
                  <>
                    <Truck className="w-3.5 h-3.5" />
                    <span>Hostel Drop-off</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Campus Pickup</span>
                  </>
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0B1120] border border-white/[0.08] text-slate-300">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Your Delivery Address</div>
              <div className="text-xs text-white font-medium mt-0.5">{order.deliveryInstructions}</div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Verified Vendor</span>
                <span className="font-medium text-white">{order.sellerName}</span>
              </div>
              <a
                href="tel:+2348034129081"
                className="px-3 py-1.5 rounded-lg bg-[#C8A96A]/15 hover:bg-[#C8A96A]/25 border border-[#C8A96A]/40 text-[#C8A96A] font-medium flex items-center gap-1 text-[11px]"
              >
                <Phone className="w-3 h-3" />
                <span>Call Seller</span>
              </a>
            </div>
          </div>

          {/* 4. PURCHASED ITEMS LIST */}
          <div className="space-y-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Purchased Items
            </span>
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-800" />
                  <div>
                    <div className="text-white font-medium truncate max-w-[200px]">{item.title}</div>
                    <div className="text-slate-400 text-[11px]">Qty: {item.quantity}</div>
                  </div>
                </div>
                <div className="font-bold text-white tabular-nums">
                  {formatNaira(item.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* 5. ITEMIZED FINANCIAL RECEIPT */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Items Subtotal</span>
              <span className="text-slate-200 tabular-nums">{formatNaira(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Campus Delivery Fee</span>
                <span className="text-slate-200 tabular-nums">{formatNaira(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span className="text-[#8C9399]">Payment Gateway Fee (1.5% + ₦100)</span>
              <span className="text-slate-200 tabular-nums">{formatNaira(order.gatewayFee)}</span>
            </div>
            <div className="border-t border-white/[0.08] pt-1.5 flex justify-between font-bold text-white">
              <span>Total Paid via Web Checkout</span>
              <span className="text-base font-extrabold text-[#C8A96A] tabular-nums font-serif">
                {formatNaira(order.totalAmount)}
              </span>
            </div>
            <div className="text-[10px] text-[#8C9399] pt-1 font-light">
              Date: {formatDate(order.createdAt)} · Escrow: Payluk Escrow Vault
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-white/[0.02] flex items-center gap-3">
          {!isDelivered && (
            <button
              onClick={() => {
                onClose();
                onOpenDispute(order);
              }}
              className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Report Issue</span>
            </button>
          )}

          {isDelivered && onRateSeller && (
            <button
              onClick={() => {
                onClose();
                onRateSeller(order);
              }}
              className="py-3 px-4 rounded-xl bg-[#f3c84b] hover:bg-[#eab308] text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Star className="w-4 h-4 fill-current" />
              <span>{order.hasBuyerReviewed ? 'View Your Review' : 'Rate Seller'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm text-center transition-colors shadow-md cursor-pointer"
          >
            Done · Return to Campus Hub
          </button>
        </div>
      </div>
    </div>
  );
};
