import type { ComponentChildren } from 'preact';

type SkeletonRowProps = {
  wide?: boolean;
};

export const SkeletonRow = ({ wide = false }: SkeletonRowProps) => {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="h-3 w-16 animate-pulse rounded bg-white/[0.07]" />
      <div className={`h-3 ${wide ? 'w-28' : 'w-20'} animate-pulse rounded bg-white/[0.07]`} />
    </div>
  );
};

type InfoRowProps = {
  label: string;
  value?: string;
  valueNode?: ComponentChildren;
  muted?: boolean;
};

export const InfoRow = ({
  label,
  value,
  valueNode,
  muted = false,
}: InfoRowProps) => {
  const hasValue = typeof value === 'string' ? value.trim().length > 0 : false;

  return (
    <div className="flex min-h-[40px] items-center justify-between px-4 py-2.5">
      <p className="w-24 shrink-0 truncate text-[13px] text-input-placeholder">{label}</p>
      {valueNode != null ? (
        <div className="flex min-w-0 flex-1 justify-end">{valueNode}</div>
      ) : (
        <p className={`ml-2 flex-1 truncate text-right text-[13px] ${muted ? 'text-input-placeholder' : 'text-input-text'}`}>
          {hasValue ? value : '—'}
        </p>
      )}
    </div>
  );
};

type InspectorGroupProps = {
  label?: string;
  children: ComponentChildren;
};

export const InspectorGroup = ({ label, children }: InspectorGroupProps) => {
  return (
    <div>
      {label ? (
        <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-widest text-input-placeholder">
          {label}
        </p>
      ) : null}
      <div className="mx-3 overflow-hidden rounded-xl bg-white/[0.04] divide-y divide-white/[0.08]">
        {children}
      </div>
    </div>
  );
};

type InspectorHeaderPersonProps = {
  name: string;
  secondaryLine?: string;
  avatarUrl?: string;
};

export const InspectorHeaderPerson = ({
  name,
  secondaryLine,
  avatarUrl,
}: InspectorHeaderPersonProps) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 0
    ? words.slice(0, 2).map((word) => word[0]).join('')
    : '??').toUpperCase();

  return (
    <div className="flex flex-col items-center px-4 pb-4 pt-5">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/[0.08]">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[18px] font-medium text-input-text">{initials}</span>
        )}
      </div>
      <p className="mt-3 text-[15px] font-semibold text-input-text">{name}</p>
      {secondaryLine ? (
        <p className="mt-0.5 text-[12px] text-input-placeholder">{secondaryLine}</p>
      ) : null}
    </div>
  );
};

type InspectorHeaderEntityProps = {
  chip: string;
  title: string;
  subtitle?: string;
  statusBadge: ComponentChildren;
};

export const InspectorHeaderEntity = ({
  chip,
  title,
  subtitle,
  statusBadge,
}: InspectorHeaderEntityProps) => {
  return (
    <div className="flex flex-col gap-1.5 px-4 pb-4 pt-5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-input-placeholder">{chip}</p>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-input-text">{title}</p>
        <div className="mt-0.5 shrink-0">{statusBadge}</div>
      </div>
      {subtitle ? <p className="text-[12px] text-input-placeholder">{subtitle}</p> : null}
    </div>
  );
};

type InspectorActionProps = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
};

export const InspectorAction = ({
  label,
  onClick,
  destructive = false,
}: InspectorActionProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full py-2.5 text-center text-[13px] font-medium transition-opacity hover:opacity-70 active:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        destructive
          ? 'text-red-400 focus-visible:ring-red-400/50'
          : 'text-accent-400 focus-visible:ring-accent-400/50'
      }`}
    >
      {label}
    </button>
  );
};
