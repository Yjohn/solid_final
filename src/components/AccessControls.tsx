// src/components/AccessControls.tsx
import React, { useState } from "react";
import { ShieldCheck, ShieldOff, ChevronRight, Loader2 } from "lucide-react";
import type { Role } from "../app/hooks/usePatientContext";

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleProps) {
  return (
    <div
      className={`flex items-center gap-4 p-4 border border-slate-200 rounded-xl transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer"
      }`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div
        className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${
          checked ? "bg-teal-600" : "bg-slate-300"
        }`}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      {checked ? (
        <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
      ) : (
        <ShieldOff className="w-4 h-4 text-slate-300 flex-shrink-0" />
      )}
    </div>
  );
}

interface Props {
  role: Role;
  effectivePatientWebId?: string;
  webId?: string;
  doctorCanReadWrite: boolean;
  emergencyCanRead: boolean;
  onDoctorChange: (v: boolean) => void;
  onEmergencyChange: (v: boolean) => void;
  onApply: () => Promise<void>;
}

export const AccessControls: React.FC<Props> = ({
  role, effectivePatientWebId, webId,
  doctorCanReadWrite, emergencyCanRead,
  onDoctorChange, onEmergencyChange, onApply,
}) => {
  const [applying, setApplying] = useState(false);

  const isOwner = role === "patient" && effectivePatientWebId && effectivePatientWebId === webId;

  async function handleApply() {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1">Access Control (ACP)</h2>

      {!isOwner ? (
        <p className="text-sm text-slate-500">
          Only the patient can grant or revoke access to their record.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Control who can access your full record. Doctor grants trigger a governance audit
            and require legal notice acceptance each session.
          </p>
          <div className="space-y-3 mb-4">
            <ToggleRow
              label="Doctor — read & write"
              description="Full access to view and modify the record"
              checked={doctorCanReadWrite}
              onChange={onDoctorChange}
              disabled={applying}
            />
            <ToggleRow
              label="Emergency — read only"
              description="View-only access in emergency situations"
              checked={emergencyCanRead}
              onChange={onEmergencyChange}
              disabled={applying}
            />
          </div>
          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying…
              </>
            ) : (
              <>
                Apply Access Control
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
};