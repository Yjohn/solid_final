// src/components/FullRecordForm.tsx
import React, { useState, useEffect } from "react";
import type { FullRecord } from "../solid/healthData";
import type { Role } from "../app/hooks/usePatientContext";
import { Save, Lock } from "lucide-react";

type Props = {
  role: Role;
  fullRecord: FullRecord;
  onChange: (value: FullRecord) => void;
  /** If provided, the Save button is shown. Should return a promise. */
  onSave?: () => Promise<void>;
};

type FieldConfig = {
  key: keyof FullRecord;
  label: string;
  type: "text" | "date" | "textarea";
  colSpan?: 2;
};

const FIELDS: FieldConfig[] = [
  { key: "patientName",  label: "Patient Name",   type: "text" },
  { key: "dateOfBirth",  label: "Date of Birth",  type: "date" },
  { key: "bloodType",    label: "Blood Type",      type: "text" },
  { key: "address",      label: "Address",         type: "text" },
  { key: "allergies",    label: "Allergies",       type: "textarea", colSpan: 2 },
  { key: "diagnoses",    label: "Diagnoses",       type: "textarea", colSpan: 2 },
  { key: "medications",  label: "Medications",     type: "textarea", colSpan: 2 },
  { key: "notes",        label: "Notes",           type: "textarea", colSpan: 2 },
];

const READONLY_ROLES: Role[] = ["emergency", "pharmacy", "nurse", "governance", "unknown"];

const inputBase =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent " +
  "disabled:bg-slate-50 disabled:text-slate-400 transition-colors";

export const FullRecordForm: React.FC<Props> = ({ role, fullRecord, onChange, onSave }) => {
  const readOnly = READONLY_ROLES.includes(role);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset dirty when the record identity changes (e.g. patient switched)
  useEffect(() => { setDirty(false); }, [fullRecord]);

  function updateField(field: keyof FullRecord, value: string) {
    onChange({ ...fullRecord, [field]: value });
    setDirty(true);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave();
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Medical Record</h2>
          {readOnly && (
            <div className="flex items-center gap-1 mt-0.5">
              <Lock className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-400">Read-only — only patient & doctor can edit</span>
            </div>
          )}
        </div>
        {dirty && !readOnly && (
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {FIELDS.map(({ key, label, type, colSpan }) => (
          <label key={key} className={`block ${colSpan === 2 ? "md:col-span-2" : ""}`}>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              {label}
            </span>
            {type === "textarea" ? (
              <textarea
                className={`${inputBase} h-28 resize-none`}
                value={(fullRecord[key] as string) ?? ""}
                disabled={readOnly}
                onChange={(e) => updateField(key, e.target.value)}
              />
            ) : (
              <input
                type={type}
                className={inputBase}
                value={(fullRecord[key] as string) ?? ""}
                disabled={readOnly}
                onChange={(e) => updateField(key, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>

      {/* Footer */}
      {onSave && !readOnly && (
        <button
          className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save to pod"}
        </button>
      )}
    </div>
  );
};
