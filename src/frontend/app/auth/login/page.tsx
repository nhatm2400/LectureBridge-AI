'use client';

import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

export default function LoginPage() {
  const router = useRouter();
  const login = useAppStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await api.auth.login({ email, password });
      login(response.user);
      router.push(response.user.role === 'admin' ? '/admin' : '/student/library');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">Chào mừng trở lại</p>
        <h1 className="mt-3 text-3xl">Đăng nhập LectureBridge</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">Tiếp tục bài giảng và khôi phục đúng phần bạn đã bỏ lỡ.</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--lb-danger)]">{error}</div>}

      <form onSubmit={handleLogin} className="space-y-5">
        <Field label="Email" htmlFor="login-email">
          <div className="relative">
            <input
              id="login-email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ban@example.com"
              className="lb-field pr-11"
            />
            <Mail className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--lb-subtle)]" size={18} aria-hidden="true" />
          </div>
        </Field>

        <Field label="Mật khẩu" htmlFor="login-password">
          <div className="relative">
            <input
              id="login-password"
              required
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhập mật khẩu"
              className="lb-field pr-12"
            />
            <IconButton
              label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        </Field>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--lb-muted)]">
        Chưa có tài khoản?{' '}
        <Link href="/auth/register" className="font-bold text-[var(--lb-accent)] underline-offset-4 hover:underline">Đăng ký</Link>
      </p>
    </div>
  );
}
