import { Warning, X } from '@phosphor-icons/react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[2px]">
      <div className="bg-[#FFFFFF] border border-[#EAE4DC] w-full max-w-sm rounded-2xl p-5 shadow-lg flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${isDestructive ? 'bg-[#FDF2F2] text-[#C45E5E]' : 'bg-[#FCF7ED] text-[#C48A3F]'}`}>
              <Warning size={22} weight="bold" />
            </div>
            <h3 className="font-semibold text-base text-[#2D2824] leading-tight">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-[#79716B] hover:text-[#2D2824] p-1 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[#79716B] leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#79716B] bg-[#F6F2EB] hover:bg-[#EAE4DC] rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${
              isDestructive
                ? 'bg-[#C45E5E] hover:bg-[#A34343]'
                : 'bg-[#D97757] hover:bg-[#C86243]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
