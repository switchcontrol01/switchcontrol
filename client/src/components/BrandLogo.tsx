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
    icon: 'h-7 w-auto md:h-8',
    wordmark: 'h-[18px] w-auto md:h-[22px]',
    gap: 'gap-2',
  },
  md: {
    icon: 'h-7 w-auto md:h-8',
    wordmark: 'h-[18px] w-auto md:h-[22px]',
    gap: 'gap-2 md:gap-2.5',
  },
  lg: {
    icon: 'h-7 w-auto md:h-9',
    wordmark: 'h-[20px] w-auto md:h-[26px]',
    gap: 'gap-2 md:gap-3',
  },
  xl: {
    icon: 'h-10 w-auto md:h-12',
    wordmark: 'h-7 w-auto md:h-9',
    gap: 'gap-3',
  },
};

export function BrandLogo({ 
  showWordmark = true, 
  size = 'md',
  className,
  linkTo = '#/dashboard',
  animate = true
}: BrandLogoProps) {
  const config = sizeConfig[size];
  
  const handleClick = (e: React.MouseEvent) => {
    if (linkTo.startsWith('#')) {
      e.preventDefault();
      window.location.hash = linkTo.replace(/^#/, '');
    }
  };
  
  const content = (
    <div className={cn(
      'flex items-center transition-all duration-300 group',
      config.gap, 
      className
    )}>
      <div className="relative flex-shrink-0">
        <div className={cn(
          "absolute inset-0 rounded-lg bg-primary/0 blur-md transition-all duration-300",
          animate && "group-hover:bg-primary/30 group-hover:blur-lg"
        )} />
        <img 
          src={brand.icon} 
          alt={`${brand.name} logo`}
          className={cn(
            config.icon, 
            'relative rounded-[20%] object-contain flex-shrink-0 transition-transform duration-300',
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
            'object-contain flex-shrink-0 transition-opacity duration-300',
            animate && 'group-hover:opacity-90'
          )}
          style={{ imageRendering: 'auto' }}
        />
      )}
    </div>
  );

  if (linkTo) {
    return (
      <a 
        href={linkTo}
        onClick={handleClick}
        className="flex items-center py-1"
        data-testid="link-brand-logo"
      >
        {content}
      </a>
    );
  }

  return content;
}
