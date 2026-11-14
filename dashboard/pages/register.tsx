import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { Mail, Lock, User, Phone } from 'lucide-react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth, type User as UserType } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PageHead } from '@/components/PageHead';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { Input } from '@/lib/ui/Input';

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

    const result = await api<{ user: UserType }>('/v1/auth/register', {
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
      } else if (result.error.kind === 'conflict' && result.error.code === 'EMAIL_IN_USE') {
        setFieldErrors({ email: t('emailInUse') });
      } else {
        setError(result.error);
      }
      return;
    }

    queryClient.setQueryData(['me'], result);
    refetch();
  };

  return (
    <>
      <PageHead title={t('title')} />
      <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-12">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        
        <Card className="w-full max-w-lg p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-brand-600 mb-2">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>

          {error && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3 text-center">
              {errorMessage(error)}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('fullName')}</span>
              <Input
                type="text"
                icon={<User size={18} />}
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.fullName}
              />
              {fieldErrors.fullName && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.fullName}</span>}
            </label>

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
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.email}</span>}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('password')}</span>
              <Input
                type="password"
                icon={<Lock size={18} />}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.password}
              />
              <span className="text-xs text-gray-500 mt-1 block">{t('passwordHint')}</span>
              {fieldErrors.password && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.password}</span>}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('phone')}</span>
              <Input
                type="tel"
                icon={<Phone size={18} />}
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
                aria-invalid={!!fieldErrors.phone}
              />
              <span className="text-xs text-gray-500 mt-1 block">{t('phoneHint')}</span>
              {fieldErrors.phone && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.phone}</span>}
            </label>

            <Button type="submit" disabled={submitting} className="w-full mt-2" size="lg">
              {submitting ? t('creatingAccount') : t('createAccount')}
            </Button>
          </form>

          <p className="text-sm text-gray-600 text-center border-t border-gray-100 pt-4">
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              {tAuth('signIn')}
            </Link>
          </p>
        </Card>
      </div>
    </>
  );
}