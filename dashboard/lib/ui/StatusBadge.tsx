import { HTMLAttributes } from 'react';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'success' | 'warning' | 'danger' | 'neutral';
}

export function StatusBadge({ status, className = '', children, ...props }: StatusBadgeProps) {
  const styles = {
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
    neutral: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}