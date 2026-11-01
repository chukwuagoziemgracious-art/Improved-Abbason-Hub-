import React, { useState } from 'react';
import { X, Shield, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { store } from '../services/store';
import { loginWithGoogle } from '../services/firebase';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleAdminLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const fbUser = await loginWithGoogle();
      if (fbUser && fbUser.email) {
        if (fbUser.email.toLowerCase() === 'chukwuagoziemgracious@gmail.com') {
          store.authenticateAdmin('chukwuagoziemgracious@gmail.com');
          onSuccess();
          onClose();
          return;
        } else {
          setError(`Account ${fbUser.email} is not registered as an authorized platform administrator.`);
        }
      }
    } catch {
      setError('Google administrator authorization was cancelled.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const valid = store.authenticateAdmin(passcode);
    setLoading(false);

    if (valid) {
      onSuccess();
      onClose();
    } else {
      setError('Incorrect admin authorization key. Access is strictly restricted to platform administration.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-[20px]">
      <div
        className="relative w-full max-w-sm rounded-3xl bg-[#020406]/95 backdrop-blur-[24px] border border-white/[0.12] shadow-[0_40px_100px_rgba(0,0,0,0.9)] p-6 sm:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-[#8C9399] hover:text-[#E9E6DF] flex items-center justify-center border border-white/[0.08] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#C8A96A]/10 text-[#C8A96A] mx-auto flex items-center justify-center border border-[#C8A96A]/40 shadow-lg">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-light text-[#E9E6DF] font-serif">Abbason Administration</h3>
          <p className="text-xs text-[#8C9399] max-w-xs mx-auto font-light leading-relaxed">
            Restricted moderation area. Only authorized platform owners and administrators can access this portal.
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleAdminLogin}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-[#E9E6DF] text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50 mb-4"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>One-Click Super Admin (Google)</span>
        </button>

        <div className="flex items-center gap-2 mb-4 text-[10px] text-slate-500 uppercase tracking-widest justify-center">
          <span className="h-px bg-white/[0.08] flex-1"></span>
          <span>or use master key</span>
          <span className="h-px bg-white/[0.08] flex-1"></span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] uppercase font-medium tracking-[0.25em] text-[#8C9399] mb-1.5">
              Admin Passcode / Master Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
                placeholder="Enter admin passcode (e.g. abbason2026)"
                className="w-full bg-[#020406]/90 border border-white/[0.1] focus:border-[#C8A96A] rounded-xl px-3.5 py-2.5 text-xs text-[#E9E6DF] placeholder-[#8C9399]/60 focus:outline-none pr-9 font-mono"
              />
              <Lock className="w-4 h-4 text-[#8C9399] absolute right-3 top-3" />
            </div>
            <p className="text-[10px] text-[#8C9399] mt-1 font-light">
              Default owner key: <span className="font-mono text-[#C8A96A]">abbason2026</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="w-full py-3 rounded-xl bg-[#C8A96A] hover:bg-[#d8bb7d] disabled:opacity-50 text-[#020406] font-semibold text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
          >
            <span>Unlock Admin Console</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
