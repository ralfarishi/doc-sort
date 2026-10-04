import React, { useEffect } from 'react';
import { X } from '@phosphor-icons/react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
}) => {
  // Prevent background scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
      />

      {/* Sheet Content */}
      <div className="relative z-10 w-full max-h-[85vh] bg-[#FFFFFF] border-t border-[#EAE4DC] rounded-t-3xl shadow-xl flex flex-col animate-in slide-in-from-bottom duration-200">
        {/* Pull Handle Indicator */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#DCD3C7]" />
        </div>

        {/* Sheet Header */}
        <div className="px-5 py-3 border-b border-[#F6F2EB] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-[#2D2824] truncate leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-[#79716B] mt-0.5 leading-snug truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F6F2EB] hover:bg-[#EAE4DC] text-[#79716B] flex items-center justify-center transition-colors shrink-0"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Sheet Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="p-4 bg-[#FAF8F5] border-t border-[#EAE4DC] pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
