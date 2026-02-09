import type { ComponentChildren } from 'preact';

interface PlaceholderSection {
  title: string;
  description?: string;
  content?: ComponentChildren;
}

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  sections: PlaceholderSection[];
}

const placeholderNote = 'Stripe component will render here once backend provides account sessions.';

export const PlaceholderPage = ({ title, subtitle, sections }: PlaceholderPageProps) => (
  <div className="h-full overflow-y-auto p-6">
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {sections.map((section) => (
        <div
          key={section.title}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-5 space-y-2"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{section.title}</h2>
            {section.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{section.description}</p>
            )}
          </div>
          {section.content ?? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{placeholderNote}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);
