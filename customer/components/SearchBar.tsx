import { Search, X, Loader2 } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  isLoading: boolean;
}

export function SearchBar({ value, onChange, isLoading }: SearchBarProps) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
      </div>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search medicine (e.g. Amoxil)"
        className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-10 py-4 text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-400"
        aria-label="Search medicine"
      />
      {value && !isLoading && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}