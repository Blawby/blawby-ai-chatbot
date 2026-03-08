import type { ComponentChildren, ComponentChild } from 'preact';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

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
    <div className="flex flex-col gap-1.5 px-5 py-2 group">
      <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder group-hover:text-input-text transition-colors cursor-default">{label}</p>
      {valueNode != null ? (
        <div className="flex min-w-0 flex-1">{valueNode}</div>
      ) : (
        <p className={`truncate text-[14px] ${muted ? 'text-input-placeholder' : 'text-input-text'}`}>
          {hasValue ? value : '—'}
        </p>
      )}
    </div>
  );
};

type InspectorGroupProps = {
  label?: string;
  children: ComponentChildren;
  onToggle?: () => void;
  isOpen?: boolean;
  disabled?: boolean;
};

export const InspectorGroup = ({
  label,
  children,
  onToggle,
  isOpen,
  disabled = false,
}: InspectorGroupProps) => {
  return (
    <div className="mb-1.5">
      {label ? (
        <div className="flex items-center justify-between px-5 pb-0.5 pt-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder/70">
            {label}
          </p>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              disabled={disabled}
              aria-expanded={isOpen}
              aria-label="Toggle group options"
              className={`flex h-7 w-7 items-center justify-center rounded-md text-input-placeholder transition hover:bg-white/[0.08] hover:text-input-text disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'bg-white/[0.08] text-input-text' : ''}`}
            >
              <Cog6ToothIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-visible">
        {children}
      </div>
    </div>
  );
};

type InspectorEditableRowProps = {
  label: string;
  summary?: ComponentChild;
  summaryMuted?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  children?: ComponentChildren;
};

export const InspectorEditableRow = ({
  label,
  summary,
  summaryMuted = false,
  isOpen = false,
  onToggle,
  disabled = false,
  children,
}: InspectorEditableRowProps) => {
  const resolvedSummary = typeof summary === 'string' 
    ? (summary.trim().length > 0 ? summary.trim() : '—')
    : (summary ?? '—');

  return (
    <div className={`px-5 ${label ? 'py-1.5' : 'py-0.5'}`}>
      <div className="flex items-start justify-between gap-1.5 group">
        <div className="min-w-0 flex-1">
          {label ? (
            <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder group-hover:text-input-text transition-colors cursor-default">{label}</p>
          ) : null}
          {!isOpen && (
            <p className={`mt-0.5 truncate text-[14px] ${summaryMuted ? 'text-input-placeholder' : 'text-input-text'} ${onToggle ? 'cursor-pointer' : 'cursor-default'}`} onClick={onToggle}>
              {resolvedSummary}
            </p>
          )}
        </div>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-expanded={isOpen}
            className={`flex-shrink-0 ${label ? '-mt-1' : 'mt-0.5'} inline-flex h-7 w-7 items-center justify-center rounded-md text-input-placeholder transition hover:bg-white/[0.08] hover:text-input-text disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'bg-white/[0.08] text-input-text' : ''}`}
            aria-label={`${isOpen ? 'Close' : 'Open'} ${label} controls`}
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {isOpen && children ? (
        <div className={label ? 'mt-1.5' : 'mt-0'}>
          {children}
        </div>
      ) : null}
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
    <div className="flex flex-col items-center px-5 pb-4 pt-5">
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
    <div className="flex flex-col gap-1.5 px-5 pb-4 pt-5">
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
