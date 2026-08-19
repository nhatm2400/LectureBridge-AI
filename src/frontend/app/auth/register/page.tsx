'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [allowRoleRegistration, setAllowRoleRegistration] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  useEffect(() => {
    const loadRegistrationConfig = async () => {
      const config = await api.auth.getRegistrationConfig();
      setAllowRoleRegistration(config.allow_role_registration);
    };
    loadRegistrationConfig();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    const nextErrors: typeof fieldErrors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) nextErrors.fullName = 'Vui lòng nhập họ và tên.';
    if (!trimmedEmail) nextErrors.email = 'Vui lòng nhập địa chỉ email.';
    else if (!isValidEmail(trimmedEmail)) nextErrors.email = 'Vui lòng nhập email hợp lệ.';
    if (password.length < 8) nextErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự.';
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      nextErrors.password = 'Mật khẩu phải có chữ hoa, chữ thường và số.';
    }
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    if (!acceptedTerms) nextErrors.terms = 'Bạn cần đồng ý điều khoản để tiếp tục.';

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError('Vui lòng kiểm tra lại các trường được đánh dấu.');
      setIsSubmitting(false);
      return;
    }

    try {
      await api.auth.register({
        full_name: trimmedName,
        email: trimmedEmail,
        password,
        confirm_password: confirmPassword,
        role: allowRoleRegistration ? role : 'student',
      });

      setIsSuccess(true);
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng ký thất bại. Vui lòng thử lại.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-10 animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500">
          <CheckCircle2 size={48} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng ký thành công!</h1>
          <p className="text-slate-500 font-medium">Đang chuyển đến trang đăng nhập...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-3 text-center lg:text-left">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Đăng ký</h1>
        <p className="text-slate-500 font-medium">
          Đã có tài khoản?
          <Link href="/auth/login" className="text-[#FF4F6E] font-bold hover:underline ml-1">Đăng nhập</Link>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-bold animate-in fade-in zoom-in duration-300">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} noValidate className="space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Họ và tên *</label>
          <div className="relative group">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FF4F6E] transition-colors" size={20} />
            <input
              required
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ và tên"
              aria-invalid={Boolean(fieldErrors.fullName)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:bg-white focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
          </div>
          {fieldErrors.fullName && <p className="text-xs font-bold text-red-600">{fieldErrors.fullName}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Địa chỉ email *</label>
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FF4F6E] transition-colors" size={20} />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
              aria-invalid={Boolean(fieldErrors.email)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:bg-white focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
          </div>
          {fieldErrors.email && <p className="text-xs font-bold text-red-600">{fieldErrors.email}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Mật khẩu *</label>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FF4F6E] transition-colors" size={20} />
            <input
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tạo mật khẩu"
              aria-invalid={Boolean(fieldErrors.password)}
              className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:bg-white focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {fieldErrors.password && <p className="text-xs font-bold text-red-600">{fieldErrors.password}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Xác nhận mật khẩu *</label>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#FF4F6E] transition-colors" size={20} />
            <input
              required
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:bg-white focus:border-[#FF4F6E]/30 transition-all font-medium text-slate-700"
            />
          </div>
          {fieldErrors.confirmPassword && <p className="text-xs font-bold text-red-600">{fieldErrors.confirmPassword}</p>}
        </div>

        {allowRoleRegistration && (
          <div className="space-y-2">
            <label className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Vai trò dev/test</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'student' | 'teacher' | 'admin')}
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#FF4F6E]/5 focus:bg-white focus:border-[#FF4F6E]/30 transition-all font-bold text-slate-700"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-[11px] font-bold text-amber-600">
              Chỉ dùng cho môi trường dev/test. Production nên tắt đăng ký role công khai.
            </p>
          </div>
        )}

        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-200 text-[#FF4F6E] focus:ring-[#FF4F6E]"
            />
            <label htmlFor="terms" className="text-xs font-bold text-slate-500 leading-relaxed cursor-pointer">
              Tôi đồng ý với <Link href="#" className="text-slate-900 hover:underline">Điều khoản dịch vụ</Link> và <Link href="#" className="text-slate-900 hover:underline">Chính sách bảo mật</Link>
            </label>
          </div>
          {fieldErrors.terms && <p className="text-xs font-bold text-red-600">{fieldErrors.terms}</p>}
        </div>

        <button
          disabled={isSubmitting}
          className="w-full py-4 bg-[#FF4F6E] text-white font-extrabold rounded-2xl shadow-xl shadow-[#FF4F6E]/20 hover:bg-[#e64663] transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Đăng ký'}
        </button>

      </form>
    </div>
  );
}
