import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'pharmacy_owner' | 'pharmacy_staff' | 'platform_admin';
  pharmacyId: string | null;
}

export interface Pharmacy {
  id: string;
  name: string;
  license_no: string;
  license_expires_on: string;
  status: 'pending' | 'verified' | 'suspended' | 'rejected';
  status_reason: string | null;
  phone: string;
  address: string | null;
  subcity: string | null;
  lat: number;
  lng: number;
  created_at: string;
}

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'no-pharmacy'
  | 'pending'
  | 'verified'
  | 'suspended'
  | 'rejected'
  | 'error';

interface AuthState {
  user: User | null;
  pharmacy: Pharmacy | null;
  status: AuthStatus;
  error: ApiError | null;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api<{ user: User }>('/v1/auth/me', { skipAuthRedirect: true }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const pharmacyQuery = useQuery({
    queryKey: ['pharmacy-me'],
    queryFn: () =>
      api<{ pharmacy: Pharmacy; documents: unknown[] }>('/v1/pharmacy/me', {
        skipAuthRedirect: true,
      }),
    enabled: !!meQuery.data?.ok && meQuery.data.data.user.pharmacyId !== null,
    staleTime: 60_000,
    retry: false,
  });

  let status: AuthStatus = 'loading';
  let user: User | null = null;
  let pharmacy: Pharmacy | null = null;
  let error: ApiError | null = null;

  if (meQuery.isLoading) {
    status = 'loading';
  } else if (meQuery.data && !meQuery.data.ok) {
    if (meQuery.data.error.kind === 'unauthorized') status = 'unauthenticated';
    else { status = 'error'; error = meQuery.data.error; }
  } else if (meQuery.data?.ok) {
    user = meQuery.data.data.user;
    if (!user.pharmacyId) status = 'no-pharmacy';
    else if (pharmacyQuery.isLoading) status = 'loading';
    else if (pharmacyQuery.data?.ok) {
      pharmacy = pharmacyQuery.data.data.pharmacy;
      status = pharmacy.status;
    } else if (pharmacyQuery.data && !pharmacyQuery.data.ok) {
      status = 'error';
      error = pharmacyQuery.data.error;
    }
  }

  const logout = async () => {
    await api('/v1/auth/logout', { method: 'POST', skipAuthRedirect: true });
    queryClient.clear();
    if (typeof window !== 'undefined') window.location.replace('/login');
  };

  const refetch = () => {
    void meQuery.refetch();
    void pharmacyQuery.refetch();
  };

  return (
    <AuthContext.Provider value={{ user, pharmacy, status, error, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}