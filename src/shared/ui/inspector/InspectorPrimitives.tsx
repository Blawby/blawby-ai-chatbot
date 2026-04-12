import type { ComponentChildren, ComponentChild, ComponentType } from 'preact';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { Avatar } from '../profile/atoms/Avatar';

type InfoRowProps = {
  label: string;
  value?: string;
  valueNode?: ComponentChildren;
  muted?: boolean;
  icon?: ComponentType<{ className?: string }>;
};

export const InfoRow = ({
  label,
  value,
  valueNode,
  muted = false,
  icon: IconComponent,
}: InfoRowProps) => {
  const hasValue = typeof value === 'string' ? value.trim().length > 0 : false;

  return (
    <div className="flex flex-col gap-1.5 px-5 py-2 group">
      <div className="flex items-center gap-1.5">
        {IconComponent && (
          <IconComponent className="h-3 w-3 text-input-placeholder/70 group-hover:text-input-text transition-colors" />
        )}
        <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder/90 group-hover:text-input-text transition-colors cursor-default">{label}</p>
      </div>
      {valueNode != null ? (
        <div className="flex min-w-0 flex-1">{valueNode}</div>
      ) : (
        <p className={`truncate text-[14px] ${muted ? 'text-input-placeholder/60' : 'text-input-text'}`}>
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
          <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder/90">
            {label}
          </p>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              disabled={disabled}
              aria-expanded={isOpen}
              aria-label="Toggle group options"
              className={`flex h-7 w-7 items-center justify-center rounded-md text-input-placeholder transition hover:bg-surface-app-frame/60 dark:hover:bg-white/[0.1] hover:text-input-text disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'bg-surface-app-frame/60 dark:bg-white/[0.1] text-input-text' : ''}`}
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
  const summaryIsString = typeof resolvedSummary === 'string';

  return (
    <div className={`px-5 ${label ? 'py-1.5' : 'py-0.5'}`}>
      <div className="flex items-start justify-between gap-1.5 group">
        <div className="min-w-0 flex-1">
          {label ? (
            <p className="text-[11px] font-bold uppercase tracking-wider text-input-placeholder/90 group-hover:text-input-text transition-colors cursor-default">{label}</p>
          ) : null}
          {!isOpen && (
            summaryIsString ? (
              <p className={`mt-0.5 truncate text-[14px] ${summaryMuted ? 'text-input-placeholder/60' : 'text-input-text'} cursor-default`}>
                {resolvedSummary}
              </p>
            ) : (
              <div className={`mt-0.5 min-w-0 cursor-default text-[14px] ${summaryMuted ? 'text-input-placeholder/60' : 'text-input-text'}`}>
                {resolvedSummary}
              </div>
            )
          )}
        </div>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-expanded={isOpen}
            className={`flex-shrink-0 ${label ? '-mt-1' : 'mt-0.5'} inline-flex h-7 w-7 items-center justify-center rounded-md text-input-placeholder transition hover:bg-surface-app-frame/60 dark:hover:bg-white/[0.1] hover:text-input-text disabled:cursor-not-allowed disabled:opacity-50 ${isOpen ? 'bg-surface-app-frame/60 dark:bg-white/[0.1] text-input-text' : ''}`}
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
  return (
    <div className="flex flex-col items-center px-5 pb-4 pt-5">
      <Avatar 
        src={avatarUrl} 
        name={name} 
        size="xl" 
        className="h-14 w-14"
        bgClassName="bg-surface-app-frame/60 dark:bg-white/[0.08]"
      />
      <p className="mt-3 text-[15px] font-semibold text-input-text">{name}</p>
      {secondaryLine ? (
        <p className="mt-0.5 text-[12px] text-input-placeholder">{secondaryLine}</p>
      ) : null}
    </div>
  );
};

type InspectorHeaderHeroProps = {
  name: string;
  avatarUrl?: string;
  subtitle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export const InspectorHeaderHero = ({
  name,
  avatarUrl,
  subtitle,
  email,
  phone,
  website,
}: InspectorHeaderHeroProps) => {
  const normalizeUrl = (url: string) => {
    if (url.startsWith('tel:') || url.startsWith('mailto:')) return url;
    if (!/^https?:\/\//i.test(url)) return `https://${url}`;
    return url;
  };

  const isValidWebsiteUrl = (url: string) => {
    try {
      if (url.startsWith('tel:') || url.startsWith('mailto:')) return true;
      const normalized = normalizeUrl(url);
      const parsed = new URL(normalized);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const handleAction = (url: string) => {
    const normalized = normalizeUrl(url);
    if (!isValidWebsiteUrl(normalized)) return;
    const w = window.open(normalized, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-accent-500/15 via-accent-500/5 to-transparent dark:from-indigo-500/10 dark:via-purple-500/5 dark:to-transparent">
      <div className="absolute inset-0 bg-gradient-to-t from-surface-utility/40 via-transparent to-surface-workspace/15 dark:from-surface-base/10 dark:via-transparent dark:to-white/5" />
      <div className="relative flex flex-col items-center px-5 pb-8 pt-10 text-center">
        {/* Avatar */}
        <div className="relative">
          <Avatar 
            src={avatarUrl} 
            name={name} 
            size="xl" 
            className="h-24 w-24"
            bgClassName="bg-surface-workspace/10 shadow-2xl ring-1 ring-white/10 ring-inset"
          />
          <div className="absolute inset-0 rounded-full border border-surface-workspace/10 pointer-events-none" />
        </div>

        {/* Name & Description */}
        <div className="mt-6 min-w-0 max-w-full">
          <h3 className="text-2xl font-bold tracking-tight text-input-text dark:text-white">{name}</h3>
          {subtitle ? (
            <p className="mt-2 text-[13px] leading-relaxed text-input-placeholder dark:text-white/70 line-clamp-3 px-2">{subtitle}</p>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {phone && (
            <button
              type="button"
              aria-label="Call phone number"
              onClick={() => handleAction(`tel:${phone}`)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/10 dark:bg-white/10 text-accent-600 dark:text-white/80 transition hover:bg-accent-500/20 dark:hover:bg-white/20 hover:text-accent-700 dark:hover:text-white"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.954l-1.293.97a15.045 15.045 0 006.512 6.512l.97-1.293a1.875 1.875 0 011.954-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" />
              </svg>
            </button>
          )}
          {email && (
            <button
              type="button"
              aria-label="Send email"
              onClick={() => handleAction(`mailto:${email}`)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/10 dark:bg-white/10 text-accent-600 dark:text-white/80 transition hover:bg-accent-500/20 dark:hover:bg-white/20 hover:text-accent-700 dark:hover:text-white"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
              </svg>
            </button>
          )}
          {website && (
            <button
              type="button"
              aria-label="Open website"
              onClick={() => handleAction(website)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/10 dark:bg-white/10 text-accent-600 dark:text-white/80 transition hover:bg-accent-500/20 dark:hover:bg-white/20 hover:text-accent-700 dark:hover:text-white"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0c0 .094.001.187.003.28a7.11 7.11 0 011.494 0c.002-.093.003-.186.003-.28zM8.048 6.5a.75.75 0 00-1.23-.86 7.111 7.111 0 011.034 1.144c.057-.091.114-.183.175-.275.006-.01.013-.018.021-.028.001-.001.001-.001.001-.001zM17.182 5.64a.75.75 0 00-1.23.86c.07.106.136.213.197.323l.001.001a7.126 7.126 0 011.032-1.184zM12 18.75a6.721 6.721 0 01-3.644-1.066.75.75 0 10-.806 1.265A8.221 8.221 0 0012 20.25a8.221 8.221 0 004.45-1.299.75.75 0 10-.806-1.265A6.721 6.721 0 0112 18.75z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </section>
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
      <p className="text-[10px] font-medium uppercase tracking-widest text-input-placeholder/90">{chip}</p>
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
