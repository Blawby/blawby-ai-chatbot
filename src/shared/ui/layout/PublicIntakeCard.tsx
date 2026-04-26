import { FunctionComponent, type ComponentChildren } from 'preact';

export const PublicIntakeCard: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <div className="intake-card-container min-h-screen bg-surface-app-frame p-4 md:p-8 flex items-center justify-center">
    <div className="intake-card relative mx-auto max-w-2xl w-full bg-surface-workspace rounded-2xl shadow-glass md:mt-8 min-h-[600px] md:min-h-[700px] overflow-hidden">
      {children}
    </div>
  </div>
);

export default PublicIntakeCard;
