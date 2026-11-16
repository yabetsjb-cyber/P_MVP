import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    const variants = {
      primary: 'bg-accent-400 text-brand-700 hover:bg-accent-500 focus:ring-accent-400',
      secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 focus:ring-gray-200 shadow-sm',
      danger: 'bg-danger-600 text-white hover:bg-danger-500 focus:ring-danger-500',
      ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-200',
    };
    const sizes = {
      sm: 'text-xs px-3 py-1.5',
      md: 'text-sm px-4 py-2',
      lg: 'text-base px-6 py-3',
    };
    return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
  },
);
Button.displayName = 'Button';