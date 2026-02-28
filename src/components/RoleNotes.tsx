// src/components/RoleNotes.tsx
import React from "react";
import { Info } from "lucide-react";
import type { Role } from "../app/hooks/usePatientContext";

const NOTES: Partial<Record<Role, string>> = {
  doctor:
    "You can view and edit the patient's full record when granted access. Each access requires accepting a legal notice. If access is revoked, data is cleared shortly after.",
  emergency:
    "As the emergency profile, you can only see records where ACP explicitly grants read access.",
  patient:
    "You are logged in as the patient. Manage your records and files, and use the Access Control panel to grant or revoke access for other roles.",
  pharmacy:
    "As a pharmacy, you can view files that have been shared with you (prescriptions only).",
  nurse:
    "As a nurse, you can view patient files and assist with data entry when enabled by policy.",
  unknown:
    "Your WebID is not recognised as a configured role. Update src/solid/config.ts if this is a new actor.",
};

export const RoleNotes: React.FC<{ role: Role }> = ({ role }) => {
  const note = NOTES[role];
  if (!note) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="flex items-start gap-2.5">
        <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Role note
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{note}</p>
        </div>
      </div>
    </div>
  );
};
