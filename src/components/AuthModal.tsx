import React, { useState } from 'react';
import { 
  X, 
  User, 
  Store, 
  ShieldCheck, 
  MapPin, 
  Lock, 
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { store } from '../services/store';
import { loginWithGoogle } from '../services/firebase';
import { Role } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdminLogin?: () => void;
  onOpenSellerVerification?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose,
  onOpenAdminLogin,
  onOpenSellerVerification
}) => {
  const campuses = store.getCampuses().filter(c => c.id !== 'all');
  const activeCampus = store.getActiveCampus();
  const currentUser = store.getCurrentUser();
  const isSellerVerified = store.canUserSell(currentUser.id);
  const verificationStatus = store.getSellerVerificationStatus(currentUser.id);

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState<Role>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [campusId, setCampusId] = useState(activeCampus.id === 'all' ? 'unizik' : activeCampus.id);
  const [hostel, setHostel] = useState('Campus Hostel Block');
  const [storeName, setStoreName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setFeedback(null);
    try {
      const fbUser = await loginWithGoogle();
      if (fbUser && fbUser.email) {
        if (fbUser.email.toLowerCase() === 'chukwuagoziemgracious@gmail.com') {
          store.authenticateAdmin('chukwuagoziemgracious@gmail.com');
          setFeedback(`Welcome Super Admin, ${fbUser.displayName || 'Owner'}!`);
          setTimeout(() => onClose(), 1200);
          return;
        }

        const existing = store.getUsers().find((u) => u.email.toLowerCase() === fbUser.email?.toLowerCase());
        if (existing) {
          existing.id = fbUser.uid;
          store.setCurrentUser(existing);
          setFeedback(`Welcome back, ${existing.name}!`);
        } else {
          const registered = store.registerUser({
            name: fbUser.displayName || fbUser.email.split('@')[0],
            email: fbUser.email,
            phone: fbUser.phoneNumber || '+234 810 000 0000',
            role: 'student',
            campusId: campusId || 'unizik',
            hostel: 'Campus Area'
          });
          registered.id = fbUser.uid;
          store.setCurrentUser(registered);
          setFeedback(`Account created for ${registered.name}!`);
        }
        setTimeout(() => onClose(), 1200);
      }
    } catch (err) {
      console.warn('Google sign-in skipped or cancelled:', err);
      setFeedback('Google authentication was cancelled or paused.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setFeedback('Please enter your email address.');
      return;
    }

    if (!password || password.length < 6) {
      setFeedback('Password must be at least 6 characters.');
      return;
    }

    // Owner protection: cannot be accessed via forms without Google verification
    if (cleanEmail === 'chukwuagoziemgracious@gmail.com') {
      setFeedback('Platform Owner access strictly requires Google Authentication.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setFeedback('Please enter your full name.');
          setIsSubmitting(false);
          return;
        }

        const existing = store.getUsers().find((u) => u.email.toLowerCase() === cleanEmail);
        if (existing) {
          setFeedback('An account with this student email already exists. Please switch to Sign In.');
          setIsSubmitting(false);
          return;
        }

        const newUser = store.registerUser({
          name,
          email: cleanEmail,
          phone: phone || '+234 800 000 0000',
          role,
          campusId,
          hostel,
          storeName: role === 'seller' ? storeName || `${name}'s Shop` : undefined,
          password
        });

        setFeedback(`Welcome to Abbason Hub, ${newUser.name}!`);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        // Authenticate student with password
        const authResult = store.authenticateWithPassword(cleanEmail, password);
        if (!authResult.success) {
          setFeedback(authResult.error || 'Authentication failed. Please verify credentials.');
          return;
        }

        setFeedback(`Welcome back, ${authResult.user?.name}!`);
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setFeedback(err?.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectPreloadedStudent = (user: typeof currentUser) => {
    store.setCurrentUser(user);
    setFeedback(`Switched profile to ${user.name}`);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-[20px] overflow-y-auto">
      <div 
        className="relative w-full max-w-md rounded-[6px] bg-[#020406]/95 backdrop-blur-[24px] border border-white/[0.12] shadow-[0_40px_100px_rgba(0,0,0,0.9)] overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[4px] bg-[#C8A96A]/10 border border-[#C8A96A]/40 flex items-center justify-center text-[#C8A96A]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-light text-[#E9E6DF] font-serif">
                Student Account
              </h3>
              <p className="text-[10px] text-[#8C9399] uppercase tracking-wider font-light">
                Abbason Hub · Multi-Campus Nigeria
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

        {/* Current Active User Card */}
        <div className="p-4 bg-white/[0.02] border-b border-white/[0.08] text-xs">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[9px] uppercase font-medium tracking-[0.2em] text-[#8C9399]">Active Profile</span>
              <div className="text-sm font-normal text-[#E9E6DF] font-serif mt-0.5">{currentUser.name}</div>
              <div className="text-[#8C9399] text-[11px] font-light">{currentUser.email}</div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Campus</span>
              <span className="text-[#C8A96A] font-medium">{currentUser.campusName.split('(')[0]}</span>
              {isSellerVerified ? (
                <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-bold mt-0.5">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Seller
                </span>
              ) : verificationStatus === 'pending' ? (
                <span className="text-[#C8A96A] text-[10px] font-medium block mt-0.5">
                  Verification Pending
                </span>
              ) : (
                <span className="text-[#8C9399] text-[10px] block mt-0.5 font-light">
                  Student Buyer
                </span>
              )}
            </div>
          </div>

          {!isSellerVerified && onOpenSellerVerification && (
            <button
              onClick={() => {
                onClose();
                onOpenSellerVerification();
              }}
              className="mt-3 w-full py-2 rounded-xl bg-[#C8A96A]/15 hover:bg-[#C8A96A]/25 border border-[#C8A96A]/40 text-[#C8A96A] text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply to Become a Verified Seller</span>
            </button>
          )}
        </div>

        {feedback && (
          <div className="p-2.5 bg-emerald-950/80 border-b border-emerald-500/50 text-emerald-200 text-xs text-center font-medium">
            {feedback}
          </div>
        )}

        {/* Tab Switcher: Sign In vs Register */}
        <div className="flex border-b border-white/[0.08] bg-[#0B1120] text-xs">
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            className={`flex-1 py-2.5 font-medium transition-colors border-b-2 cursor-pointer ${
              !isRegister
                ? 'border-[#C8A96A] text-[#C8A96A]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Switch / Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            className={`flex-1 py-2.5 font-medium transition-colors border-b-2 cursor-pointer ${
              isRegister
                ? 'border-[#C8A96A] text-[#C8A96A]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Student Profile
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 max-h-[60vh] overflow-y-auto space-y-4">
          {!isRegister ? (
            <div className="space-y-4 text-xs">
              {/* Google One-Click Sign In */}
              <div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-[#E9E6DF] text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{isGoogleLoading ? 'Connecting Google Account...' : 'Continue with Google Account'}</span>
                </button>

                <div className="flex items-center gap-2 my-3 text-[10px] text-slate-500 uppercase tracking-widest justify-center">
                  <span className="h-px bg-white/[0.08] flex-1"></span>
                  <span>or enter email</span>
                  <span className="h-px bg-white/[0.08] flex-1"></span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Student Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="student@university.edu.ng"
                    className="w-full bg-[#0B1120] border border-white/[0.08] focus:border-[#C8A96A] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-[#0B1120] border border-white/[0.08] focus:border-[#C8A96A] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-[#C8A96A] hover:bg-[#b89858] text-black font-semibold text-xs cursor-pointer shrink-0 shadow-md transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              {/* Quick Profile Switcher for Testing */}
              <div className="pt-2 border-t border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                  Sample Campus Accounts:
                </span>
                <div className="space-y-1.5">
                  {store.getUsers().slice(0, 3).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectPreloadedStudent(u)}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
                        currentUser.id === u.id
                          ? 'bg-[#C8A96A]/20 border-[#C8A96A] text-white'
                          : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {u.isVerifiedSeller && (
                            <span className="text-emerald-400 text-[10px]">✓ Verified Vendor</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{u.campusName.split('(')[0]} · {u.role}</div>
                      </div>
                      {currentUser.id === u.id && (
                        <span className="text-xs text-[#f3c84b] font-bold">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-[#E9E6DF] text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50 mb-3"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{isGoogleLoading ? 'Connecting Google...' : 'Quick Register with Google'}</span>
                </button>

                <div className="flex items-center gap-2 mb-3 text-[10px] text-slate-500 uppercase tracking-widest justify-center">
                  <span className="h-px bg-white/[0.08] flex-1"></span>
                  <span>or manual form</span>
                  <span className="h-px bg-white/[0.08] flex-1"></span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Ebuka Okonkwo"
                  className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  University / Campus *
                </label>
                <select
                  value={campusId}
                  onChange={(e) => setCampusId(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Student Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="student@campus.edu.ng"
                    className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Phone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+234 810 000 0000"
                    className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Hostel / Commercial Lodge
                </label>
                <input
                  type="text"
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  placeholder="e.g. Moremi Hall or Perm Site Lodge"
                  className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Set Account Password * (Min 6 characters)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#0B1120] border border-slate-800 focus:border-[#f3c84b] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#C8A96A] hover:bg-[#b89858] text-black font-medium text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer mt-2"
              >
                <span>Register Student Account</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Discreet Admin Portal Link at bottom for Owner */}
          <div className="pt-3 border-t border-white/[0.08] text-center">
            {onOpenAdminLogin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminLogin();
                }}
                className="text-[10px] text-slate-500 hover:text-[#C8A96A] transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>Abbason Platform Owner & Administration Portal</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
