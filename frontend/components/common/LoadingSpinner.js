import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Loading spinner component
 * @param {Object} props
 * @param {string} props.size - Size: sm, md, lg
 * @param {string} props.className - Additional classes
 */
export default function LoadingSpinner({ size = 'md', className }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
    </div>
  );
}
