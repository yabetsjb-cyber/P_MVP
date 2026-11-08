import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is freshest at mount, then re-fetched only on explicit invalidate.
        // The reservations page overrides this with its own refetchInterval.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error: any) => {
          // Never retry auth/permission/validation errors
          if (error?.kind === 'unauthorized') return false;
          if (error?.kind === 'forbidden') return false;
          if (error?.kind === 'validation') return false;
          if (error?.kind === 'not_found') return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}