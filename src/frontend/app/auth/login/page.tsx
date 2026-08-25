'use client';

import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
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
      setError(caught instanceof Error ? caught.message : t('Đăng nhập thất bại. Vui lòng thử lại.', 'Sign-in failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">{t('Chào mừng trở lại', 'Welcome back')}</p>
        <h1 className="mt-3 text-3xl">{t('Đăng nhập LectureBridge', 'Sign in to LectureBridge')}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">{t('Tiếp tục bài giảng và khôi phục đúng phần bạn đã bỏ lỡ.', 'Continue your lecture and recover exactly what you missed.')}</p>
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

        <Field label={t('Mật khẩu', 'Password')} htmlFor="login-password">
          <div className="relative">
            <input
              id="login-password"
              required
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('Nhập mật khẩu', 'Enter your password')}
              className="lb-field pr-12"
            />
            <IconButton
              label={showPassword ? t('Ẩn mật khẩu', 'Hide password') : t('Hiện mật khẩu', 'Show password')}
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        </Field>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
          {isSubmitting ? t('Đang đăng nhập…', 'Signing in…') : t('Đăng nhập', 'Sign in')}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--lb-muted)]">
        {t('Chưa có tài khoản?', 'Need an account?')}{' '}
        <Link href="/auth/register" className="font-bold text-[var(--lb-accent)] underline-offset-4 hover:underline">{t('Đăng ký', 'Register')}</Link>
      </p>
    </div>
  );
}
