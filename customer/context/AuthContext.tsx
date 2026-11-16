import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Customer {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
}

interface AuthContextType {
  customer: Customer | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: any }>;
  register: (data: any) => Promise<{ ok: boolean; error?: any }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['customer-me'],
    queryFn: () => api<{ customer: Customer }>('/v1/customer/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const login = async (email: string, password: string) => {
    const res = await api('/v1/customer/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceName: 'Web App' }),
    });
    if (res.ok) {
      await meQuery.refetch();
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const register = async (data: any) => {
    const res = await api('/v1/customer/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await meQuery.refetch();
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const logout = async () => {
    await api('/v1/customer/auth/logout', { method: 'POST' });
    queryClient.clear();
  };

  const status = meQuery.isLoading ? 'loading' : meQuery.data?.ok ? 'authenticated' : 'unauthenticated';

  return (
    <AuthContext.Provider value={{ customer: meQuery.data?.ok ? meQuery.data.data.customer : null, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext)!;