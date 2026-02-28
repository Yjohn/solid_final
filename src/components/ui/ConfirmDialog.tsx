// src/components/ui/ConfirmDialog.tsx
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ message: "" });
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handle = (result: boolean) => {
    setOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  if (!open) return <ConfirmContext.Provider value={{ confirm }}>{children}</ConfirmContext.Provider>;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
          <div className="flex items-start gap-3 mb-5">
            {opts.variant === "danger" && (
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            )}
            <div>
              {opts.title && (
                <h3 className="text-base font-semibold text-slate-900 mb-1">{opts.title}</h3>
              )}
              <p className="text-sm text-slate-600">{opts.message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handle(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handle(true)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                opts.variant === "danger"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-teal-600 hover:bg-teal-700 text-white"
              }`}
            >
              {opts.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </ConfirmContext.Provider>
  );
}
