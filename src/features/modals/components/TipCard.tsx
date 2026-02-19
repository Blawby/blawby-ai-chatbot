import { FunctionComponent } from 'preact';

type IconComponent = preact.ComponentType<preact.JSX.SVGAttributes<SVGSVGElement>>;

interface TipCardProps {
  icon: IconComponent;
  title: preact.ComponentChildren;
  description: preact.ComponentChildren;
}

const TipCard: FunctionComponent<TipCardProps> = ({ icon: Icon, title, description }) => {
  return (
    <div className="text-left glass-panel p-4">
      <div className="w-12 h-12 rounded-full bg-accent-500/10 flex items-center justify-center mb-4 text-accent-400">
        <Icon className="h-6 w-6" />
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
