import { FunctionComponent } from 'preact';

interface RadioIndicatorProps {
  isSelected: boolean;
  className?: string;
}

export const RadioIndicator: FunctionComponent<RadioIndicatorProps> = ({ isSelected, className = '' }) => {
  return (
    <div className={`w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center ${className}`}>
      {isSelected && (
        <div className="w-3 h-3 bg-accent-500 rounded-full" />
      )}
    </div>
  );
};





