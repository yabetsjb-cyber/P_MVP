import { Layout } from '@/components/Layout';
import { Search } from 'lucide-react';

export default function HomePage() {
  return (
    <Layout>
      <div className="p-6 pt-12">
        <h1 className="text-3xl font-bold text-brand-600 mb-2">Find your medicine</h1>
        <p className="text-gray-500 mb-8">Search nearby pharmacies for immediate availability.</p>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="search" 
            placeholder="Search medicine (e.g. Amoxil)" 
            className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-4 py-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>
      </div>
    </Layout>
  );
}