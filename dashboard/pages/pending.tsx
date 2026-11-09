import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Addis Ababa center. Per Step 11.1c decision D, this is pre-filled for every
// new pharmacy. Admin confirms/corrects the exact location in Step 14.
const DEFAULT_LAT = 9.0107;
const DEFAULT_LNG = 38.7869;

export default function PendingPage() {
  const t = useTranslations('verification');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { pharmacy, status, logout, refetch } = useAuth();

  // Defensive redirects. /pending is only valid for 'no-pharmacy' and 'pending'.
  useEffect(() => {
    if (status === 'verified') router.replace('/reservations');
    else if (status === 'suspended' || status === 'rejected') router.replace('/suspended');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">{tCommon('loading')}</p>
      </div>
    );
  }

  if (status === 'no-pharmacy') {
    return <CreatePharmacyForm onCreated={refetch} onLogout={logout} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">{t('pendingTitle')}</h1>
        <p className="text-sm text-gray-600">{t('pendingBody')}</p>
        {pharmacy && (
          <p className="text-sm font-medium text-gray-700">{pharmacy.name}</p>
        )}
        <button
          onClick={logout}
          className="text-sm text-brand-600 hover:underline"
        >
          {tAuth('logout')}
        </button>
      </div>
    </div>
  );
}

function CreatePharmacyForm({
  onCreated,
  onLogout,
}: {
  onCreated: () => void;
  onLogout: () => void;
}) {
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
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await api('/v1/pharmacy/register', {
      method: 'POST',
      body: {
        name,
        licenseNo,
        licenseExpiresOn,
        phone,
        address: address.trim() === '' ? undefined : address.trim(),
        subcity: subcity.trim() === '' ? undefined : subcity.trim(),
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
      },
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.error.kind === 'validation') {
        setFieldErrors(result.error.fields);
      } else if (
        result.error.kind === 'conflict' &&
        result.error.code === 'LICENSE_ALREADY_REGISTERED'
      ) {
        setFieldErrors({ licenseNo: t('licenseInUse') });
      } else if (
        result.error.kind === 'conflict' &&
        result.error.code === 'ALREADY_HAS_PHARMACY'
      ) {
        // User already created one in another tab — refetch will pick it up
        onCreated();
      } else {
        setError(result.error);
      }
      return;
    }

    onCreated();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-white rounded-lg shadow-sm border p-6 space-y-4"
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

        <TextField
          label={t('name')}
          value={name}
          onChange={setName}
          disabled={submitting}
          error={fieldErrors.name}
          required
        />
        <TextField
          label={t('licenseNo')}
          value={licenseNo}
          onChange={setLicenseNo}
          disabled={submitting}
          error={fieldErrors.licenseNo}
          required
        />
        <TextField
          label={t('licenseExpiresOn')}
          type="date"
          value={licenseExpiresOn}
          onChange={setLicenseExpiresOn}
          disabled={submitting}
          error={fieldErrors.licenseExpiresOn}
          hint={t('licenseExpiresHint')}
          min={today}
          required
        />
        <TextField
          label={t('phone')}
          type="tel"
          value={phone}
          onChange={setPhone}
          disabled={submitting}
          error={fieldErrors.phone}
          hint={t('phoneHint')}
          required
        />
        <TextField
          label={t('address')}
          value={address}
          onChange={setAddress}
          disabled={submitting}
          error={fieldErrors.address}
        />
        <TextField
          label={t('subcity')}
          value={subcity}
          onChange={setSubcity}
          disabled={submitting}
          error={fieldErrors.subcity}
        />

        <p className="text-xs text-gray-500 italic">{t('locationNote')}</p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 text-white rounded py-2 font-medium disabled:opacity-50 hover:bg-brand-700"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full text-sm text-gray-600 hover:underline"
        >
          {tAuth('logout')}
        </button>
      </form>
    </div>
  );
}

function TextField({
  label,
  type = 'text',
  value,
  onChange,
  disabled,
  error,
  hint,
  min,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  error?: string;
  hint?: string;
  min?: string;
  required?: boolean;
}) {
  const id = `cp-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const errId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        min={min}
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