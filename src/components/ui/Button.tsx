import { ComponentChildren, toChildArray, cloneElement } from 'preact';
import type { JSX } from 'preact';
import { forwardRef } from 'preact/compat';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

interface ButtonProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children?: ComponentChildren;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
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
  
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed border transition-shadow';
  
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-accent-500 text-gray-900 hover:bg-accent-600 active:bg-accent-700 focus:ring-accent-500 border-accent-500 shadow-sm hover:shadow',
    secondary: 'bg-transparent text-gray-900 dark:text-white border-gray-300 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/5 focus:ring-gray-200 dark:focus:ring-white/20',
    ghost: 'bg-transparent text-gray-900 dark:text-white border-transparent hover:bg-gray-100 dark:hover:bg-white/5 focus:ring-gray-200 dark:focus:ring-white/20',
    icon: 'bg-transparent text-gray-900 dark:text-white border-transparent hover:bg-gray-100 dark:hover:bg-white/5 focus:ring-gray-200 dark:focus:ring-white/20',
  };
  
  const sizeClasses = {
    sm: isIconOnly ? 'w-11 h-11 p-0 leading-none rounded-full' : 'px-3 py-1.5 text-xs rounded-lg',
    md: isIconOnly ? 'w-11 h-11 p-0 leading-none rounded-full' : 'px-4 py-2 text-sm rounded-lg',
    lg: isIconOnly ? 'w-12 h-12 p-0 leading-none rounded-full' : 'px-6 py-3 text-base rounded-lg',
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