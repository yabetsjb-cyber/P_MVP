import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';

/**
 * Called at the top of any authenticated page.
 * - Redirects unauthenticated users to /login with returnTo
 * - Redirects pending users to /pending, suspended to /suspended
 * - Returns the auth state so the page can render user/pharmacy
 */
export function useAuthGuard(require: 'verified' | 'any-authenticated' = 'verified') {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === 'loading') return;

    if (auth.status === 'unauthenticated') {
      router.replace(`/login?returnTo=${encodeURIComponent(router.asPath)}`);
      return;
    }

    if (require === 'verified') {
      if (auth.status === 'pending') router.replace('/pending');
      else if (auth.status === 'suspended' || auth.status === 'rejected') router.replace('/suspended');
      else if (auth.status === 'no-pharmacy') router.replace('/pending');
    }
  }, [auth.status, require, router]);

  return auth;
}