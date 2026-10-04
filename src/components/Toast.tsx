import { CheckCircle, WarningCircle, XCircle, Info, X } from '@phosphor-icons/react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  description?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        let bg = 'bg-[#FAF8F5]';
        let border = 'border-[#EAE4DC]';
        let icon = <Info size={20} className="text-[#5D7CB0]" weight="bold" />;

        if (toast.type === 'success') {
          bg = 'bg-[#EEF6F1]';
          border = 'border-[#C8E2D4]';
          icon = <CheckCircle size={20} className="text-[#548A70]" weight="bold" />;
        } else if (toast.type === 'warning') {
          bg = 'bg-[#FCF7ED]';
          border = 'border-[#F3E0BD]';
          icon = <WarningCircle size={20} className="text-[#C48A3F]" weight="bold" />;
        } else if (toast.type === 'error') {
          bg = 'bg-[#FDF2F2]';
          border = 'border-[#F7CDCD]';
          icon = <XCircle size={20} className="text-[#C45E5E]" weight="bold" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-sm ${bg} ${border} text-[#2D2824] transition-all`}
          >
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{toast.message}</p>
              {toast.description && (
                <p className="text-xs text-[#79716B] mt-0.5 leading-snug">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-[#79716B] hover:text-[#2D2824] p-1 rounded-md transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
