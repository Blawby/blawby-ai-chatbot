import { ComponentChildren, toChildArray, cloneElement } from 'preact';
import type { JSX } from 'preact';
import { forwardRef } from 'preact/compat';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'icon'
  | 'inverted'
  | 'danger'
  | 'warning'
  | 'danger-ghost'
  | 'accent-ghost'
  | 'outline'
  | 'link'
  | 'menu-item'
  | 'tab';
type ButtonSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'icon'
  | 'icon-xs'
  | 'icon-sm'
  | 'icon-md'
  | 'icon-lg';

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

  const variantToClass: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    icon: 'btn-icon',
    inverted: 'btn-inverted',
    danger: 'btn-danger',
    warning: 'btn-warning',
    'danger-ghost': 'btn-danger-ghost',
    'accent-ghost': 'btn-accent-ghost',
    outline: 'btn-outline',
    link: 'btn-link',
    'menu-item': 'btn-menu-item',
    tab: 'btn-tab'
  };

  const sizeToClass = (resolvedSize: ButtonSize): string => {
    if (resolvedSize === 'icon') return 'btn-icon-md';
    if (resolvedSize === 'icon-xs') return 'btn-icon-xs';
    if (resolvedSize === 'icon-sm') return 'btn-icon-sm';
    if (resolvedSize === 'icon-md') return 'btn-icon-md';
    if (resolvedSize === 'icon-lg') return 'btn-icon-lg';
    if (isIconOnly) return `btn-icon-${resolvedSize}`;
    return `btn-${resolvedSize}`;
  };

  const hasVariantOverride = /\bbtn-(primary|secondary|ghost|icon|inverted|danger|warning|danger-ghost|accent-ghost|outline|link|menu-item|tab)\b/.test(className);
  const hasSizeOverride = /\bbtn-(xs|sm|md|lg|icon-xs|icon-sm|icon-md|icon-lg)\b/.test(className);

  const classes = [
    'btn',
    hasVariantOverride ? '' : variantToClass[variant],
    hasSizeOverride ? '' : sizeToClass(size),
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
          <span className={variant === 'menu-item' ? '' : 'ml-2'}>{makeIconDecorative(icon)}</span>
        </>
      );
    }
    
    return (
      <>
        <span className={variant === 'menu-item' ? '' : 'mr-2'}>{makeIconDecorative(icon)}</span>
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
