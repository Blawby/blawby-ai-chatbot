import { FunctionComponent } from 'preact';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

interface ModalHeaderProps {
  title: preact.ComponentChildren;
  subtitle?: preact.ComponentChildren;
  className?: string;
  as?: HeadingTag;
}

const ModalHeader: FunctionComponent<ModalHeaderProps> = ({ title, subtitle, className, as = 'h2' }) => {
  const Heading = as;
  return (
    <div className={`text-left mb-6 ${className || ''}`}>
      <Heading className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {title}
      </Heading>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default ModalHeader;
