// src/components/LegalNoticeModal.tsx
import React, { useState } from "react";
import { ShieldCheck, X } from "lucide-react";

interface Props {
  noticeText: string;
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

export const LegalNoticeModal: React.FC<Props> = ({ noticeText, onAccept, onCancel }) => {
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    if (!checked || accepting) return;
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-teal-700" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Data Access Legal Notice</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              This notice must be accepted each time access is granted
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice text */}
        <div className="px-6 py-4">
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap max-h-60 overflow-auto font-mono leading-relaxed">
            {noticeText}
          </div>

          {/* Checkbox acknowledgement */}
          <label className="flex items-start gap-3 mt-4 cursor-pointer group">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="text-sm text-slate-700 leading-snug group-hover:text-slate-900 transition-colors select-none">
              I have read and understood this notice. I confirm I will only access this patient record
              for authorised care purposes and that my access is being logged.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={!checked || accepting}
            className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {accepting ? "Processing…" : "Accept & Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
};
