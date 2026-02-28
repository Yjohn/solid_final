// src/components/PatientFileManager.tsx
import React, { useMemo, useState } from "react";
import type { PatientFile } from "../solid/healthData";
import type { Role } from "../app/hooks/usePatientContext";
import { Pencil, Trash2, ChevronDown, ChevronUp, Search, ArrowUpDown } from "lucide-react";

interface Props {
  files: PatientFile[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onDelete: (fileId: string) => void;
  onEdit: (file: PatientFile) => void;
  role: Role;
}

const FILE_ICONS: Record<string, string> = {
  lab: "🔬", prescription: "💊", imaging: "🩻", report: "📄", note: "📝",
};

const TYPE_COLORS: Record<string, string> = {
  lab:          "bg-blue-100 text-blue-800",
  prescription: "bg-emerald-100 text-emerald-800",
  imaging:      "bg-purple-100 text-purple-800",
  report:       "bg-orange-100 text-orange-800",
  note:         "bg-amber-100 text-amber-800",
};

const SHARE_BADGES = [
  { key: "sharedWithDoctor"    as const, label: "Doctor",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "sharedWithEmergency" as const, label: "Emergency", color: "bg-red-50 text-red-700 border-red-200" },
  { key: "sharedWithNurse"     as const, label: "Nurse",     color: "bg-purple-50 text-purple-700 border-purple-200" },
  { key: "sharedWithPharmacy"  as const, label: "Pharmacy",  color: "bg-orange-50 text-orange-700 border-orange-200" },
];

type SortKey = "createdAt" | "updatedAt" | "title" | "type";

const PatientFileManager: React.FC<Props> = ({
  files, loading, error, canEdit, onDelete, onEdit, role,
}) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visibleFiles = useMemo(() => files.filter((f) => {
    if (role === "pharmacy")  return f.type === "prescription";
    if (role === "emergency") return f.sharedWithEmergency;
    if (role === "nurse")     return f.sharedWithNurse;
    if (role === "doctor")    return f.sharedWithDoctor;
    return true;
  }), [files, role]);

  const allTypes = useMemo(
    () => ["all", ...Array.from(new Set(visibleFiles.map((f) => f.type)))],
    [visibleFiles],
  );

  const displayFiles = useMemo(() => {
    let list = visibleFiles;
    if (typeFilter !== "all") list = list.filter((f) => f.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q) ||
          (f.createdBy ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
      return sortDesc ? -cmp : cmp;
    });
  }, [visibleFiles, typeFilter, search, sortKey, sortDesc]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>;
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        <p>No files added yet.</p>
        {canEdit && <p className="mt-1 text-xs">Click "Add File" to get started.</p>}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title, description or author…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        {allTypes.length > 2 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {allTypes.map((t) => (
              <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="title">Title</option>
            <option value="type">Type</option>
          </select>
          <button
            onClick={() => setSortDesc((d) => !d)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 transition-colors"
            title={sortDesc ? "Newest first" : "Oldest first"}
          >
            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortDesc ? "" : "rotate-180"}`} />
          </button>
        </div>
      </div>

      {displayFiles.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">No files match the current filter.</div>
      )}

      <div className="space-y-3">
        {displayFiles.map((file) => {
          const isOpen = expanded.has(file.id);
          return (
            <div key={file.id} className="border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
              <div className="flex items-start gap-3 p-4">
                <span className="text-xl leading-none mt-0.5 flex-shrink-0">{FILE_ICONS[file.type] ?? "📁"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug">{file.title}</h3>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {file.content && (
                        <button
                          onClick={() => toggleExpand(file.id)}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title={isOpen ? "Collapse" : "Expand content"}
                        >
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button onClick={() => onEdit(file)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="Edit">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => onDelete(file.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[file.type] ?? "bg-slate-100 text-slate-700"}`}>
                      {file.type}
                    </span>
                    {SHARE_BADGES.filter((b) => file[b.key]).map((b) => (
                      <span key={b.key} className={`text-xs px-2 py-0.5 rounded-full border ${b.color}`}>{b.label}</span>
                    ))}
                  </div>
                  {file.description && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{file.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
                    <span>Created {new Date(file.createdAt).toLocaleDateString()}</span>
                    {file.updatedAt !== file.createdAt && <span>Updated {new Date(file.updatedAt).toLocaleDateString()}</span>}
                    {file.createdBy && <span>By {file.createdBy}</span>}
                  </div>
                </div>
              </div>
              {isOpen && file.content && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{file.content}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {displayFiles.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">{displayFiles.length} of {visibleFiles.length} files</p>
      )}
    </div>
  );
};

export default PatientFileManager;
