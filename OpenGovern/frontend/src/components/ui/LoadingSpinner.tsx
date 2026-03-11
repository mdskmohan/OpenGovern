'use client';

import { Loader2 } from 'lucide-react';
import { cn } from './cn';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({
  size = 24,
  className,
  fullScreen = false,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
        <Loader2 size={size} className={cn('animate-spin text-blue-600', className)} />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Loader2 size={size} className="animate-spin text-blue-600" />
    </div>
  );
}
