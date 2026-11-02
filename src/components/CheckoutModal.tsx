import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  Loader2,
  CheckCircle2,
  Truck
} from 'lucide-react';
import { store } from '../services/store';
import { formatNaira, calculateGatewayFee } from '../utils/currency';
import { Order } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliveryConfig: {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    deliveryInstructions: string;
  };
  onPaymentSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  deliveryConfig,
  onPaymentSuccess,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const cart = store.getCart();

  if (!isOpen || cart.length === 0) return null;

  // Group items by vendor
  const vendorMap = new Map<string, typeof cart>();
  cart.forEach((item) => {
    const sId = item.product.sellerId;
    if (!vendorMap.has(sId)) vendorMap.set(sId, []);
    vendorMap.get(sId)!.push(item);
  });
  const vendorCount = vendorMap.size;

  let totalDeliveryFee = 0;
  vendorMap.forEach((vendorItems) => {
    if (deliveryConfig.fulfillmentType === 'seller_delivers') {
      totalDeliveryFee += Math.max(...vendorItems.map((i) => i.product.deliveryFee));
    }
  });

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const upfrontDeliveryFee = totalDeliveryFee;
  const upfrontGatewayFee = calculateGatewayFee(upfrontDeliveryFee);
  const upfrontTotalDue = upfrontDeliveryFee + upfrontGatewayFee;
  const itemsTotalDueOnDelivery = subtotal;
  const floorGrandTotal = upfrontTotalDue + itemsTotalDueOnDelivery;

  const handlePaystackPayment = async () => {
    setIsProcessing(true);
    try {
      // Direct Paystack checkout simulation
      await new Promise((resolve) => setTimeout(resolve, 900));

      const createdOrders = await store.checkoutOrders({
        fulfillmentType: deliveryConfig.fulfillmentType,
        deliveryInstructions: deliveryConfig.deliveryInstructions,
        paymentMethod: 'card'
      });

      setIsProcessing(false);
      onPaymentSuccess(createdOrders[0]);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="relative w-full max-w-sm rounded-3xl bg-[#090D14] border border-white/[0.12] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06]">
          <div>
            <h3 className="text-base font-medium text-white font-serif">Checkout</h3>
            <p className="text-[11px] text-[#8C9399]">Inspect goods at your hostel before paying</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[#8C9399] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Simplified Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Destination */}
          <div className="flex items-center gap-2.5 text-slate-300">
            <Truck className="w-4 h-4 text-[#C8A96A] shrink-0" />
            <span className="truncate">
              Deliver to: <strong className="text-white font-medium">{deliveryConfig.deliveryInstructions}</strong>
            </span>
          </div>

          {/* Simple Breakdown Card */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400">Transport Fee (Due Now)</span>
              <span className="text-white font-mono font-medium">{formatNaira(upfrontTotalDue)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-slate-400">Goods Total (Pay on Delivery)</span>
              <span className="text-emerald-400 font-mono font-medium">{formatNaira(itemsTotalDueOnDelivery)}</span>
            </div>

            <div className="border-t border-white/[0.08] pt-2.5 flex justify-between items-baseline">
              <span className="text-white font-medium">Total Checkout</span>
              <span className="text-lg text-[#C8A96A] font-mono font-semibold">{formatNaira(floorGrandTotal)}</span>
            </div>
          </div>

          {/* Direct Paystack CTA Button */}
          <button
            type="button"
            onClick={handlePaystackPayment}
            disabled={isProcessing}
            className="w-full py-3.5 px-4 rounded-xl bg-[#C8A96A] hover:bg-[#d8bb7d] text-[#020406] font-semibold text-xs tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#020406]" />
                <span>Opening Paystack...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Pay {formatNaira(upfrontTotalDue)} Transport via Paystack</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-[#8C9399] font-light">
            Processed securely via Paystack. You only pay for items after inspecting them in person.
          </p>
        </div>
      </div>
    </div>
  );
};
