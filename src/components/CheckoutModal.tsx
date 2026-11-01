import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  Building2, 
  Smartphone, 
  ShieldCheck, 
  AlertTriangle, 
  Lock, 
  CheckCircle,
  Copy,
  Loader2
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
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer' | 'ussd'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const cart = store.getCart();
  const currentUser = store.getCurrentUser();

  if (!isOpen || cart.length === 0) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = deliveryConfig.fulfillmentType === 'seller_delivers' ? (cart[0]?.product.deliveryFee || 0) : 0;
  const gatewayFee = calculateGatewayFee(subtotal + deliveryFee);
  const totalAmount = subtotal + deliveryFee + gatewayFee;

  const handleSimulatePayment = async () => {
    setIsProcessing(true);
    try {
      // Simulate network latency of payment processing
      await new Promise((resolve) => setTimeout(resolve, 1400));

      const newOrder = await store.createOrder({
        fulfillmentType: deliveryConfig.fulfillmentType,
        deliveryInstructions: deliveryConfig.deliveryInstructions,
        paymentMethod
      });

      setIsProcessing(false);
      onPaymentSuccess(newOrder);
    } catch (err) {
      console.error('Checkout error:', err);
      setIsProcessing(false);
    }
  };

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('0248192034');
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-[20px] overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-3xl bg-[#020406]/95 backdrop-blur-[24px] border border-white/[0.12] shadow-[0_40px_100px_rgba(0,0,0,0.9)] overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#C8A96A]/10 border border-[#C8A96A]/40 flex items-center justify-center text-[#C8A96A]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-light text-[#E9E6DF] font-serif">
                Abbason Secure Web Checkout
              </h3>
              <p className="text-[10px] text-[#8C9399] uppercase tracking-wider font-light">
                Official in-app campus payment gateway
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF] flex items-center justify-center border border-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Development & Payluk Escrow Notice Watermark */}
        <div className="bg-[#0e0c08]/80 border-b border-[#C8A96A]/20 px-4 py-2.5 text-xs text-[#E9E6DF] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#C8A96A] shrink-0 mt-0.5" />
          <div className="text-[11px] leading-snug font-light text-[#8C9399]">
            <strong className="text-[#C8A96A] font-medium tracking-wide">PAYLUK ESCROW SIMULATION:</strong> This simulates payment processing via Payluk Escrow. Funds are safely held until you physically inspect your item and share your 6-digit delivery OTP.
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Order Summary & Fee Transparency */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs space-y-2">
            <div className="flex justify-between text-[#8C9399] font-light">
              <span>Items subtotal ({cart.length} item{cart.length === 1 ? '' : 's'})</span>
              <span className="text-[#E9E6DF] tabular-nums font-mono">{formatNaira(subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-[#8C9399] font-light">
                <span>Campus delivery fee</span>
                <span className="text-[#E9E6DF] tabular-nums font-mono">{formatNaira(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#8C9399] font-light">
              <span className="text-[#C8A96A]">Payment processing fee (Gateway)</span>
              <span className="text-[#E9E6DF] tabular-nums font-mono">{formatNaira(gatewayFee)}</span>
            </div>
            <div className="border-t border-white/[0.08] pt-2 flex justify-between items-baseline font-normal text-[#E9E6DF]">
              <span className="font-serif">Total to pay</span>
              <span className="text-lg text-[#C8A96A] tabular-nums font-serif tracking-wide">
                {formatNaira(totalAmount)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector Tabs */}
          <div>
            <label className="block text-[9px] uppercase font-medium text-[#8C9399] tracking-[0.25em] mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-[#C8A96A]'
                    : 'bg-white/[0.03] border-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF]'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span className="font-semibold text-[11px]">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-[#C8A96A]'
                    : 'bg-white/[0.03] border-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF]'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span className="font-semibold text-[11px]">Bank Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('ussd')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'ussd'
                    ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-[#C8A96A]'
                    : 'bg-white/[0.03] border-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF]'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span className="font-semibold text-[11px]">USSD</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Card Simulation */}
          {paymentMethod === 'card' && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#8C9399] tracking-wider mb-1">
                  Card Number (Pre-filled Test Card)
                </label>
                <input
                  type="text"
                  readOnly
                  value="5399 •••• •••• 4242 (Mastercard)"
                  className="w-full bg-[#0B1120] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-300 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8C9399] tracking-wider mb-1">
                    Expiry
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="12/28"
                    className="w-full bg-[#0B1120] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#8C9399] tracking-wider mb-1">
                    CVV
                  </label>
                  <input
                    type="password"
                    readOnly
                    value="821"
                    className="w-full bg-[#0B1120] border border-white/[0.08] rounded-xl px-3 py-2 text-slate-300 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Bank Transfer Simulation */}
          {paymentMethod === 'bank_transfer' && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5 text-xs">
              <div className="text-slate-300 text-[11px]">
                Transfer exactly <strong className="text-[#C8A96A]">{formatNaira(totalAmount)}</strong> to the dynamic virtual account below:
              </div>

              <div className="p-3 rounded-xl bg-[#0B1120] border border-white/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase text-[#8C9399] font-semibold">Bank Name</div>
                  <div className="text-sm font-bold text-white">Wema Bank / Payluk Escrow</div>
                  <div className="text-xs text-[#C8A96A] font-mono mt-0.5 font-bold">0248 1920 34</div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="px-2.5 py-1.5 rounded-lg bg-[#C8A96A]/10 border border-[#C8A96A]/30 text-[11px] text-[#C8A96A] hover:bg-[#C8A96A]/20 flex items-center gap-1 cursor-pointer"
                >
                  {copiedAccount ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: USSD Simulation */}
          {paymentMethod === 'ussd' && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-xs">
              <div className="text-slate-300 text-[11px]">
                Dial this code on your registered bank phone:
              </div>
              <div className="p-3 rounded-xl bg-[#0B1120] border border-white/[0.08] font-mono text-center text-[#C8A96A] text-sm font-bold tracking-wider">
                *737*50*39170*0248#
              </div>
            </div>
          )}

          {/* Handshake OTP reminder banner */}
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-[#C8A96A]/30 flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-[#C8A96A] shrink-0 mt-0.5" />
            <div className="text-[11px] leading-snug">
              Once payment confirms, your private <strong className="text-[#C8A96A]">6-digit delivery confirmation code</strong> will be generated. Do NOT reveal it until you meet the seller and inspect your items!
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-white/[0.02] flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-3 px-4 rounded-xl border border-white/[0.12] hover:border-white/[0.25] text-[#8C9399] hover:text-[#E9E6DF] text-xs font-light uppercase tracking-[0.2em] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSimulatePayment}
            disabled={isProcessing}
            className="flex-2 py-3 px-4 rounded-xl bg-[#C8A96A] hover:bg-[#d8bb7d] text-[#020406] font-semibold text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-300 shadow-xl cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#020406]" />
                <span>Simulating Payment & Generating Code...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Pay {formatNaira(totalAmount)} (Simulated)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
