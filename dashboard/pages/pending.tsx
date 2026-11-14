import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { Clock, Store } from 'lucide-react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PageHead } from '@/components/PageHead';
import { Card } from '@/lib/ui/Card';
import { Button } from '@/lib/ui/Button';
import { Input } from '@/lib/ui/Input';

const DEFAULT_LAT = 9.0107;
const DEFAULT_LNG = 38.7869;

export default function PendingPage() {
  const t = useTranslations('verification');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { pharmacy, status, logout, refetch } = useAuth();

  useEffect(() => {
    if (status === 'verified') router.replace('/reservations');
    else if (status === 'suspended' || status === 'rejected') router.replace('/suspended');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      </div>
    );
  }

  if (status === 'no-pharmacy') {
    return <CreatePharmacyForm onCreated={refetch} onLogout={logout} />;
  }

  return (
    <>
      <PageHead title={t('pendingTitle')} />
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning-50 mb-2">
            <Clock className="w-8 h-8 text-warning-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pendingTitle')}</h1>
            <p className="text-sm text-gray-600">{t('pendingBody')}</p>
          </div>
          {pharmacy && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <span className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Pharmacy</span>
              <span className="text-sm font-semibold text-gray-900">{pharmacy.name}</span>
            </div>
          )}
          <Button variant="secondary" onClick={logout} className="w-full">
            {tAuth('logout')}
          </Button>
        </Card>
      </div>
    </>
  );
}

function CreatePharmacyForm({ onCreated, onLogout }: { onCreated: () => void; onLogout: () => void; }) {
  const t = useTranslations('createPharmacy');
  const tAuth = useTranslations('auth');
  const [name, setName] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [licenseExpiresOn, setLicenseExpiresOn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [subcity, setSubcity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null); setFieldErrors({});
    const result = await api('/v1/pharmacy/register', {
      method: 'POST',
      body: { name, licenseNo, licenseExpiresOn, phone, address: address || undefined, subcity: subcity || undefined, lat: DEFAULT_LAT, lng: DEFAULT_LNG },
    });
    setSubmitting(false);
    if (!result.ok) {
      if (result.error.kind === 'validation') setFieldErrors(result.error.fields);
      else if (result.error.kind === 'conflict' && result.error.code === 'LICENSE_ALREADY_REGISTERED') setFieldErrors({ licenseNo: t('licenseInUse') });
      else if (result.error.kind === 'conflict' && result.error.code === 'ALREADY_HAS_PHARMACY') onCreated();
      else setError(result.error);
      return;
    }
    onCreated();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHead title={t('title')} />
      <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-12">
        <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
        
        <Card className="w-full max-w-2xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-50 mb-3">
              <Store className="w-6 h-6 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>

          {error && <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-xl p-3 text-center">{errorMessage(error)}</div>}

          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('name')}</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} required aria-invalid={!!fieldErrors.name} />
              {fieldErrors.name && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.name}</span>}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('licenseNo')}</span>
              <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} disabled={submitting} required aria-invalid={!!fieldErrors.licenseNo} />
              {fieldErrors.licenseNo && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.licenseNo}</span>}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('licenseExpiresOn')}</span>
              <Input type="date" min={today} value={licenseExpiresOn} onChange={(e) => setLicenseExpiresOn(e.target.value)} disabled={submitting} required aria-invalid={!!fieldErrors.licenseExpiresOn} />
              {fieldErrors.licenseExpiresOn && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.licenseExpiresOn}</span>}
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('phone')}</span>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={submitting} required aria-invalid={!!fieldErrors.phone} />
              <span className="text-xs text-gray-500 mt-1 block">{t('phoneHint')}</span>
              {fieldErrors.phone && <span className="text-xs text-danger-600 mt-1 block">{fieldErrors.phone}</span>}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('address')}</span>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={submitting} aria-invalid={!!fieldErrors.address} />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">{t('subcity')}</span>
              <Input value={subcity} onChange={(e) => setSubcity(e.target.value)} disabled={submitting} aria-invalid={!!fieldErrors.subcity} />
            </label>

            <div className="md:col-span-2 pt-2">
              <p className="text-xs text-gray-500 italic bg-gray-50 p-3 rounded-lg border border-gray-100">{t('locationNote')}</p>
            </div>

            <div className="md:col-span-2 flex flex-col gap-3 pt-4 border-t border-gray-100">
              <Button type="submit" disabled={submitting} size="lg" className="w-full">
                {submitting ? t('submitting') : t('submit')}
              </Button>
              <Button type="button" variant="ghost" onClick={onLogout} className="w-full text-gray-500">
                {tAuth('logout')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}