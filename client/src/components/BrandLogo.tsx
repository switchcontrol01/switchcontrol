import { Link } from 'wouter';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  linkTo?: string;
}

const sizeConfig = {
  sm: {
    icon: 'w-8 h-8',
    wordmark: 'h-5 w-[110px]',
    gap: 'gap-2',
  },
  md: {
    icon: 'w-9 h-9',
    wordmark: 'h-6 w-[140px]',
    gap: 'gap-2.5',
  },
  lg: {
    icon: 'w-10 h-10',
    wordmark: 'h-7 w-[160px]',
    gap: 'gap-3',
  },
};

export function BrandLogo({ 
  showWordmark = true, 
  size = 'md',
  className,
  linkTo = '/'
}: BrandLogoProps) {
  const config = sizeConfig[size];
  
  const content = (
    <div className={cn('flex items-center', config.gap, className)}>
      <img 
        src={brand.icon} 
        alt={`${brand.name} logo`}
        className={cn(config.icon, 'rounded-lg object-contain flex-shrink-0')}
      />
      {showWordmark && (
        <img 
          src={brand.wordmark} 
          alt={brand.name}
          className={cn(config.wordmark, 'object-contain')}
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
