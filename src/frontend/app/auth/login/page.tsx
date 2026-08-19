'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const login = useAppStore((state) => state.login);

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.auth.login({ email, password });
      login(response.user);

      if (response.user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/student/library');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-2 text-center lg:text-left">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Đăng nhập tài khoản</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700">Email *</label>
          <div className="relative group">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email của bạn"
              className="w-full pr-10 pl-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FF4F6E] transition-colors" size={18} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700">Mật khẩu *</label>
          <div className="relative group">
            <input
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              className="w-full pr-10 pl-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          disabled={isSubmitting}
          className="w-full py-4 bg-[#FF4F6E] text-white font-extrabold rounded-2xl shadow-xl shadow-[#FF4F6E]/20 hover:bg-[#e64663] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Đăng nhập'}
        </button>

        <div className="text-center pt-4 space-y-4">
          <p className="text-sm font-medium text-slate-500">
            Chưa có tài khoản?
            <Link href="/auth/register" className="text-[#FF4F6E] font-bold hover:underline ml-1">
              Đăng ký
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
