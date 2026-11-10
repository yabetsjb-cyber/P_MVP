import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth, type User } from '@/context/AuthContext';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';


export default function RegisterPage() {
  const t = useTranslations('register');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const { status, refetch } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Redirect authenticated users away from the register page.
  // After successful registration, status flips to 'no-pharmacy' → /pending.
  useEffect(() => {
    if (status === 'verified') router.replace('/reservations');
    else if (status === 'pending' || status === 'no-pharmacy') router.replace('/pending');
    else if (status === 'suspended' || status === 'rejected') router.replace('/suspended');
  }, [status, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const result = await api<{ user: User }>('/v1/auth/register', {
      method: 'POST',
      body: {
        email,
        password,
        fullName,
        phone: phone.trim() === '' ? undefined : phone.trim(),
      },
      skipAuthRedirect: true,
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.error.kind === 'validation') {
        setFieldErrors(result.error.fields);
      } else if (
        result.error.kind === 'conflict' &&
        result.error.code === 'EMAIL_IN_USE'
      ) {
        setFieldErrors({ email: t('emailInUse') });
      } else {
        setError(result.error);
      }
      return;
    }

    // Update the cache synchronously so `meQuery.data` reflects the new user
    // immediately. This flips `status` to 'no-pharmacy' and triggers the
    // redirect effect below without waiting for a background refetch.
    queryClient.setQueryData(['me'], result);
    refetch();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-sm border p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="text-sm text-danger-600 bg-danger-50 rounded p-2"
          >
            {errorMessage(error)}
          </div>
        )}

        <Field
          label={t('fullName')}
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={setFullName}
          disabled={submitting}
          error={fieldErrors.fullName}
          required
        />
        <Field
          label={t('email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          disabled={submitting}
          error={fieldErrors.email}
          required
        />
        <Field
          label={t('password')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          disabled={submitting}
          error={fieldErrors.password}
          hint={t('passwordHint')}
          required
        />
        <Field
          label={t('phone')}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={setPhone}
          disabled={submitting}
          error={fieldErrors.phone}
          hint={t('phoneHint')}
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 text-white rounded py-2 font-medium disabled:opacity-50 hover:bg-brand-700"
        >
          {submitting ? t('creatingAccount') : t('createAccount')}
        </button>

        <p className="text-sm text-gray-600 text-center">
          {t('haveAccount')}{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            {tAuth('signIn')}
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
  error,
  hint,
  required,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  const id = `reg-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const errId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errId ?? hintId}
        className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
      />
      {error ? (
        <span id={errId} className="text-xs text-danger-600 mt-1 block">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-xs text-gray-500 mt-1 block">
          {hint}
        </span>
      ) : null}
    </label>
  );
}