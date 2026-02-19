import { ComponentChildren, toChildArray, cloneElement } from 'preact';
import type { JSX } from 'preact';
import { forwardRef } from 'preact/compat';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'inverted' | 'danger' | 'outline' | 'link';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  children?: ComponentChildren;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
  style?: JSX.CSSProperties;
  icon?: ComponentChildren;
  iconPosition?: 'left' | 'right';
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';
  'aria-pressed'?: boolean | 'true' | 'false' | 'mixed';
  'aria-expanded'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  'aria-describedby'?: string;
  title?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children,
  className = '',
  type = 'button',
  style,
  icon,
  iconPosition = 'left',
  'aria-current': ariaCurrent,
  'aria-pressed': ariaPressed,
  'aria-expanded': ariaExpanded,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
  title,
  ...rest
}, ref) {
  // Check if this is an icon-only button (no children, only icon)
  const hasChildren = toChildArray(children).length > 0;
  const isIconOnly = !hasChildren && Boolean(icon);
  

  
  // Development-time accessibility warning for icon-only buttons
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && isIconOnly) {
    const hasAccessibleLabel = Boolean(ariaLabel || rest['aria-labelledby'] || title);
    if (!hasAccessibleLabel) {
      console.warn(
        'Button: Icon-only button detected without accessible label. ' +
        'Please add an aria-label, aria-labelledby, or title prop for accessibility.'
      );
    }
  }
  
  const baseClasses = 'inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed border backdrop-blur-xl';
  const variantClasses: Record<ButtonVariant, string> = {
    // Primary: Glass Accent
    primary: 'bg-accent-500/25 backdrop-blur-2xl text-[rgb(var(--accent-foreground))] border-accent-500/40 shadow-lg shadow-accent-500/10 hover:bg-accent-500/40 hover:border-accent-500/60 active:scale-[0.98] transition-all duration-300',
    
    // Secondary: Pure glass with subtle border
    secondary: 'bg-white/5 backdrop-blur-xl text-input-text border-white/10 hover:bg-white/15 hover:border-white/20 active:bg-white/20 shadow-md transition-all duration-300',
    
    // Ghost: Minimal glass, appears on hover
    ghost: 'bg-transparent text-input-text border-transparent hover:bg-white/10 hover:border-white/10 active:bg-white/15 focus:ring-white/20',
    
    // Icon: Same as ghost for icon buttons
    icon: 'bg-transparent text-input-text border-transparent hover:bg-white/10 hover:border-white/10 active:bg-white/15 focus:ring-white/20',
    
    // Inverted: Lighter glass for dark backgrounds
    inverted: 'bg-white/20 backdrop-blur-2xl text-white border-white/30 hover:bg-white/30 hover:border-white/40 active:bg-white/40 focus:ring-white/30 shadow-lg',
    
    // Danger: Translucent red glass
    danger: 'bg-red-500/10 backdrop-blur-xl text-red-400 border-red-500/20 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 active:bg-red-500/30 focus:ring-red-500/50 shadow-sm',
    
    // Outline: Glass with defined border
    outline: 'bg-transparent backdrop-blur-sm text-input-text border-white/20 hover:bg-white/5 hover:border-white/40 active:bg-white/10 focus:ring-white/20 shadow-sm',
    
    // Link: No glass, just text with accent color
    link: 'bg-transparent text-accent-500 border-transparent shadow-none hover:text-accent-400 active:text-accent-600 focus:ring-accent-500/50 hover:underline'
  };
  
  const sizeClasses: Record<ButtonSize, string> = {
    xs: isIconOnly ? 'w-9 h-9 p-0 leading-none text-xs' : 'px-2.5 py-1 text-xs',
    sm: isIconOnly ? 'w-11 h-11 p-0 leading-none text-xs' : 'px-3 py-1.5 text-xs',
    md: isIconOnly ? 'w-11 h-11 p-0 leading-none text-sm' : 'px-4 py-2 text-sm',
    lg: isIconOnly ? 'w-12 h-12 p-0 leading-none text-base' : 'px-6 py-3 text-base',
    icon: isIconOnly ? 'w-10 h-10 p-0 leading-none text-sm' : 'px-3 py-2 text-sm'
  };
  
  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className
  ].filter(Boolean).join(' ');
  
  const renderContent = () => {
    if (isIconOnly) {
      return icon;
    }
    
    if (!icon) {
      return children;
    }
    
    // Helper function to make icon decorative
    const makeIconDecorative = (iconElement: ComponentChildren) => {
      if (typeof iconElement === 'object' && iconElement !== null && 'type' in iconElement) {
        // If it's a Preact element, clone it with decorative attributes
        return cloneElement(iconElement as JSX.Element, { 
          'aria-hidden': 'true', 
          focusable: 'false' 
        });
      }
      // If it's a string or other type, wrap it in a span with decorative attributes
      return <span aria-hidden="true">{iconElement}</span>;
    };
    
    if (iconPosition === 'right') {
      return (
        <>
          {children}
          <span className="ml-2">{makeIconDecorative(icon)}</span>
        </>
      );
    }
    
    return (
      <>
        <span className="mr-2">{makeIconDecorative(icon)}</span>
        {children}
      </>
    );
  };
  
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      style={style}
      aria-current={ariaCurrent}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      {...rest}
    >
      {renderContent()}
    </button>
  );
}); 
