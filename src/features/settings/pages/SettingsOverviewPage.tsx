import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  LifeBuoy,
  Palette,
  Puzzle,
  Shield,
  User,
  Users,
} from 'lucide-preact';
import type { FunctionComponent } from 'preact';

import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';

type OverviewCard = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: IconComponent;
};

type OverviewGroup = {
  label: string;
  cards: OverviewCard[];
};

const buildGroups = (basePath: string, canAccessPractice: boolean): OverviewGroup[] => {
  const groups: OverviewGroup[] = [
    {
      label: 'Personal',
      cards: [
        {
          id: 'general',
          label: 'Appearance',
          description: 'Theme, language, and spoken language preferences.',
          href: `${basePath}/general`,
          icon: Palette,
        },
        {
          id: 'notifications',
          label: 'Notifications',
          description: 'Email and push channel preferences.',
          href: `${basePath}/notifications`,
          icon: Bell,
        },
      ],
    },
    {
      label: 'Account',
      cards: [
        {
          id: 'security',
          label: 'Security',
          description: 'Password, 2FA, and active sessions.',
          href: `${basePath}/security`,
          icon: Shield,
        },
        {
          id: 'account',
          label: 'Profile',
          description: 'Name, email, and account deletion.',
          href: `${basePath}/account`,
          icon: User,
        },
      ],
    },
  ];

  if (canAccessPractice) {
    groups.push({
      label: 'Practice',
      cards: [
        {
          id: 'practice',
          label: 'Practice',
          description: 'Firm name, branding, and public profile.',
          href: `${basePath}/practice`,
          icon: Building2,
        },
        {
          id: 'practice-payouts',
          label: 'Payouts',
          description: 'Stripe connection and payout cadence.',
          href: `${basePath}/practice/payouts`,
          icon: CreditCard,
        },
        {
          id: 'practice-team',
          label: 'Team',
          description: 'Members, roles, and invitations.',
          href: `${basePath}/practice/team`,
          icon: Users,
        },
        {
          id: 'intake-forms',
          label: 'Intake Forms',
          description: 'Custom intake templates and questions.',
          href: `${basePath}/intake-forms`,
          icon: FileText,
        },
        {
          id: 'apps',
          label: 'Apps',
          description: 'Connected integrations and apps.',
          href: `${basePath}/apps`,
          icon: Puzzle,
        },
      ],
    });
  }

  groups.push({
    label: 'Support',
    cards: [
      {
        id: 'help',
        label: 'Help',
        description: 'Documentation and contact support.',
        href: `${basePath}/help`,
        icon: LifeBuoy,
      },
    ],
  });

  return groups;
};

type SettingsOverviewPageProps = {
  basePath: string;
  canAccessPractice: boolean;
  className?: string;
};

export const SettingsOverviewPage: FunctionComponent<SettingsOverviewPageProps> = ({
  basePath,
  canAccessPractice,
  className,
}) => {
  const { navigate } = useNavigation();
  const groups = buildGroups(basePath, canAccessPractice);

  return (
    <div className={cn('space-y-10', className)}>
      <div>
        <h1 className="text-2xl font-semibold text-input-text">Settings</h1>
        <p className="mt-1 text-sm text-input-placeholder">
          Manage your account, preferences, and{canAccessPractice ? ' practice configuration.' : ' notifications.'}
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-input-placeholder">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => navigate(card.href)}
                className="group flex items-start gap-3 rounded-xl border border-line-glass/30 bg-surface-overlay/60 px-4 py-3 text-left transition-colors hover:bg-surface-utility/20"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-utility/30">
                  <Icon icon={card.icon} className="h-5 w-5 text-input-placeholder" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-input-text">{card.label}</p>
                  <p className="mt-0.5 text-xs text-input-placeholder">{card.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default SettingsOverviewPage;
