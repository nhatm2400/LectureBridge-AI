'use client';

import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { api } from '@/lib/api';

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  useEffect(() => {
    api.auth.getRegistrationConfig()
      .then((config) => setAllowRoleRegistration(config.allow_role_registration))
      .catch(() => setAllowRoleRegistration(false));
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    const nextErrors: FieldErrors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) nextErrors.fullName = 'Vui lòng nhập họ và tên.';
    if (!trimmedEmail) nextErrors.email = 'Vui lòng nhập địa chỉ email.';
    else if (!isValidEmail(trimmedEmail)) nextErrors.email = 'Vui lòng nhập email hợp lệ.';
    if (password.length < 8) nextErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự.';
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) nextErrors.password = 'Mật khẩu phải có chữ hoa, chữ thường và số.';
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
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Đăng ký thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="py-8 text-center" role="status" aria-live="polite">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[var(--lb-success-soft)] text-[var(--lb-success)]"><CheckCircle2 size={30} /></span>
        <h1 className="mt-5 text-2xl">Đăng ký thành công</h1>
        <p className="mt-2 text-sm text-[var(--lb-muted)]">Đang chuyển đến trang đăng nhập…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">Tạo không gian học</p>
        <h1 className="mt-3 text-3xl">Đăng ký LectureBridge</h1>
        <p className="mt-2 text-sm text-[var(--lb-muted)]">Đã có tài khoản? <Link href="/auth/login" className="font-bold text-[var(--lb-accent)] underline-offset-4 hover:underline">Đăng nhập</Link></p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--lb-danger)]">{error}</div>}

      <form onSubmit={handleRegister} noValidate className="space-y-4">
        <Field label="Họ và tên" htmlFor="register-name" error={fieldErrors.fullName}>
          <input id="register-name" required type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn An" aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby={fieldErrors.fullName ? 'register-name-error' : undefined} className="lb-field" />
        </Field>

        <Field label="Email" htmlFor="register-email" error={fieldErrors.email}>
          <input id="register-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.com" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} className="lb-field" />
        </Field>

        <Field label="Mật khẩu" htmlFor="register-password" error={fieldErrors.password} hint="Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.">
          <div className="relative">
            <input id="register-password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tạo mật khẩu" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-hint'} className="lb-field pr-12" />
            <IconButton label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword((current) => !current)} className="absolute right-0.5 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        </Field>

        <Field label="Xác nhận mật khẩu" htmlFor="register-confirm-password" error={fieldErrors.confirmPassword}>
          <input id="register-confirm-password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-password-error' : undefined} className="lb-field" />
        </Field>

        {allowRoleRegistration && (
          <Field label="Vai trò dev/test" htmlFor="register-role" hint="Chỉ dùng cho môi trường dev/test; production nên tắt đăng ký role công khai.">
            <select id="register-role" value={role} onChange={(event) => setRole(event.target.value as 'student' | 'teacher' | 'admin')} className="lb-field font-semibold">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        )}

        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 text-sm leading-6 text-[var(--lb-muted)]">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--lb-accent)]" aria-invalid={Boolean(fieldErrors.terms)} aria-describedby={fieldErrors.terms ? 'register-terms-error' : undefined} />
            <span>Tôi đồng ý với <strong className="text-[var(--lb-ink)]">Điều khoản dịch vụ</strong> và <strong className="text-[var(--lb-ink)]">Chính sách bảo mật</strong>.</span>
          </label>
          {fieldErrors.terms && <p id="register-terms-error" className="text-sm font-semibold text-[var(--lb-danger)]">{fieldErrors.terms}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
          {isSubmitting ? 'Đang đăng ký…' : 'Đăng ký'}
        </Button>
      </form>
    </div>
  );
}
