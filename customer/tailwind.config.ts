import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './context/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#EBF1F0', 100: '#D3E0DD', 500: '#1A5B53', 600: '#0A3832', 700: '#06241F' },
        accent: { 50: '#F6FDE0', 100: '#EAF8AB', 400: '#D1F14A', 500: '#BDE230' },
        surface: { DEFAULT: '#F7F9F8', card: '#FFFFFF' },
        danger: { 50: '#FEF2F2', 500: '#EF4444', 600: '#DC2626' },
        success: { 50: '#ECFDF5', 500: '#10B981', 600: '#059669' },
      },
      borderRadius: { 'xl': '1rem', '2xl': '1.25rem', '3xl': '2rem', 'full': '9999px' },
      boxShadow: {
        'soft': '0 2px 10px -2px rgba(10, 56, 50, 0.05)',
        'float': '0 10px 25px -5px rgba(10, 56, 50, 0.1)',
      },
    },
  },
  plugins: [],
};
export default config;