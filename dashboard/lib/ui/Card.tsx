import { HTMLAttributes, forwardRef } from 'react';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-surface-card rounded-2xl shadow-soft border border-gray-100 ${className}`}
      {...props}
    />
  )
);
Card.displayName = 'Card';