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
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && (
          <p className="text-sm text-dim-2">{subtitle}</p>
        )}
      </div>
      {sections.map((section) => (
        <div
          key={section.title}
          className="card p-5 space-y-2"
        >
          <div>
            <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
            {section.description && (
              <p className="text-sm text-dim-2">{section.description}</p>
            )}
          </div>
          {section.content ?? (
            <p className="text-xs text-dim-2">{placeholderNote}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);
