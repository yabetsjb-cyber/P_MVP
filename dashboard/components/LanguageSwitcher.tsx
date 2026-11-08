import { useLocale } from '@/context/LocaleContext';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const next = locale === 'en' ? 'am' : 'en';
  const label = locale === 'en' ? 'አማ' : 'EN';
  const nextName = next === 'am' ? 'Amharic' : 'English';

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      title={nextName}
      className="text-sm border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {label}
      <span className="sr-only">{` — switch to ${nextName}`}</span>
    </button>
  );
}