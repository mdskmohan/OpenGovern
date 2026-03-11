'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * Primary action button. Follows OpenGovern design system.
 * Variants: primary (blue fill), secondary (white border), ghost (no border), danger (red)
 * Sizes: sm (32px), md (36px), lg (40px)
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles = {
  primary:
    'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 hover:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1',
  secondary:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1',
  ghost:
    'bg-transparent text-gray-700 border border-transparent hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1',
  danger:
    'bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1',
};

const sizeStyles = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 outline-none',
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="shrink-0 animate-spin" size={size === 'sm' ? 13 : 14} />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
