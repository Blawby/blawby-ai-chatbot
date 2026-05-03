import { createContext } from 'preact';
import type { ComponentChildren, FunctionComponent, JSX } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ChevronDown, ChevronRight, ChevronsUpDown, MoreHorizontal, PanelLeft } from 'lucide-preact';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

/**
 * Sidebar — unified primary navigation sidebar.
 * Mirrors the Pencil Component/Desktop Sidebar (`GtRGH`): org switcher, sectioned nav
 * items with optional expandable children, and a user row in the footer.
 *
 * Composition:
 *   <Sidebar activeItemId="matters" onItemActivate={…}>
 *     <Sidebar.Org name="Acme" subtitle="Workspace" logo={…} />
 *     <Sidebar.Section label="Platform">
 *       <Sidebar.Item id="home" icon={Home} label="Home" href="/practice/acme" />
 *       <Sidebar.Item id="matters" icon={ClipboardList} label="Matters" expandable>
 *         <Sidebar.SubItem id="active" label="Active" count={5} />
 *       </Sidebar.Item>
 *     </Sidebar.Section>
 *     <Sidebar.Footer>
 *       <Sidebar.UserRow name="Paul" subtitle="paul@acme.co" avatar={…} />
 *     </Sidebar.Footer>
 *   </Sidebar>
 */

interface SidebarContextValue {
  activeItemId: string | null;
  onItemActivate?: () => void;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({ activeItemId: null, collapsed: false });

export interface SidebarProps {
  /** id of the currently-active top-level or sub item; controls highlight state. */
  activeItemId?: string | null;
  /** Fired after any item is activated (useful to close the mobile drawer). */
  onItemActivate?: () => void;
  /** When true, the sidebar renders as a 64px icon rail. */
  collapsed?: boolean;
  /** Called by Org's panel-left button to toggle between rail and expanded modes. */
  onToggleCollapsed?: () => void;
  /** Width override; defaults to fill the parent (AppShell controls the column width). */
  width?: number | string;
  className?: string;
  children?: ComponentChildren;
}

export const Sidebar: FunctionComponent<SidebarProps> & {
  Org: typeof SidebarOrg;
  Section: typeof SidebarSection;
  Item: typeof SidebarItem;
  SubItem: typeof SidebarSubItem;
  SubGroupLabel: typeof SidebarSubGroupLabel;
  Footer: typeof SidebarFooter;
  UserRow: typeof SidebarUserRow;
  PracticeAreaItem: typeof SidebarPracticeAreaItem;
} = ({ activeItemId = null, onItemActivate, collapsed = false, onToggleCollapsed, width, className, children }) => {
  const ctx = useMemo<SidebarContextValue>(
    () => ({ activeItemId, onItemActivate, collapsed, onToggleCollapsed }),
    [activeItemId, onItemActivate, collapsed, onToggleCollapsed],
  );
  // Collapsed mode: toggle button sticks out half-over the right edge so the user
  // can always grab it. Aside uses overflow-visible to allow the bleed; inner
  // content wrapper handles its own scrolling.
  return (
    <SidebarContext.Provider value={ctx}>
      <aside
        className={cn(
          'relative flex h-full w-full flex-col',
          'bg-[rgb(var(--sidebar-bg))] text-[rgb(var(--sidebar-text))]',
          'border-r border-[rgb(var(--sidebar-border))]',
          className,
        )}
        style={width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}
      >
        <div className={cn('flex h-full min-h-0 flex-col gap-2 overflow-hidden', collapsed ? 'p-2 pt-3' : 'p-3')}>
          {children}
        </div>
        {collapsed && onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            className="absolute right-0 top-4 z-20 flex h-7 w-7 translate-x-1/2 items-center justify-center rounded-md border border-[rgb(var(--sidebar-border))] bg-[rgb(var(--sidebar-bg))] text-[rgb(var(--sidebar-text-secondary))] shadow-md transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-[rgb(var(--sidebar-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
          >
            <Icon icon={PanelLeft} className="h-4 w-4" />
          </button>
        ) : null}
      </aside>
    </SidebarContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Org row
// ---------------------------------------------------------------------------

export interface SidebarOrgProps {
  name: string;
  subtitle?: string;
  /** Pre-rendered logo (Pencil GtRGH: 28×28 cornerRadius 6, accent fill, white initial). */
  logo?: ComponentChildren;
  /** Clicking the org name area (e.g. open org switcher). */
  onClick?: () => void;
  /** Renders a 28×28 collapse button with a panel-left icon. */
  onCollapseClick?: () => void;
  className?: string;
}

const SidebarOrg: FunctionComponent<SidebarOrgProps> = ({ name, subtitle, logo, onClick, onCollapseClick, className }) => {
  const ctx = useContext(SidebarContext);
  const toggleCollapsed = onCollapseClick ?? ctx.onToggleCollapsed;

  if (ctx.collapsed) {
    // The floating toggle button sticks off the right edge (rendered by the Sidebar
    // root); leave the logo on the left so they don't crowd each other.
    return (
      <div className={cn('flex w-full pl-0.5 pt-1', className)}>
        {logo}
      </div>
    );
  }

  const left = (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo}
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-xs font-semibold text-[rgb(var(--sidebar-text))]">{name}</span>
        {subtitle ? (
          <span className="truncate text-[10px] text-[rgb(var(--sidebar-text-secondary))]">{subtitle}</span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={cn('flex w-full items-center justify-between gap-2 rounded-lg p-2', className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center rounded-md text-left transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
        >
          {left}
        </button>
      ) : (
        left
      )}
      {toggleCollapsed ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--sidebar-border))] text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
        >
          <Icon icon={PanelLeft} className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PracticeAreaItem (Pencil GtRGH > paWrap items: colored dot + label + ellipsis)
// ---------------------------------------------------------------------------

export interface SidebarPracticeAreaItemProps {
  label: string;
  /** Hex/rgb fill for the leading 8×8 dot. */
  color: string;
  onClick?: () => void;
  onMore?: () => void;
}

const SidebarPracticeAreaItem: FunctionComponent<SidebarPracticeAreaItemProps> = ({ label, color, onClick, onMore }) => {
  const ctx = useContext(SidebarContext);
  if (ctx.collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="flex h-9 w-full items-center justify-center rounded-lg transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="group flex w-full items-center justify-between rounded-lg px-2.5 py-[9px] text-left">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-xs text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:text-[rgb(var(--sidebar-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          aria-label={`${label} options`}
          className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[rgb(var(--sidebar-text-secondary))] opacity-0 transition-opacity hover:text-[rgb(var(--sidebar-text))] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
        >
          <Icon icon={MoreHorizontal} className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export interface SidebarSectionProps {
  label?: string;
  /** First section in the sidebar uses tighter top padding to match Pencil [12,8,4,8]. */
  first?: boolean;
  className?: string;
  children?: ComponentChildren;
}

const SidebarSection: FunctionComponent<SidebarSectionProps> = ({ label, first = false, className, children }) => {
  const ctx = useContext(SidebarContext);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && !ctx.collapsed ? (
        <div className={cn('px-2 pb-1', first ? 'pt-3' : 'pt-4')}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--sidebar-section-label))]">
            {label}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export interface SidebarItemProps {
  id: string;
  label: string;
  icon?: IconComponent;
  href?: string;
  badge?: number | string | null;
  /** Right-aligned numeric/text count (smaller, no pill background). */
  count?: number | string | null;
  variant?: 'default' | 'danger';
  /** Action items don't navigate; require onClick. */
  isAction?: boolean;
  onClick?: () => void;
  /** Renders a chevron and toggles children visibility. Auto-expands when a child is active. */
  expandable?: boolean;
  /** Initial expanded state (uncontrolled). */
  defaultExpanded?: boolean;
  /** Controlled expanded state. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Optional trailing icon (overrides chevron when set). */
  trailingIcon?: IconComponent;
  children?: ComponentChildren;
}

const SidebarItem: FunctionComponent<SidebarItemProps> = ({
  id,
  label,
  icon,
  href,
  badge,
  count,
  variant = 'default',
  isAction = false,
  onClick,
  expandable = false,
  defaultExpanded,
  expanded: controlledExpanded,
  onExpandedChange,
  trailingIcon,
  children,
}) => {
  const ctx = useContext(SidebarContext);
  const { navigate } = useNavigation();
  const hasChildren = expandable && Boolean(children);
  const isActive = !isAction && ctx.activeItemId === id;
  const isDanger = variant === 'danger';

  const childActiveAuto = useMemo(() => {
    if (!hasChildren || !ctx.activeItemId) return false;
    return childIdsOf(children).includes(ctx.activeItemId);
  }, [children, hasChildren, ctx.activeItemId]);

  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<boolean>(
    defaultExpanded ?? childActiveAuto,
  );
  // Auto-expand when a child becomes the active item (i.e. user navigates INTO the
  // section). Doesn't override manual collapses while staying inside the section.
  const previousChildActiveRef = useRef(childActiveAuto);
  useEffect(() => {
    if (childActiveAuto && !previousChildActiveRef.current) {
      setUncontrolledExpanded(true);
    }
    previousChildActiveRef.current = childActiveAuto;
  }, [childActiveAuto]);

  const isControlled = controlledExpanded !== undefined;
  const isExpanded = hasChildren && (isControlled ? controlledExpanded : uncontrolledExpanded);

  const setExpanded = useCallback(
    (next: boolean) => {
      if (isControlled) onExpandedChange?.(next);
      else setUncontrolledExpanded(next);
    },
    [isControlled, onExpandedChange],
  );

  const handleClick = useCallback(() => {
    if (isAction) {
      if (onClick) {
        onClick();
        ctx.onItemActivate?.();
      }
      return;
    }
    if (hasChildren) {
      setExpanded(!isExpanded);
      if (href) {
        if (onClick) onClick();
        else navigate(href);
        ctx.onItemActivate?.();
      }
      return;
    }
    if (onClick) {
      onClick();
      ctx.onItemActivate?.();
      return;
    }
    if (href) {
      navigate(href);
      ctx.onItemActivate?.();
    }
  }, [isAction, hasChildren, href, onClick, isExpanded, setExpanded, navigate, ctx]);

  // Render the chevron whenever the item is conceptually expandable, even if no
  // children are currently attached (e.g. a different section is active).
  const ResolvedTrailing =
    trailingIcon ??
    (expandable
      ? hasChildren && isExpanded
        ? ChevronDown
        : ChevronRight
      : null);

  if (ctx.collapsed) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        title={label}
        className={cn(
          'relative flex h-9 w-full items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
          isDanger
            ? 'text-red-400 hover:bg-red-500/10'
            : isActive
              ? 'bg-[rgb(var(--sidebar-active-bg))] text-[rgb(var(--sidebar-active-text))]'
              : 'text-[rgb(var(--sidebar-text-secondary))] hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-[rgb(var(--sidebar-text))]',
        )}
      >
        {icon ? <Icon icon={icon} className="h-4 w-4" /> : null}
        {badge != null && badge !== '' ? (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[rgb(var(--sidebar-badge-bg))]" />
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
        title={label}
        className={cn(
          'flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-xs font-normal transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
          isDanger
            ? 'text-red-400 hover:bg-red-500/10'
            : isActive
              ? 'bg-[rgb(var(--sidebar-active-bg))] text-[rgb(var(--sidebar-active-text))]'
              : 'text-[rgb(var(--sidebar-text-secondary))] hover:bg-[rgb(var(--sidebar-hover-bg))]',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ? <Icon icon={icon} className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge != null && badge !== '' ? <SidebarBadge>{badge}</SidebarBadge> : null}
          {count != null && count !== '' ? (
            <span className="text-[11px] font-medium text-[rgb(var(--sidebar-text-secondary))]">{count}</span>
          ) : null}
          {ResolvedTrailing ? <Icon icon={ResolvedTrailing} className="h-3.5 w-3.5 text-[rgb(var(--sidebar-text-secondary))]" /> : null}
        </span>
      </button>
      {hasChildren && isExpanded ? (
        <div className="flex flex-col gap-1">{children}</div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SubItem
// ---------------------------------------------------------------------------

export interface SidebarSubItemProps {
  id: string;
  label: string;
  href?: string;
  count?: number | string | null;
  variant?: 'default' | 'danger';
  isAction?: boolean;
  /** Optional 14px leading icon (Pencil GtRGH settings sub-items). */
  icon?: IconComponent;
  onClick?: () => void;
}

const SidebarSubItem: FunctionComponent<SidebarSubItemProps> = ({
  id,
  label,
  href,
  count,
  variant = 'default',
  isAction = false,
  icon,
  onClick,
}) => {
  const ctx = useContext(SidebarContext);
  const { navigate } = useNavigation();
  const isActive = !isAction && ctx.activeItemId === id;
  const isDanger = variant === 'danger';

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
      ctx.onItemActivate?.();
      return;
    }
    if (!isAction && href) {
      navigate(href);
      ctx.onItemActivate?.();
    }
  }, [onClick, isAction, href, navigate, ctx]);

  // Sub-items are only meaningful when sub-trees are visible — hide in collapsed rail.
  if (ctx.collapsed) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      title={label}
      className={cn(
        'flex w-full items-center justify-between rounded-lg pl-9 pr-2.5 py-[7px] text-left text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
        isDanger
          ? 'text-red-400 hover:bg-red-500/10'
          : isActive
            ? 'bg-[rgb(var(--sidebar-active-bg))] text-[rgb(var(--sidebar-active-text))]'
            : 'text-[rgb(var(--sidebar-text-secondary))] hover:bg-[rgb(var(--sidebar-hover-bg))]',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon ? <Icon icon={icon} className="h-3.5 w-3.5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
      {count != null && count !== '' ? (
        <span className="text-[11px] font-medium">{count}</span>
      ) : null}
    </button>
  );
};

// ---------------------------------------------------------------------------
// SubGroupLabel — small uppercase heading + separator above (Pencil settingsSubItems)
// ---------------------------------------------------------------------------

export interface SidebarSubGroupLabelProps {
  label: string;
  /** First group skips the separator above. */
  first?: boolean;
}

const SidebarSubGroupLabel: FunctionComponent<SidebarSubGroupLabelProps> = ({ label, first = false }) => {
  const ctx = useContext(SidebarContext);
  if (ctx.collapsed) return null;
  return (
    <>
      {first ? null : (
        <div className="px-9 py-1">
          <div className="h-px bg-[rgb(var(--sidebar-divider))]" />
        </div>
      )}
      <div className="pl-9 pr-2.5 pt-2.5 pb-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--sidebar-section-label))]">
          {label}
        </span>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Footer + UserRow
// ---------------------------------------------------------------------------

export interface SidebarFooterProps {
  className?: string;
  children?: ComponentChildren;
}

const SidebarFooter: FunctionComponent<SidebarFooterProps> = ({ className, children }) => (
  <div className={cn('mt-auto flex flex-col gap-1 pt-2', className)}>
    <div className="h-px bg-[rgb(var(--sidebar-divider))]" />
    {children}
  </div>
);

export interface SidebarUserRowProps {
  name: string;
  subtitle?: string;
  avatar?: ComponentChildren;
  onClick?: () => void;
  /** Render with the hover/selected background — e.g. while a menu attached to the row is open. */
  active?: boolean;
  trailingIcon?: IconComponent;
}

const SidebarUserRow: FunctionComponent<SidebarUserRowProps> = ({ name, subtitle, avatar, onClick, active = false, trailingIcon = ChevronsUpDown }) => {
  const ctx = useContext(SidebarContext);

  if (ctx.collapsed) {
    const collapsedClass = cn(
      'flex h-9 w-full items-center justify-center rounded-lg transition-colors',
      active ? 'bg-[rgb(var(--sidebar-hover-bg))]' : null,
    );
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        title={name}
        aria-label={name}
        className={cn(collapsedClass, 'hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50')}
      >
        {avatar}
      </button>
    ) : (
      <div className={collapsedClass}>{avatar}</div>
    );
  }

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        {avatar}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-[rgb(var(--sidebar-text))]">{name}</span>
          {subtitle ? (
            <span className="truncate text-[10px] text-[rgb(var(--sidebar-text-secondary))]">{subtitle}</span>
          ) : null}
        </div>
      </div>
      <Icon icon={trailingIcon} className="h-4 w-4 text-[rgb(var(--sidebar-text-secondary))]" />
    </>
  );

  const baseClass = cn(
    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
    active ? 'bg-[rgb(var(--sidebar-hover-bg))]' : null,
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(baseClass, 'hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50')}
    >
      {content}
    </button>
  ) : (
    <div className={baseClass}>{content}</div>
  );
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Collect the `id`s of every direct SidebarSubItem child (used for auto-expand). */
function childIdsOf(children: ComponentChildren): string[] {
  const ids: string[] = [];
  const visit = (node: ComponentChildren) => {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object' && 'props' in (node as object)) {
      const element = node as JSX.Element & { props?: { id?: string } };
      if (element.props && typeof element.props.id === 'string') {
        ids.push(element.props.id);
      }
    }
  };
  visit(children);
  return ids;
}

const SidebarBadge: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[rgb(var(--sidebar-badge-bg))] px-2 py-[2px] text-[10px] font-semibold leading-none text-[rgb(var(--sidebar-badge-text))]">
    {children}
  </span>
);

Sidebar.Org = SidebarOrg;
Sidebar.Section = SidebarSection;
Sidebar.Item = SidebarItem;
Sidebar.SubItem = SidebarSubItem;
Sidebar.SubGroupLabel = SidebarSubGroupLabel;
Sidebar.Footer = SidebarFooter;
Sidebar.UserRow = SidebarUserRow;
Sidebar.PracticeAreaItem = SidebarPracticeAreaItem;

export default Sidebar;
