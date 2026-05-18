import { FunctionComponent } from 'preact';
import ToastComponent, { Toast } from './Toast';
import { THEME } from '@/shared/utils/constants';

interface ToastContainerProps {
  toasts: Toast[];
  onRemoveToast: (id: string) => void;
}

const ToastContainer: FunctionComponent<ToastContainerProps> = ({ toasts, onRemoveToast }) => {
  return (
    <div className="fixed top-4 right-4 space-y-2" style={{ zIndex: THEME.zIndex.modal + 50 }}>
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onRemove={onRemoveToast}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
