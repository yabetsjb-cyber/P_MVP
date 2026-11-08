import { AppShell } from '@/components/AppShell';
import { useAuthGuard } from '@/lib/useAuthGuard';

export default function ImportPage() {
  const auth = useAuthGuard();
  if (auth.status !== 'verified') return null;
  return (
    <AppShell>
      <h1 className="text-lg font-semibold mb-4">Import</h1>
      <p className="text-sm text-gray-500">CSV import lands in Step 11.4.</p>
    </AppShell>
  );
}