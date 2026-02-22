// src/app/hooks/useGovernanceAudit.ts
import { useCallback, useEffect, useState } from "react";
import { session } from "../../solid/session";
import { listAuditEvents } from "../../solid/governanceSolid";
import type { AuditEvent } from "../../solid/governanceSolid";

export function useGovernanceAudit(enabled: boolean) {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const refreshAudit = useCallback(async () => {
    try {
      setAuditLoading(true);
      setAuditError(null);
      const events = await listAuditEvents(session.fetch, { limit: 300 });
      setAuditEvents(events);
    } catch (e: any) {
      setAuditError(e?.message || String(e));
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refreshAudit();
  }, [enabled, refreshAudit]);

  return { auditEvents, auditLoading, auditError, refreshAudit };
}