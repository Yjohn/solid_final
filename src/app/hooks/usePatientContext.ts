// src/app/hooks/usePatientContext.ts
import { useMemo, useState } from "react";
import {
  PATIENTS,
  DOCTOR_WEBID,
  EMERGENCY_WEBID,
  PHARMACY_WEBID,
  NURSE_WEBID,
  GOVERNANCE_WEBID,
} from "../../solid/config";

export type Role =
  | "patient"
  | "doctor"
  | "emergency"
  | "pharmacy"
  | "nurse"
  | "governance"
  | "unknown";

export type PatientKey = keyof typeof PATIENTS;

function detectRole(id?: string): Role {
  if (!id) return "unknown";
  if (id === GOVERNANCE_WEBID) return "governance";

  const patientKeys = Object.keys(PATIENTS) as PatientKey[];
  if (patientKeys.some((key) => PATIENTS[key].webId === id)) return "patient";

  if (id === DOCTOR_WEBID) return "doctor";
  if (id === EMERGENCY_WEBID) return "emergency";
  if (id === PHARMACY_WEBID) return "pharmacy";
  if (id === NURSE_WEBID) return "nurse";

  return "unknown";
}

function getEffectivePatientKey(
  role: Role,
  webId: string | undefined,
  selected: PatientKey,
): PatientKey | null {
  if (role === "patient") {
    if (!webId) return null;
    const keys = Object.keys(PATIENTS) as PatientKey[];
    return keys.find((k) => PATIENTS[k].webId === webId) ?? null;
  }

  // Governance must never resolve a patient
  if (role === "governance") return null;

  return selected;
}

export function usePatientContext(loggedIn: boolean, webId?: string) {
  const role = useMemo(() => detectRole(webId), [webId]);

  const [selectedPatient, setSelectedPatient] = useState<PatientKey>("patient1");

  const effectivePatientKey = useMemo(() => {
    if (!loggedIn) return null;
    return getEffectivePatientKey(role, webId, selectedPatient);
  }, [loggedIn, role, webId, selectedPatient]);

  const effectivePatient = useMemo(() => {
    if (!effectivePatientKey) return null;
    return PATIENTS[effectivePatientKey];
  }, [effectivePatientKey]);

  const patientHealthContainerUrl = useMemo(() => {
    if (!effectivePatient) return null;
    return new URL("health/", effectivePatient.podBaseUrl).toString(); // ends with /
  }, [effectivePatient]);

  const isGovernance = loggedIn && role === "governance";

  return {
    role,
    selectedPatient,
    setSelectedPatient,
    effectivePatientKey,
    effectivePatient,
    patientHealthContainerUrl,
    isGovernance,
  };
}