import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { PageHead } from '@/components/PageHead';

export default function IndexPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'pending' || status === 'no-pharmacy') router.replace('/pending');
    else if (status === 'suspended' || status === 'rejected') router.replace('/suspended');
    else if (status === 'verified') router.replace('/reservations');
    else if (status === 'error') router.replace('/login');
  }, [status, router]);

  return (
    <>
      <PageHead title="Loading" />
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-brand-600">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <h1 className="text-xl font-bold">MedFinder</h1>
      </div>
    </>
  );
}