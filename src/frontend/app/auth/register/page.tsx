'use client';

import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();
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

    if (!trimmedName) nextErrors.fullName = t('Vui lòng nhập họ và tên.', 'Enter your full name.');
    if (!trimmedEmail) nextErrors.email = t('Vui lòng nhập địa chỉ email.', 'Enter your email address.');
    else if (!isValidEmail(trimmedEmail)) nextErrors.email = t('Vui lòng nhập email hợp lệ.', 'Enter a valid email address.');
    if (password.length < 8) nextErrors.password = t('Mật khẩu phải có ít nhất 8 ký tự.', 'Password must contain at least 8 characters.');
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) nextErrors.password = t('Mật khẩu phải có chữ hoa, chữ thường và số.', 'Password must include uppercase, lowercase, and a number.');
    if (password !== confirmPassword) nextErrors.confirmPassword = t('Mật khẩu xác nhận không khớp.', 'Passwords do not match.');
    if (!acceptedTerms) nextErrors.terms = t('Bạn cần đồng ý điều khoản để tiếp tục.', 'Accept the terms to continue.');

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError(t('Vui lòng kiểm tra lại các trường được đánh dấu.', 'Review the highlighted fields.'));
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
      setError(caught instanceof Error ? caught.message : t('Đăng ký thất bại. Vui lòng thử lại.', 'Registration failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="py-8 text-center" role="status" aria-live="polite">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-[var(--lb-success-soft)] text-[var(--lb-success)]"><CheckCircle2 size={30} /></span>
        <h1 className="mt-5 text-2xl">{t('Đăng ký thành công', 'Registration complete')}</h1>
        <p className="mt-2 text-sm text-[var(--lb-muted)]">{t('Đang chuyển đến trang đăng nhập…', 'Redirecting to sign in…')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--lb-accent)]">{t('Tạo không gian học', 'Create your learning space')}</p>
        <h1 className="mt-3 text-3xl">{t('Đăng ký LectureBridge', 'Create a LectureBridge account')}</h1>
        <p className="mt-2 text-sm text-[var(--lb-muted)]">{t('Đã có tài khoản?', 'Already have an account?')} <Link href="/auth/login" className="font-bold text-[var(--lb-accent)] underline-offset-4 hover:underline">{t('Đăng nhập', 'Sign in')}</Link></p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--lb-danger)]">{error}</div>}

      <form onSubmit={handleRegister} noValidate className="space-y-4">
        <Field label={t('Họ và tên', 'Full name')} htmlFor="register-name" error={fieldErrors.fullName}>
          <input id="register-name" required type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t('Nguyễn Văn An', 'Alex Nguyen')} aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby={fieldErrors.fullName ? 'register-name-error' : undefined} className="lb-field" />
        </Field>

        <Field label="Email" htmlFor="register-email" error={fieldErrors.email}>
          <input id="register-email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ban@example.com" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} className="lb-field" />
        </Field>

        <Field label={t('Mật khẩu', 'Password')} htmlFor="register-password" error={fieldErrors.password} hint={t('Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.', 'At least 8 characters with uppercase, lowercase, and a number.')}>
          <div className="relative">
            <input id="register-password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Tạo mật khẩu', 'Create a password')} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-hint'} className="lb-field pr-12" />
            <IconButton label={showPassword ? t('Ẩn mật khẩu', 'Hide password') : t('Hiện mật khẩu', 'Show password')} onClick={() => setShowPassword((current) => !current)} className="absolute right-0.5 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        </Field>

        <Field label={t('Xác nhận mật khẩu', 'Confirm password')} htmlFor="register-confirm-password" error={fieldErrors.confirmPassword}>
          <input id="register-confirm-password" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t('Nhập lại mật khẩu', 'Re-enter your password')} aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-password-error' : undefined} className="lb-field" />
        </Field>

        {allowRoleRegistration && (
          <Field label={t('Vai trò dev/test', 'Dev/test role')} htmlFor="register-role" hint={t('Chỉ dùng cho môi trường dev/test; production nên tắt đăng ký role công khai.', 'For dev/test only; public role registration should be disabled in production.')}>
            <select id="register-role" value={role} onChange={(event) => setRole(event.target.value as 'student' | 'teacher' | 'admin')} className="lb-field font-semibold">
              <option value="student">{t('Học viên', 'Student')}</option>
              <option value="teacher">{t('Giảng viên', 'Teacher')}</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        )}

        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md py-2 text-sm leading-6 text-[var(--lb-muted)]">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--lb-accent)]" aria-invalid={Boolean(fieldErrors.terms)} aria-describedby={fieldErrors.terms ? 'register-terms-error' : undefined} />
            <span>{t('Tôi đồng ý với', 'I agree to the')} <strong className="text-[var(--lb-ink)]">{t('Điều khoản dịch vụ', 'Terms of Service')}</strong> {t('và', 'and')} <strong className="text-[var(--lb-ink)]">{t('Chính sách bảo mật', 'Privacy Policy')}</strong>.</span>
          </label>
          {fieldErrors.terms && <p id="register-terms-error" className="text-sm font-semibold text-[var(--lb-danger)]">{fieldErrors.terms}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
          {isSubmitting ? t('Đang đăng ký…', 'Registering…') : t('Đăng ký', 'Register')}
        </Button>
      </form>
    </div>
  );
}
