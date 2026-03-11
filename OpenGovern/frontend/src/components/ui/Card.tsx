'use client';

import React from 'react';
import { cn } from './cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-lg',
        'shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
        onClick && 'cursor-pointer hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow duration-150',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-gray-100', className)}>
      {children}
    </div>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn('px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg', className)}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('p-6', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {trend && (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                trend.value >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {trend.value >= 0 ? '+' : ''}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        )}
      </div>
    </Card>
  );
}
