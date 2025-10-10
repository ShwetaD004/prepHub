
import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Yes, Stop',
  cancelText = 'Keep Going!',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in" aria-modal="true" role="dialog">
      <div className="bg-surface rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-white/20 animate-slide-in-up">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-on-surface">{title}</h2>
            <button onClick={onClose} className="text-on-secondary hover:text-on-surface" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div className="text-on-secondary mb-8">
            {message}
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-6 rounded-lg hover:shadow-lg transform hover:scale-105 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="bg-slate-200 text-on-secondary font-semibold py-2 px-6 rounded-lg hover:bg-slate-300 hover:text-red-700 transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
