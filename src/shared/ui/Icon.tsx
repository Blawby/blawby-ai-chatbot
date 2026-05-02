import type { ComponentType } from 'preact';

// Use a permissive component type to allow third-party icon components
// IconComponent must be permissive to support third-party icon libraries (any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconComponent = ComponentType<any>;

interface IconProps {
  icon: IconComponent;
  decorative?: boolean;
  className?: string;
  // Icon props must allow arbitrary keys for third-party icon compatibility (any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
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
