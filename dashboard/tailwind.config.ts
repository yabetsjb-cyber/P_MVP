import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The Pharmly Deep Green
        brand: {
          50: '#EBF1F0',
          100: '#D3E0DD',
          500: '#1A5B53',
          600: '#0A3832', // Primary sidebar / dark text
          700: '#06241F',
        },
        // The Pharmly Lime Accent
        accent: {
          50: '#F6FDE0',
          100: '#EAF8AB',
          400: '#D1F14A', // Primary buttons / highlights
          500: '#BDE230',
        },
        // Backgrounds
        surface: {
          DEFAULT: '#F4F7F6', // Main app background
          card: '#FFFFFF',
        },
        // Status colors matching the image
        danger: { 50: '#FEF2F2', 500: '#EF4444', 600: '#DC2626' },
        success: { 50: '#ECFDF5', 500: '#10B981', 600: '#059669' },
        warning: { 50: '#FFFBEB', 500: '#F59E0B', 600: '#D97706' },
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 2px 10px -2px rgba(10, 56, 50, 0.05)',
        'float': '0 10px 25px -5px rgba(10, 56, 50, 0.1)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        amharic: ['"Noto Sans Ethiopic"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;