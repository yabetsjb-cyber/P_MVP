import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/Button'; // We will reuse or recreate this
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      router.push('/');
    } else {
      setError(res.error?.kind === 'unauthorized' ? 'Invalid email or password' : 'Login failed');
    }
  };

  return (
    <Layout>
      <div className="p-6 pt-12 h-[80vh] flex flex-col justify-center">
        <h1 className="text-2xl font-bold text-brand-600 mb-6">Welcome back</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-danger-600 text-sm bg-danger-50 p-2 rounded-lg">{error}</div>}
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm"
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm"
          />
          <Button type="submit" disabled={loading} className="w-full py-3">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account? <Link href="/register" className="text-brand-600 font-medium">Sign up</Link>
        </p>
      </div>
    </Layout>
  );
}