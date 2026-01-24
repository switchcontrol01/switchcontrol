import { Link } from 'wouter';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  linkTo?: string;
  animate?: boolean;
}

const sizeConfig = {
  sm: {
    icon: 'w-10 h-10 md:w-11 md:h-11',
    wordmark: 'h-5 w-[110px] md:h-6 md:w-[130px]',
    gap: 'gap-2.5',
  },
  md: {
    icon: 'w-11 h-11 md:w-[52px] md:h-[52px]',
    wordmark: 'h-6 w-[130px] md:h-7 md:w-[150px]',
    gap: 'gap-3',
  },
  lg: {
    icon: 'w-12 h-12 md:w-[60px] md:h-[60px]',
    wordmark: 'h-7 w-[150px] md:h-8 md:w-[180px]',
    gap: 'gap-3',
  },
  xl: {
    icon: 'w-14 h-14 md:w-16 md:h-16',
    wordmark: 'h-8 w-[170px] md:h-9 md:w-[200px]',
    gap: 'gap-4',
  },
};

export function BrandLogo({ 
  showWordmark = true, 
  size = 'md',
  className,
  linkTo = '/',
  animate = true
}: BrandLogoProps) {
  const config = sizeConfig[size];
  
  const content = (
    <div className={cn(
      'flex items-center transition-all duration-300 group',
      config.gap, 
      className
    )}>
      <div className="relative">
        <div className={cn(
          "absolute inset-0 rounded-xl bg-primary/0 blur-lg transition-all duration-300",
          animate && "group-hover:bg-primary/30 group-hover:blur-xl"
        )} />
        <img 
          src={brand.icon} 
          alt={`${brand.name} logo`}
          className={cn(
            config.icon, 
            'relative rounded-xl object-contain flex-shrink-0 transition-transform duration-300',
            animate && 'group-hover:scale-[1.05]'
          )}
        />
      </div>
      {showWordmark && (
        <img 
          src={brand.wordmark} 
          alt={brand.name}
          className={cn(
            config.wordmark, 
            'object-contain transition-opacity duration-300',
            animate && 'group-hover:opacity-90'
          )}
        />
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link 
        href={linkTo} 
        className="flex items-center py-1"
        data-testid="link-brand-logo"
      >
        {content}
      </Link>
    );
  }

  return content;
}
