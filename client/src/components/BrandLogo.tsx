import { Link } from 'wouter';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  showWordmark?: boolean;
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  linkTo?: string;
}

const iconSizes = {
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-10',
};

export function BrandLogo({ 
  showWordmark = true, 
  iconSize = 'md',
  className,
  linkTo = '/'
}: BrandLogoProps) {
  const content = (
    <div className={cn('flex items-center gap-2', className)}>
      <img 
        src={brand.icon} 
        alt={`${brand.name} logo`}
        className={cn(iconSizes[iconSize], 'rounded-lg object-contain')}
      />
      {showWordmark && (
        <img 
          src={brand.wordmark} 
          alt={brand.name}
          className="h-5 object-contain"
        />
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link href={linkTo} className="flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}
