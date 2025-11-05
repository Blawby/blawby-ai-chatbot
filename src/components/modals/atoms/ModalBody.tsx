import { FunctionComponent } from 'preact';

interface ModalBodyProps {
  children: preact.ComponentChildren;
  maxWidth?: string;
  className?: string;
}

const ModalBody: FunctionComponent<ModalBodyProps> = ({ children, maxWidth = 'max-w-4xl', className }) => {
  return (
    <div className={`p-6 ${maxWidth} mx-auto ${className || ''}`}>{children}</div>
  );
};

export default ModalBody;
