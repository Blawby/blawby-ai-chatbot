import { FunctionComponent } from 'preact';

interface ModalFooterProps {
  children: preact.ComponentChildren;
  className?: string;
}

const ModalFooter: FunctionComponent<ModalFooterProps> = ({ children, className }) => {
  return (
    <div className={`flex justify-end ${className || ''}`}>
      {children}
    </div>
  );
};

export default ModalFooter;
