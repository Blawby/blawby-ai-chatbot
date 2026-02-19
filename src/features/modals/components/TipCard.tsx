import { FunctionComponent } from 'preact';
import type { ComponentType, ComponentChildren, JSX } from 'preact';
import { Icon } from '@/shared/ui/Icon';

type IconComponent = ComponentType<JSX.SVGAttributes<SVGSVGElement>>;

interface TipCardProps {
  icon: IconComponent;
  title: ComponentChildren;
  description: ComponentChildren;
}

const TipCard: FunctionComponent<TipCardProps> = ({ icon: IconComp, title, description }) => {
  return (
    <div className="text-left glass-panel p-4">
      <div className="w-12 h-12 rounded-full bg-accent-500/10 flex items-center justify-center mb-4 text-[rgb(var(--accent-foreground))]">
        <Icon icon={IconComp} className="h-6 w-6" />
      </div>
      <h4 className="text-lg font-semibold text-input-text mb-2">
        {title}
      </h4>
      <p className="text-sm text-input-placeholder">
        {description}
      </p>
    </div>
  );
};

export default TipCard;
