// src/app/hooks/usePatientData.ts
import { useEffect, useState } from "react";
import type { FullRecord, PatientFile } from "../../solid/healthData";
import {
  emptyFullRecord,
  saveFullRecord,
  loadPatientFiles,
} from "../../solid/healthData";
import { session } from "../../solid/session";
import { readAccessForFullRecord } from "../../solid/acp";
import type { Role } from "./usePatientContext";
import { LegalNoticeRequiredError, NoActiveGrantError } from "../errors";

type LoadResult = { data: FullRecord | null; status: number };

async function safeLoadFullRecord(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  allowCreateIfMissing: boolean,
): Promise<LoadResult> {
  const url = `${podBaseUrl}health/full-record.json`;

  const res = await fetchFn(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 403) return { data: null, status: 403 };

  if (res.status === 404) {
    if (!allowCreateIfMissing) return { data: null, status: 404 };
    const empty = emptyFullRecord();
    await saveFullRecord(fetchFn, podBaseUrl, empty);
    return { data: empty, status: 200 };
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return { data: (await res.json()) as FullRecord, status: res.status };
}

export function usePatientData(args: {
  loggedIn: boolean;
  role: Role;
  webId?: string;
  effectivePatient: { webId: string; podBaseUrl: string; label: string } | null;
  patientHealthContainerUrl: string | null;
  noticeAcceptedTick: number;
  doctorGate?: (patientWebId: string, scopeUrl: string) => Promise<void>;
}) {
  const {
    loggedIn,
    role,
    effectivePatient,
    patientHealthContainerUrl,
    noticeAcceptedTick,
    doctorGate,
  } = args;

  // Full record UI state
  const [fullRecord, setFullRecord] = useState<FullRecord | null>(null);
  const [fullRecordStatus, setFullRecordStatus] = useState<number | null>(null);
  const [fullRecordError, setFullRecordError] = useState<string | null>(null);

  // Files UI state
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // ACP toggles (patient controls these)
  const [doctorCanReadWrite, setDoctorCanReadWrite] = useState(false);
  const [emergencyCanRead, setEmergencyCanRead] = useState(false);

  function resetPatientUi() {
    setFullRecord(null);
    setFullRecordStatus(null);
    setFullRecordError(null);

    setPatientFiles([]);
    setFilesLoading(false);
    setFilesError(null);
  }

  useEffect(() => {
    // Governance hard stop: never fetch patient data
    if (role === "governance") {
      resetPatientUi();
      return;
    }

    resetPatientUi();

    if (!loggedIn || !effectivePatient || !patientHealthContainerUrl) return;

    let cancelled = false;

    (async () => {
      try {
        // Gate ONCE for doctor, then load everything
        if (role === "doctor" && doctorGate) {
          await doctorGate(effectivePatient.webId, patientHealthContainerUrl);
        }

        // Full record
        const allowCreateIfMissing = role === "patient";
        const { data, status } = await safeLoadFullRecord(
          session.fetch,
          effectivePatient.podBaseUrl,
          allowCreateIfMissing,
        );

        if (!cancelled) {
          setFullRecord(data);
          setFullRecordStatus(status);

          if (status === 403) {
            setFullRecordError("You do not have access to this patient's full record.");
          } else if (status === 404) {
            setFullRecordError("No full record exists yet for this patient.");
          } else {
            setFullRecordError(null);
          }
        }

        // Files
        if (!cancelled) setFilesLoading(true);
        const files = await loadPatientFiles(session.fetch, effectivePatient.podBaseUrl);

        if (!cancelled) {
          setPatientFiles(files);
          setFilesLoading(false);
          setFilesError(null);
        }

        // Patient: sync ACP toggles by reading ACR (not by probing access)
        if (role === "patient") {
          try {
            const { doctorCanReadWrite: doc, emergencyCanRead: emg } =
              await readAccessForFullRecord(session.fetch, patientHealthContainerUrl);

            if (!cancelled) {
              setDoctorCanReadWrite(doc);
              setEmergencyCanRead(emg);
            }
          } catch {
            // keep silent, toggles remain as-is
          }
        }
      } catch (err: any) {
        if (cancelled) return;

        if (err instanceof LegalNoticeRequiredError) {
          setFullRecord(null);
          setFullRecordStatus(403);
          setFullRecordError("Legal notice must be accepted before access is allowed.");
          setPatientFiles([]);
          setFilesLoading(false);
          setFilesError(null);
          return;
        }

        if (err instanceof NoActiveGrantError) {
          setFullRecord(null);
          setFullRecordStatus(403);
          setFullRecordError("Access is not currently granted or has been revoked.");
          setPatientFiles([]);
          setFilesLoading(false);
          setFilesError(null);
          return;
        }

        setFullRecord(null);
        setFullRecordStatus(null);
        setFullRecordError("Record not loaded!");

        setPatientFiles([]);
        setFilesLoading(false);
        setFilesError("Patient files not loaded!");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loggedIn,
    role,
    effectivePatient?.webId,
    effectivePatient?.podBaseUrl,
    patientHealthContainerUrl,
    noticeAcceptedTick,
  ]);

  return {
    // full record
    fullRecord,
    setFullRecord,
    fullRecordStatus,
    fullRecordError,
    setFullRecordError,
    setFullRecordStatus,

    // files
    patientFiles,
    setPatientFiles,
    filesLoading,
    filesError,
    setFilesError,
    setFilesLoading,

    // acp toggles
    doctorCanReadWrite,
    setDoctorCanReadWrite,
    emergencyCanRead,
    setEmergencyCanRead,

    // helper
    resetPatientUi,
  };
}