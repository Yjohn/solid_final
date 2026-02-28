// src/components/Header.tsx
import React from "react";
import type { Role } from "../app/hooks/usePatientContext";
import { Activity, LogOut, Database } from "lucide-react";

const ROLE_BADGE: Record<Role, string> = {
  patient:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  doctor:     "bg-blue-100 text-blue-800 border-blue-200",
  emergency:  "bg-red-100 text-red-800 border-red-200",
  pharmacy:   "bg-orange-100 text-orange-800 border-orange-200",
  nurse:      "bg-purple-100 text-purple-800 border-purple-200",
  governance: "bg-violet-100 text-violet-800 border-violet-200",
  unknown:    "bg-slate-100 text-slate-700 border-slate-200",
};

interface Props {
  loggedIn: boolean;
  webId?: string;
  role: Role;
  isGovernance: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onBootstrapGovernance: () => void;
}

export const Header: React.FC<Props> = ({
  loggedIn, webId, role, isGovernance, onLogin, onLogout, onBootstrapGovernance,
}) => (
  <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 mb-6">
    <div className="container mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center shadow-sm">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-none tracking-tight">HealthPod ACP</h1>
          <p className="text-xs text-slate-400 mt-0.5">Solid pods · Access Control Policies</p>
        </div>
      </div>

      {/* Actions */}
      <div>
        {!loggedIn ? (
          <button
            onClick={onLogin}
            className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm"
          >
            Log in with Solid pod
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* WebID */}
            <div className="min-w-0 hidden sm:block">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">WebID</div>
              <div className="text-xs text-slate-600 font-mono max-w-[180px] truncate">{webId}</div>
            </div>

            {/* Role badge */}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${ROLE_BADGE[role]}`}>
              {role}
            </span>

            {isGovernance && (
              <button
                onClick={onBootstrapGovernance}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white py-1.5 px-3 rounded-lg transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                Bootstrap
              </button>
            )}

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 py-1.5 px-3 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  </header>
);
