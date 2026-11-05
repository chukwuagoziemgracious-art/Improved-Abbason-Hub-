import React, { useState, useMemo } from 'react';
import { 
  X, 
  Lock, 
  Loader2, 
  Truck, 
  MapPin, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { store } from '../services/store';
import { formatNaira, calculateGatewayFee } from '../utils/currency';
import { Order, CartItem } from '../types';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cart = store.getCart();
  const activeCampus = store.getActiveCampus();
  const safePoints = activeCampus.safeMeetupPoints || ['Campus Main Gate', 'Student Union Building (SUB)', 'University Central Library'];

  // Group items by vendor
  const vendorGroups = useMemo(() => {
    const map = new Map<string, { sellerName: string; campusName: string; items: CartItem[] }>();
    cart.forEach((item) => {
      const sId = item.product.sellerId;
      if (!map.has(sId)) {
        map.set(sId, {
          sellerName: item.product.sellerName,
          campusName: item.product.campusName,
          items: []
        });
      }
      map.get(sId)!.items.push(item);
    });
    return map;
  }, [cart]);

  // Per-seller checkout configuration state
  const [sellerConfigs, setSellerConfigs] = useState<Record<string, {
    fulfillmentType: 'seller_delivers' | 'buyer_pickup';
    meetingPointKind: 'safe_checkpoint' | 'custom';
    checkpointLabel: string;
    customLocation: string;
    scheduledDate: string;
    timeSlot: 'morning' | 'afternoon' | 'evening' | 'any';
  }>>({});

  // Initialize seller configs on modal open
  React.useEffect(() => {
    if (isOpen) {
      const initial: typeof sellerConfigs = {};
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const defaultDateStr = tomorrow.toISOString().split('T')[0];

      vendorGroups.forEach((group, sId) => {
        initial[sId] = {
          fulfillmentType: deliveryConfig.fulfillmentType,
          meetingPointKind: 'safe_checkpoint',
          checkpointLabel: safePoints[0] || 'Campus Main Gate',
          customLocation: deliveryConfig.deliveryInstructions || '',
          scheduledDate: defaultDateStr,
          timeSlot: 'afternoon'
        };
      });
      setSellerConfigs(initial);
      setErrorMessage(null);
    }
  }, [isOpen, vendorGroups]);

  if (!isOpen || cart.length === 0) return null;

  // Compute financial totals per seller and consolidated
  let totalUpfrontDelivery = 0;
  let totalGoodsDue = 0;
  const vendorBreakdowns: Array<{
    sellerId: string;
    sellerName: string;
    deliveryFee: number;
    gatewayFee: number;
    upfrontTotal: number;
    goodsTotal: number;
  }> = [];

  vendorGroups.forEach((group, sId) => {
    const config = sellerConfigs[sId] || { fulfillmentType: deliveryConfig.fulfillmentType };
    const goodsTotal = group.items.reduce((sum, it) => sum + (it.product.price * it.quantity), 0);
    const deliveryFee = config.fulfillmentType === 'seller_delivers'
      ? Math.max(...group.items.map((i) => i.product.deliveryFee || 0))
      : 0;

    const gatewayFee = calculateGatewayFee(deliveryFee);
    const upfrontTotal = deliveryFee + gatewayFee;

    totalUpfrontDelivery += upfrontTotal;
    totalGoodsDue += goodsTotal;

    vendorBreakdowns.push({
      sellerId: sId,
      sellerName: group.sellerName,
      deliveryFee,
      gatewayFee,
      upfrontTotal,
      goodsTotal
    });
  });

  const grandTotal = totalUpfrontDelivery + totalGoodsDue;

  const handleProceedToPayment = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Validate meeting points
      for (const [sId, conf] of Object.entries(sellerConfigs)) {
        if (conf.meetingPointKind === 'custom' && (!conf.customLocation || conf.customLocation.trim().length < 3)) {
          throw new Error(`Please specify a valid hostel/room location for ${vendorGroups.get(sId)?.sellerName || 'vendor'} (min 3 characters).`);
        }
      }

      // Format payload for server
      const formattedConfigs: Record<string, any> = {};
      Object.entries(sellerConfigs).forEach(([sId, conf]) => {
        formattedConfigs[sId] = {
          fulfillmentType: conf.fulfillmentType,
          meetingPoint: {
            kind: conf.meetingPointKind,
            label: conf.meetingPointKind === 'safe_checkpoint' ? conf.checkpointLabel : conf.customLocation.trim()
          },
          scheduledDate: conf.scheduledDate,
          timeSlot: conf.timeSlot,
          deliveryInstructions: conf.meetingPointKind === 'custom' ? conf.customLocation.trim() : conf.checkpointLabel
        };
      });

      // 1. Create order(s) authoritatively on server
      const createdOrders = await store.checkoutOrders({
        fulfillmentType: deliveryConfig.fulfillmentType,
        deliveryInstructions: deliveryConfig.deliveryInstructions,
        paymentMethod: 'card',
        sellerConfigs: formattedConfigs
      });

      if (!createdOrders || createdOrders.length === 0) {
        throw new Error('Failed to create orders.');
      }

      // 2. Identify orders requiring upfront transport fee
      const payableOrders = createdOrders.filter((o) => (o.deliveryFee || 0) > 0 && !o.deliveryFeePaid);

      if (payableOrders.length > 0) {
        // Initialize payment for first seller (one at a time as per prompt spec)
        const primaryOrder = payableOrders[0];
        const payInit = await store.initializePayment({
          type: 'delivery_fee',
          orderId: primaryOrder.id
        });

        if (payInit.status && payInit.authorization_url) {
          // Redirect to Paystack or Sandbox simulator
          window.location.href = payInit.authorization_url;
          return;
        } else if (payInit.error) {
          throw new Error(payInit.error);
        }
      }

      // If no delivery fee (buyer pickup), order is immediately confirmed
      setIsProcessing(false);
      onPaymentSuccess(createdOrders[0]);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage(err.message || 'Payment initiation failed. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-3xl bg-[#090D14] border border-white/[0.12] shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06] bg-[#020406]/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-white font-serif">Campus Checkout</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#C8A96A]/10 text-[#C8A96A] border border-[#C8A96A]/30">
                Inspect First · Pay On Delivery
              </span>
            </div>
            <p className="text-[11px] text-[#8C9399] mt-0.5">Pay transport now via Paystack. Pay goods only at safe meetup.</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[#8C9399] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-5 text-xs max-h-[70vh] overflow-y-auto">
          {/* Per-Seller Parcel Configurations */}
          <div className="space-y-4">
            {Array.from(vendorGroups.entries()).map(([sellerId, group], idx) => {
              const conf = sellerConfigs[sellerId] || {
                fulfillmentType: deliveryConfig.fulfillmentType,
                meetingPointKind: 'safe_checkpoint',
                checkpointLabel: safePoints[0] || 'Campus Main Gate',
                customLocation: '',
                scheduledDate: '',
                timeSlot: 'afternoon'
              };

              const vendorDeliveryFee = conf.fulfillmentType === 'seller_delivers'
                ? Math.max(...group.items.map((i) => i.product.deliveryFee || 0))
                : 0;

              return (
                <div key={sellerId} className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 space-y-3.5">
                  {/* Vendor Title */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#C8A96A]/20 text-[#C8A96A] text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <strong className="text-white font-medium text-xs">{group.sellerName}</strong>
                    </div>
                    <span className="text-[10px] text-[#8C9399]">{group.items.length} item(s)</span>
                  </div>

                  {/* Fulfillment Choice */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSellerConfigs(prev => ({
                        ...prev,
                        [sellerId]: { ...prev[sellerId], fulfillmentType: 'seller_delivers' }
                      }))}
                      className={`p-2 rounded-xl text-left border transition-all ${
                        conf.fulfillmentType === 'seller_delivers'
                          ? 'border-[#C8A96A] bg-[#C8A96A]/10 text-white'
                          : 'border-white/[0.06] text-[#8C9399] hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <Truck className="w-3.5 h-3.5 text-[#C8A96A]" />
                        <span>Seller Delivers</span>
                      </div>
                      <p className="text-[10px] text-[#8C9399] mt-0.5">
                        Transport: {vendorDeliveryFee > 0 ? formatNaira(vendorDeliveryFee) : 'Free'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSellerConfigs(prev => ({
                        ...prev,
                        [sellerId]: { ...prev[sellerId], fulfillmentType: 'buyer_pickup' }
                      }))}
                      className={`p-2 rounded-xl text-left border transition-all ${
                        conf.fulfillmentType === 'buyer_pickup'
                          ? 'border-[#C8A96A] bg-[#C8A96A]/10 text-white'
                          : 'border-white/[0.06] text-[#8C9399] hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Self Pickup</span>
                      </div>
                      <p className="text-[10px] text-[#8C9399] mt-0.5">Meet at Checkpoint (₦0)</p>
                    </button>
                  </div>

                  {/* Meeting Point Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-[#8C9399] flex items-center justify-between">
                      <span>Campus Meeting Point</span>
                      <span className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Safe Checkpoint Verified
                      </span>
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSellerConfigs(prev => ({
                          ...prev,
                          [sellerId]: { ...prev[sellerId], meetingPointKind: 'safe_checkpoint' }
                        }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border ${
                          conf.meetingPointKind === 'safe_checkpoint'
                            ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-[#C8A96A]'
                            : 'bg-white/[0.02] border-white/[0.08] text-[#8C9399]'
                        }`}
                      >
                        Safe Checkpoint
                      </button>
                      <button
                        type="button"
                        onClick={() => setSellerConfigs(prev => ({
                          ...prev,
                          [sellerId]: { ...prev[sellerId], meetingPointKind: 'custom' }
                        }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border ${
                          conf.meetingPointKind === 'custom'
                            ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-[#C8A96A]'
                            : 'bg-white/[0.02] border-white/[0.08] text-[#8C9399]'
                        }`}
                      >
                        Custom Hostel/Lodge
                      </button>
                    </div>

                    {conf.meetingPointKind === 'safe_checkpoint' ? (
                      <div className="relative">
                        <select
                          value={conf.checkpointLabel}
                          onChange={(e) => setSellerConfigs(prev => ({
                            ...prev,
                            [sellerId]: { ...prev[sellerId], checkpointLabel: e.target.value }
                          }))}
                          className="w-full bg-[#020406] border border-white/[0.12] rounded-xl px-3 py-2 text-white appearance-none cursor-pointer focus:border-[#C8A96A] outline-none pr-8"
                        >
                          {safePoints.map((pt) => (
                            <option key={pt} value={pt} className="bg-[#090D14] text-white">
                              {pt}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#8C9399] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={conf.customLocation}
                        onChange={(e) => setSellerConfigs(prev => ({
                          ...prev,
                          [sellerId]: { ...prev[sellerId], customLocation: e.target.value }
                        }))}
                        placeholder="e.g. Block C, Room 14, Silver Hostel (3-120 chars)"
                        maxLength={120}
                        className="w-full bg-[#020406] border border-white/[0.12] rounded-xl px-3 py-2 text-white placeholder-[#8C9399]/60 focus:border-[#C8A96A] outline-none text-xs"
                      />
                    )}
                  </div>

                  {/* Scheduled Delivery Date & Time Slot */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] text-[#8C9399] flex items-center gap-1 mb-1">
                        <Calendar className="w-3 h-3 text-[#C8A96A]" /> Delivery Date
                      </label>
                      <input
                        type="date"
                        value={conf.scheduledDate}
                        onChange={(e) => setSellerConfigs(prev => ({
                          ...prev,
                          [sellerId]: { ...prev[sellerId], scheduledDate: e.target.value }
                        }))}
                        className="w-full bg-[#020406] border border-white/[0.12] rounded-xl px-2.5 py-1.5 text-white text-[11px] outline-none focus:border-[#C8A96A]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8C9399] flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3 text-[#C8A96A]" /> Time Slot
                      </label>
                      <select
                        value={conf.timeSlot}
                        onChange={(e) => setSellerConfigs(prev => ({
                          ...prev,
                          [sellerId]: { ...prev[sellerId], timeSlot: e.target.value as any }
                        }))}
                        className="w-full bg-[#020406] border border-white/[0.12] rounded-xl px-2.5 py-1.5 text-white text-[11px] outline-none focus:border-[#C8A96A] cursor-pointer"
                      >
                        <option value="morning" className="bg-[#090D14]">Morning (9am - 12pm)</option>
                        <option value="afternoon" className="bg-[#090D14]">Afternoon (12pm - 4pm)</option>
                        <option value="evening" className="bg-[#090D14]">Evening (4pm - 7pm)</option>
                        <option value="any" className="bg-[#090D14]">Any Time (Flexible)</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Consolidated Financial Summary */}
          <div className="rounded-2xl bg-[#020406] border border-white/[0.1] p-4 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#C8A96A]">Order Financial Breakdown</h4>

            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-slate-300">Transport Commitment (Paystack)</span>
                <p className="text-[10px] text-[#8C9399]">Includes Paystack 1.5% gateway fee</p>
              </div>
              <span className="text-white font-mono font-medium">{formatNaira(totalUpfrontDelivery)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-emerald-400">Goods Total (Pay on Inspection)</span>
                <p className="text-[10px] text-[#8C9399]">Only paid after inspecting items</p>
              </div>
              <span className="text-emerald-400 font-mono font-semibold">{formatNaira(totalGoodsDue)}</span>
            </div>

            <div className="border-t border-white/[0.08] pt-2.5 flex justify-between items-baseline">
              <div>
                <span className="text-white font-medium text-xs">Total Order Value</span>
                <p className="text-[10px] text-[#8C9399]">Platform 3% commission is seller-side</p>
              </div>
              <span className="text-lg text-[#C8A96A] font-mono font-bold">{formatNaira(grandTotal)}</span>
            </div>
          </div>

          {/* Action CTA */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleProceedToPayment}
              disabled={isProcessing}
              className="w-full py-3.5 px-4 rounded-xl bg-[#C8A96A] hover:bg-[#D4AF37] text-[#020406] font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#020406]" />
                  <span>Connecting to Paystack...</span>
                </>
              ) : totalUpfrontDelivery > 0 ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#020406]" />
                  <span>Pay Transport Fee {formatNaira(totalUpfrontDelivery)} via Paystack</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#020406]" />
                  <span>Confirm Pickup & Schedule Order</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-[#8C9399] font-light">
              Securely processed via Paystack. You only pay for goods at the safe checkpoint after inspecting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
