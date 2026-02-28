// src/app/hooks/useDoctorRevocationPolling.ts
import { useEffect } from "react";
import { session } from "../../solid/session";
import { getActiveGrantState } from "../../solid/governanceSolid";
import { DOCTOR_WEBID } from "../../solid/config";
import type { Role } from "./usePatientContext";

/** How often to check for revocation. 15 s is frequent enough for a responsive
 *  UX while keeping server traffic low (was 2.5 s → ~24 req/min per patient). */
const POLL_INTERVAL_MS = 15_000;

export function useDoctorRevocationPolling(args: {
  loggedIn: boolean;
  role: Role;
  effectivePatient: { webId: string } | null;
  patientHealthContainerUrl: string | null;
  /** Only poll when the doctor actually has data loaded — no point checking
   *  revocation when access was never confirmed in this session. */
  hasActiveData: boolean;
  onRevoked: () => void;
}) {
  const {
    loggedIn, role, effectivePatient,
    patientHealthContainerUrl, hasActiveData, onRevoked,
  } = args;

  useEffect(() => {
    if (!loggedIn || role !== "doctor") return;
    if (!effectivePatient || !patientHealthContainerUrl) return;
    if (!hasActiveData) return;   // skip until the doctor has confirmed access

    let stopped = false;

    const check = async () => {
      try {
        const st = await getActiveGrantState(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId:  DOCTOR_WEBID,
          scopeUrl:     patientHealthContainerUrl,
        });

        if ((!st || st.status !== "active") && !stopped) onRevoked();
      } catch {
        // ignore transient polling errors
      }
    };

    const id = window.setInterval(check, POLL_INTERVAL_MS);
    check(); // immediate first check

    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [
    loggedIn, role,
    effectivePatient?.webId, patientHealthContainerUrl,
    hasActiveData, onRevoked,
  ]);
}