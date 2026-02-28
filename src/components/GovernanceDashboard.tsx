// src/components/GovernanceDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { AuditEvent } from "../solid/governanceSolid";
import { RefreshCw, Download, Search } from "lucide-react";
import { fmtTime, shortId } from "../app/utils";

interface Props {
  auditEvents: AuditEvent[];
  auditLoading: boolean;
  auditError: string | null;
  onRefresh: () => void;
}

const EVENT_BADGES: Record<string, string> = {
  "grant-created":      "bg-emerald-100 text-emerald-800",
  "grant-acknowledged": "bg-teal-100 text-teal-800",
  "grant-revoked":      "bg-red-100 text-red-800",
};

function badgeClass(type: string) {
  return EVENT_BADGES[type] ?? "bg-slate-100 text-slate-700";
}

export const GovernanceDashboard: React.FC<Props> = ({
  auditEvents, auditLoading, auditError, onRefresh,
}) => {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const eventTypes = useMemo(
    () => ["all", ...Array.from(new Set(auditEvents.map((e) => e.type)))],
    [auditEvents],
  );

  const filtered = useMemo(() => {
    return auditEvents.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          e.type.includes(s) ||
          e.actorWebId.toLowerCase().includes(s) ||
          e.doctorWebId.toLowerCase().includes(s) ||
          e.scopeUrl.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [auditEvents, typeFilter, search]);

  // Auto-refresh every 10 s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(onRefresh, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, onRefresh]);

  function exportCsv() {
    const headers = ["Time", "Type", "Actor", "Recipient", "Scope", "Hash"];
    const rows = filtered.map((ev) => [
      fmtTime(ev.at),
      ev.type,
      shortId(ev.actorWebId),
      shortId(ev.doctorWebId),
      ev.scopeUrl,
      ev.eventHash,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Governance Audit Dashboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">Stored at /governance/audit/events/</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10 s)
          </label>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={onRefresh}
            disabled={auditLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} />
            {auditLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t === "all" ? "All event types" : t}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {auditError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {auditError}
        </div>
      )}

      {/* States */}
      {auditLoading && auditEvents.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading audit events…</div>
      )}
      {!auditLoading && auditEvents.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          No logs yet. Generate logs by granting, acknowledging, or revoking access.
        </div>
      )}
      {!auditLoading && auditEvents.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">No events match the current filter.</div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Time", "Type", "Actor", "Recipient", "Scope", "Hash"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev.eventId} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">{fmtTime(ev.at)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(ev.type)}`}>
                        {ev.type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-700">{shortId(ev.actorWebId)}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-700">{shortId(ev.doctorWebId)}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate text-xs text-slate-500" title={ev.scopeUrl}>
                      {ev.scopeUrl}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-400" title={ev.eventHash}>
                      {ev.eventHash.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Showing {filtered.length} of {auditEvents.length} events
          </p>
        </>
      )}
    </div>
  );
};
