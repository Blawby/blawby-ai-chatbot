interface NotificationDotProps {
  show: boolean;
  className?: string;
}

export const NotificationDot = ({ show, className = '' }: NotificationDotProps) => {
  if (!show) return null;
  return (
    <span
      className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent-500 ${className}`}
      aria-hidden="true"
    />
  );
};
