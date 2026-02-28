// src/components/FileUploadForm.tsx
import React, { useState } from "react";
import type { PatientFile } from "../solid/healthData";
import { X } from "lucide-react";

interface Props {
  onSubmit: (fileData: PatientFile) => void;
  onCancel: () => void;
  readOnly?: boolean;
  initialFileData?: PatientFile;
}

const inputBase =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400";

const SHARE_OPTIONS = [
  { key: "sharedWithDoctor"    as const, label: "Doctor" },
  { key: "sharedWithEmergency" as const, label: "Emergency" },
  { key: "sharedWithNurse"     as const, label: "Nurse" },
  { key: "sharedWithPharmacy"  as const, label: "Pharmacy" },
];

const FileUploadForm: React.FC<Props> = ({ onSubmit, onCancel, readOnly = false, initialFileData }) => {
  const [title,       setTitle]       = useState(initialFileData?.title ?? "");
  const [description, setDescription] = useState(initialFileData?.description ?? "");
  const [content,     setContent]     = useState(initialFileData?.content ?? "");
  const [fileType,    setFileType]    = useState<PatientFile["type"]>(initialFileData?.type ?? "lab");
  const [createdBy,   setCreatedBy]   = useState(initialFileData?.createdBy ?? "");
  const [sharing, setSharing] = useState({
    sharedWithDoctor:    initialFileData?.sharedWithDoctor    ?? true,
    sharedWithEmergency: initialFileData?.sharedWithEmergency ?? false,
    sharedWithNurse:     initialFileData?.sharedWithNurse     ?? true,
    sharedWithPharmacy:  initialFileData?.sharedWithPharmacy  ?? false,
  });

  function handleSubmit() {
    if (!title.trim() || !createdBy.trim()) return;

    const now = new Date().toISOString();
    onSubmit({
      id:        initialFileData?.id ?? crypto.randomUUID(),
      createdAt: initialFileData?.createdAt ?? now,
      updatedAt: now,
      title,
      description,
      content,
      type: fileType,
      createdBy,
      ...sharing,
    });
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
      {/* Form header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {initialFileData ? "Edit File" : "Add New File"}
        </h3>
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Title */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputBase}
            disabled={readOnly}
            placeholder="e.g. Blood Panel Results"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            File Type
          </label>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value as PatientFile["type"])}
            className={inputBase}
            disabled={readOnly}
          >
            <option value="lab">🔬 Lab Results</option>
            <option value="prescription">💊 Prescription</option>
            <option value="imaging">🩻 Imaging Report</option>
            <option value="report">📄 Medical Report</option>
            <option value="note">📝 Doctor's Note</option>
          </select>
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputBase}
            disabled={readOnly}
            placeholder="Brief summary…"
          />
        </div>

        {/* Created by */}
        <div className="md:col-span-2">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Created By <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            className={inputBase}
            disabled={readOnly}
            placeholder="e.g. Dr. Smith"
          />
        </div>

        {/* Content */}
        <div className="md:col-span-2">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Content <span className="text-slate-300 font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`${inputBase} h-28 resize-none`}
            placeholder="Detailed results, notes, or report body…"
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Share with */}
      <div className="mb-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Share with</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SHARE_OPTIONS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={sharing[key]}
                onChange={(e) => setSharing((s) => ({ ...s, [key]: e.target.checked }))}
                className="h-4 w-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
                disabled={readOnly}
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {/* Cancel is always enabled */}
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg transition-colors"
        >
          Cancel
        </button>
        {!readOnly && (
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !createdBy.trim()}
            className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {initialFileData ? "Update File" : "Add File"}
          </button>
        )}
      </div>
    </div>
  );
};

export default FileUploadForm;
