// src/app/hooks/useDoctorRevocationPolling.ts
import { useEffect } from "react";
import { session } from "../../solid/session";
import { getActiveGrantState } from "../../solid/governanceSolid";
import { DOCTOR_WEBID } from "../../solid/config";
import type { Role } from "./usePatientContext";

export function useDoctorRevocationPolling(args: {
  loggedIn: boolean;
  role: Role;
  effectivePatient: { webId: string } | null;
  patientHealthContainerUrl: string | null;
  onRevoked: () => void;
}) {
  const { loggedIn, role, effectivePatient, patientHealthContainerUrl, onRevoked } = args;

  useEffect(() => {
    if (!loggedIn || role !== "doctor") return;
    if (!effectivePatient || !patientHealthContainerUrl) return;

    let stopped = false;

    const check = async () => {
      try {
        const st = await getActiveGrantState(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId: DOCTOR_WEBID,
          scopeUrl: patientHealthContainerUrl,
        });

        const revoked = !st || st.status !== "active";
        if (revoked && !stopped) onRevoked();
      } catch {
        // ignore polling errors
      }
    };

    const id = window.setInterval(check, 2500);
    check();

    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [loggedIn, role, effectivePatient?.webId, patientHealthContainerUrl, onRevoked]);
}