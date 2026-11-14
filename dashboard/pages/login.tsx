import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { Mail, Lock } from 'lucide-react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PageHead } from '@/components/PageHead';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { Input } from '@/lib/ui/Input';

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
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-brand-600 mb-2">MedFinder</h1>
            <p className="text-sm text-gray-500">{t('loginSubtitle')}</p>
          </div>

          {error && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3 text-center">
              {error.kind === 'rate_limited'
                ? t('rateLimited', { seconds: error.retryAfter })
                : error.kind === 'unauthorized'
                ? t('invalidCredentials')
                : errorMessage(error)}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('email')}</span>
              <Input
                type="email"
                icon={<Mail size={18} />}
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                placeholder="owner@pharmacy.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('password')}</span>
              <Input
                type="password"
                icon={<Lock size={18} />}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="••••••••"
              />
            </label>

            <Button type="submit" disabled={submitting} className="w-full mt-2" size="lg">
              {submitting ? t('signingIn') : t('signIn')}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}