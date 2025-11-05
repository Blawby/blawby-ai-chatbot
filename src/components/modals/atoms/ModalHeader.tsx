import { FunctionComponent } from 'preact';

interface ModalHeaderProps {
  title: preact.ComponentChildren;
  subtitle?: preact.ComponentChildren;
  className?: string;
}

const ModalHeader: FunctionComponent<ModalHeaderProps> = ({ title, subtitle, className }) => {
  return (
    <div className={`text-left mb-6 ${className || ''}`}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default ModalHeader;
