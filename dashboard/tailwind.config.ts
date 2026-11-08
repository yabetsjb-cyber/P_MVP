import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6',
          600: '#2563eb', 700: '#1d4ed8',
        },
        danger: { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626' },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
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