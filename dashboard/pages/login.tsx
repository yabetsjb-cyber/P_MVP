import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PageHead } from '@/components/PageHead';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { status, refetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (status === 'verified' || status === 'pending' || status === 'suspended' || status === 'no-pharmacy') {
      const returnTo = typeof router.query.returnTo === 'string' ? router.query.returnTo : '/';
      router.replace(returnTo);
    }
  }, [status, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await api('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refetch();
  };

  return (
    <>
    <PageHead title={t('loginTitle')} />
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-sm border p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">{t('loginTitle')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('loginSubtitle')}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="text-sm text-danger-600 bg-danger-50 rounded p-2"
          >
            {error.kind === 'rate_limited'
              ? t('rateLimited', { seconds: error.retryAfter })
              : error.kind === 'unauthorized'
              ? t('invalidCredentials')
              : errorMessage(error)}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium">{t('email')}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t('password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border-gray-300 focus:border-brand-500 focus:ring-brand-500"
            disabled={submitting}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 text-white rounded py-2 font-medium disabled:opacity-50 hover:bg-brand-700"
        >
          {submitting ? t('signingIn') : t('signIn')}
        </button>
      </form>
    </div>
    </>
  );
}