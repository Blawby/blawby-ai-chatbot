import type { ComponentType, JSX } from 'preact';
type IconComponent = ComponentType<JSX.SVGAttributes<SVGSVGElement>>;

interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
  icon: IconComponent;
  decorative?: boolean;
}

export const Icon = ({
  icon: IconComponent,
  decorative = true,
  className,
  ...rest
}: IconProps) => {
  const resolvedClassName = typeof className === 'string' ? className : undefined;
  return (
    <IconComponent
      className={resolvedClassName ? `shrink-0 ${resolvedClassName}` : 'shrink-0'}
      aria-hidden={decorative ? 'true' : undefined}
      focusable={decorative ? 'false' : undefined}
      {...rest}
    />
  );
};
