// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { FullRecord, PatientFile } from "./solid/healthData";

import {
  initSessionFromRedirect,
  isLoggedIn,
  login,
  logout,
  getWebId,
  session,
} from "./solid/session";

import {
  PATIENTS,
  DOCTOR_WEBID,
  EMERGENCY_WEBID,
  PHARMACY_WEBID,
  NURSE_WEBID,
  GOVERNANCE_WEBID,
} from "./solid/config";

import {
  emptyFullRecord,
  saveFullRecord,
  loadPatientFiles,
  savePatientFile,
  deletePatientFile,
} from "./solid/healthData";

import { applyAccessForFullRecord, readAccessForFullRecord } from "./solid/acp";

import {
  bootstrapGovernanceStore,
  createGrantAndActivate,
  revokeActiveGrant,
  getActiveGrantState,
  hasDoctorAcknowledged,
  acknowledgeGrant,
  listAuditEvents,
} from "./solid/governanceSolid";

import type { AuditEvent, GrantState } from "./solid/governanceSolid";

import PatientFileManager from "./components/PatientFileManager";
import FileUploadForm from "./components/FileUploadForm";

export type Role =
  | "patient"
  | "doctor"
  | "emergency"
  | "pharmacy"
  | "nurse"
  | "governance"
  | "unknown";

type PatientKey = keyof typeof PATIENTS;

type LoadFullRecordResult = { data: FullRecord | null; status: number };

// Safe full-record load:
// - Never auto-creates record unless allowCreateIfMissing=true (patient only)
async function safeLoadFullRecord(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  allowCreateIfMissing: boolean,
): Promise<LoadFullRecordResult> {
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

function shortId(w?: string) {
  if (!w) return "";
  return w.replace("http://localhost:3000/", "").replace("/profile/card#me", "");
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<Role>("unknown");

  const [selectedPatient, setSelectedPatient] =
    useState<PatientKey>("patient1");

  // Full record UI state
  const [fullRecord, setFullRecord] = useState<FullRecord | null>(null);
  const [fullRecordStatus, setFullRecordStatus] = useState<number | null>(null);
  const [fullRecordError, setFullRecordError] = useState<string | null>(null);

  // Files UI state
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // File editor UI
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingFile, setEditingFile] = useState<PatientFile | null>(null);

  // ACP toggles (patient controls these)
  const [doctorCanReadWrite, setDoctorCanReadWrite] = useState(false);
  const [emergencyCanRead, setEmergencyCanRead] = useState(false);

  // Legal notice gating for doctor
  const [showLegalNotice, setShowLegalNotice] = useState(false);
  const [legalNoticeText, setLegalNoticeText] = useState("");
  const [pendingGrant, setPendingGrant] = useState<GrantState | null>(null);
  const [noticeAcceptedTick, setNoticeAcceptedTick] = useState(0);

  // Governance audit dashboard state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // -------------------------
  // Session init
  // -------------------------
  useEffect(() => {
    (async () => {
      await initSessionFromRedirect();
      const logged = isLoggedIn();
      const id = getWebId();
      setLoggedIn(logged);
      setWebId(id);
      setRole(detectRole(id));
      setReady(true);
    })();
  }, []);

  // -------------------------
  // Role detection
  // -------------------------
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
    r: Role,
    id: string | undefined,
    selected: PatientKey,
  ): PatientKey | null {
    if (r === "patient") {
      if (!id) return null;
      const keys = Object.keys(PATIENTS) as PatientKey[];
      const mine = keys.find((key) => PATIENTS[key].webId === id);
      return mine ?? null;
    }

    // Governance should not resolve a patient at all, because it should never load patient data
    if (r === "governance") return null;

    return selected;
  }

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

  // -------------------------
  // Governance: refresh audit events (only for governance)
  // -------------------------
  async function refreshAudit() {
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
  }

  useEffect(() => {
    if (!isGovernance) return;
    refreshAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGovernance]);

  // -------------------------
  // Doctor gate: must accept notice each time access is granted
  // -------------------------
  async function doctorGateOrThrow(patientWebId: string, scopeUrl: string) {
    const st = await getActiveGrantState(session.fetch, {
      patientWebId,
      doctorWebId: DOCTOR_WEBID,
      scopeUrl,
    });

    if (!st || st.status !== "active" || !st.activeGrantUrl) {
      throw new Error("No active grant. Access not granted or revoked.");
    }

    const ok = await hasDoctorAcknowledged(
      session.fetch,
      st.activeGrantUrl,
      DOCTOR_WEBID,
    );
    if (ok) return;

    const termsRes = await session.fetch(st.termsUrl, { cache: "no-store" });
    const termsText = termsRes.ok
      ? await termsRes.text()
      : "Terms could not be loaded.";

    setPendingGrant(st);
    setLegalNoticeText(termsText);
    setShowLegalNotice(true);

    throw new Error("Legal notice acknowledgement required.");
  }

  async function handleAcceptLegalNotice() {
    try {
      if (!pendingGrant?.activeGrantUrl) return;

      await acknowledgeGrant(session.fetch, {
        grantUrl: pendingGrant.activeGrantUrl,
        doctorWebId: DOCTOR_WEBID,
        patientWebId: pendingGrant.patientWebId,
        scopeUrl: pendingGrant.scopeUrl,
        termsVersion: pendingGrant.termsVersion,
        termsHash: pendingGrant.termsHash,
      });

      setShowLegalNotice(false);
      setPendingGrant(null);

      // trigger reload
      setNoticeAcceptedTick((n) => n + 1);
    } catch (e: any) {
      alert("Failed to acknowledge notice: " + (e?.message || String(e)));
    }
  }

  // -------------------------
  // Load patient data (full record + files)
  // This effect must NEVER run for governance.
  // -------------------------
  useEffect(() => {
    // Hard stop for governance: no patient fetches at all
    if (role === "governance") {
      setFullRecord(null);
      setFullRecordStatus(null);
      setFullRecordError(null);
      setPatientFiles([]);
      setFilesLoading(false);
      setFilesError(null);
      return;
    }

    // Reset UI state when context changes
    setFullRecord(null);
    setFullRecordStatus(null);
    setFullRecordError(null);

    setPatientFiles([]);
    setFilesLoading(false);
    setFilesError(null);

    if (!loggedIn || !effectivePatient || !patientHealthContainerUrl) return;

    let cancelled = false;

    // Full record
    (async () => {
      try {
        if (role === "doctor") {
          await doctorGateOrThrow(
            effectivePatient.webId,
            patientHealthContainerUrl,
          );
        }

        const allowCreateIfMissing = role === "patient";
        const { data, status } = await safeLoadFullRecord(
          session.fetch,
          effectivePatient.podBaseUrl,
          allowCreateIfMissing,
        );

        if (cancelled) return;
        setFullRecord(data);
        setFullRecordStatus(status);

        if (status === 403) {
          setFullRecordError("You do not have access to this patient's full record.");
        } else if (status === 404) {
          setFullRecordError("No full record exists yet for this patient.");
        }
      } catch (err: any) {
        if (cancelled) return;

        const msg = String(err?.message || "");

        if (msg.includes("Legal notice acknowledgement required")) {
          setFullRecord(null);
          setFullRecordStatus(403);
          setFullRecordError("Legal notice must be accepted before access is allowed.");
          return;
        }

        if (msg.includes("No active grant")) {
          setFullRecord(null);
          setFullRecordStatus(403);
          setFullRecordError("Access is not currently granted or has been revoked.");
          return;
        }

        setFullRecord(null);
        setFullRecordStatus(null);
        setFullRecordError("Record not loaded!");
      }
    })();

    // Files
    setFilesLoading(true);
    (async () => {
      try {
        if (role === "doctor") {
          await doctorGateOrThrow(
            effectivePatient.webId,
            patientHealthContainerUrl,
          );
        }

        const files = await loadPatientFiles(
          session.fetch,
          effectivePatient.podBaseUrl,
        );
        if (cancelled) return;

        setPatientFiles(files);
        setFilesLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setFilesError("Patient files not loaded!");
        setFilesLoading(false);
      }
    })();

    // Patient: read ACP state to sync toggles
    if (role === "patient") {
      readAccessForFullRecord(session.fetch, patientHealthContainerUrl)
        .then(({ doctorCanReadWrite: docAccess, emergencyCanRead: emgAccess }) => {
          if (cancelled) return;
          setDoctorCanReadWrite(docAccess);
          setEmergencyCanRead(emgAccess);
        })
        .catch((err) => {
          if (cancelled) return;
          // console.error("Error reading ACP:", err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    loggedIn,
    role,
    webId,
    selectedPatient,
    effectivePatientKey,
    patientHealthContainerUrl,
    noticeAcceptedTick,
  ]);

  // -------------------------
  // Revocation effect for doctors (poll governance state)
  // Wipes UI quickly after revoke without needing refresh
  // -------------------------
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
        if (revoked && !stopped) {
          setShowLegalNotice(false);
          setPendingGrant(null);

          setFullRecord(null);
          setFullRecordStatus(403);
          setFullRecordError("Access revoked. Data cleared.");

          setPatientFiles([]);
        }
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
  }, [loggedIn, role, effectivePatientKey, patientHealthContainerUrl]);

  useEffect(() => {
    if (!loggedIn || role !== "governance") return;
    refreshAudit();
  }, [loggedIn, role]);
  
  // -------------------------
  // Actions
  // -------------------------
  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  async function handleBootstrapGovernance() {
    try {
      await bootstrapGovernanceStore(session.fetch);
      alert("Governance store bootstrapped successfully.");
      await refreshAudit();
    } catch (e: any) {
      alert("Bootstrap failed: " + (e?.message || String(e)));
    }
  }

  async function handleSaveRecord() {
    if (!effectivePatient || !fullRecord) return;

    try {
      await saveFullRecord(session.fetch, effectivePatient.podBaseUrl, fullRecord);
      alert("Record saved to pod.");
      const { data, status } = await safeLoadFullRecord(
        session.fetch,
        effectivePatient.podBaseUrl,
        false,
      );
      setFullRecord(data);
      setFullRecordStatus(status);
      setFullRecordError(null);
    } catch (e: any) {
      alert("Failed to save record: " + (e?.message || String(e)));
    }
  }

  async function handleApplyAccess() {
    if (!effectivePatient || !patientHealthContainerUrl) {
      alert("No patient selected.");
      return;
    }

    try {
      // 1) Write ACP to patient pod
      await applyAccessForFullRecord(session.fetch, {
        resourceUrl: patientHealthContainerUrl,
        patientWebId: effectivePatient.webId,

        doctorWebId: DOCTOR_WEBID,
        emergencyWebId: EMERGENCY_WEBID,
        pharmacyWebId: PHARMACY_WEBID,
        nurseWebId: NURSE_WEBID,

        doctorCanReadWrite,
        emergencyCanRead,
        pharmacyCanRead: false,
        nurseCanReadWrite: false,

        restrictToClientAndIssuer: true,
      });

      // 2) Governance grant state for doctor
      if (doctorCanReadWrite) {
        await createGrantAndActivate(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId: DOCTOR_WEBID,
          scopeUrl: patientHealthContainerUrl,
        });
      } else {
        await revokeActiveGrant(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId: DOCTOR_WEBID,
          scopeUrl: patientHealthContainerUrl,
        });
      }

      alert("Access control updated. Governance log written.");
    } catch (e: any) {
      alert("Failed to update access control: " + (e?.message || String(e)));
    }
  }

  async function handleFileUpload(
    fileData: Omit<PatientFile, "id" | "createdAt" | "updatedAt">,
  ) {
    if (!effectivePatient) {
      alert("No patient selected.");
      return;
    }

    try {
      if (editingFile) {
        const updatedFiles = patientFiles.map((f) =>
          f.id === editingFile.id
            ? { ...f, ...fileData, updatedAt: new Date().toISOString() }
            : f,
        );

        const url = `${effectivePatient.podBaseUrl}health/files.json`;
        const res = await session.fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedFiles, null, 2),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        setPatientFiles(updatedFiles);
        setEditingFile(null);
        setShowFileUpload(false);
        alert("File updated successfully!");
      } else {
        await savePatientFile(session.fetch, effectivePatient.podBaseUrl, fileData);
        alert("File saved successfully!");
        setShowFileUpload(false);
      }

      const files = await loadPatientFiles(session.fetch, effectivePatient.podBaseUrl);
      setPatientFiles(files);
    } catch (e: any) {
      alert("Failed to save file: " + (e?.message || String(e)));
    }
  }

  async function handleFileDelete(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    if (!effectivePatient) {
      alert("No patient selected.");
      return;
    }

    try {
      await deletePatientFile(session.fetch, effectivePatient.podBaseUrl, fileId);
      setPatientFiles((files) => files.filter((f) => f.id !== fileId));
      alert("File deleted successfully!");
    } catch (e: any) {
      alert("Failed to delete file: " + (e?.message || String(e)));
    }
  }

  function handleEditFile(file: PatientFile) {
    setEditingFile(file);
    setShowFileUpload(true);
  }

  // -------------------------
  // UI render helpers
  // -------------------------
  function renderHeader() {
    return (
      <header className="sticky top-0 z-10 bg-white shadow-md px-6 py-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              CSS Healthcare ACP
            </h1>
            <p className="text-gray-600 mt-1">
              Self-hosted Solid pods with Access Control Policies (ACP)
            </p>
          </div>

          <div>
            {!loggedIn && (
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                onClick={login}
              >
                Log in with your Solid pod
              </button>
            )}

            {loggedIn && (
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-500">WebID</div>
                  <div className="text-sm text-gray-700 max-w-xs truncate">
                    {webId}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500">Role</div>
                  <div className="text-sm font-semibold text-gray-800 capitalize">
                    {role}
                  </div>
                </div>

                {isGovernance && (
                  <button
                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                    onClick={handleBootstrapGovernance}
                  >
                    Bootstrap governance
                  </button>
                )}

                <button
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  function renderPatientSelector() {
    if (!loggedIn) return null;
    if (role === "governance") return null;

    if (role === "patient") {
      const label = effectivePatient ? effectivePatient.label : "Unknown patient";
      return (
        <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg">
          <span className="text-gray-600">Patient:</span>
          <strong className="text-blue-700">{label} (your own pod)</strong>
        </div>
      );
    }

    const keys = Object.keys(PATIENTS) as PatientKey[];

    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
        <label htmlFor="patientSelect" className="font-medium text-gray-700">
          Select patient:
        </label>
        <select
          id="patientSelect"
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={selectedPatient}
          onChange={(e) => setSelectedPatient(e.target.value as PatientKey)}
        >
          {keys.map((key) => (
            <option key={key} value={key}>
              {PATIENTS[key].label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderFullRecord() {
    if (!loggedIn) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            Please log in to view or edit health records.
          </p>
        </div>
      );
    }

    if (role === "governance") return null;

    if (!effectivePatient) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">Could not determine patient.</p>
        </div>
      );
    }

    if (fullRecordStatus === 403) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-red-700">
            {fullRecordError || "You do not have access to this patient's full record."}
          </p>
        </div>
      );
    }

    if (fullRecordStatus === 404) {
      if (role === "patient") {
        const empty = emptyFullRecord();
        return (
          <FullRecordForm
            role={role}
            fullRecord={fullRecord ?? empty}
            onChange={setFullRecord}
            onSave={handleSaveRecord}
          />
        );
      }

      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-blue-700">
            No full record has been created yet for this patient.
          </p>
        </div>
      );
    }

    if (!fullRecord) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-gray-600">Loading...</p>
        </div>
      );
    }

    return (
      <FullRecordForm
        role={role}
        fullRecord={fullRecord}
        onChange={setFullRecord}
        onSave={handleSaveRecord}
      />
    );
  }

  function renderFileManagement() {
    if (!loggedIn) return null;
    if (role === "governance") return null;

    const canEdit = role === "patient" || role === "doctor";

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Patient Files</h2>
          {canEdit && (
            <button
              className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2"
              onClick={() => {
                setShowFileUpload(true);
                setEditingFile(null);
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add New File
            </button>
          )}
        </div>

        {(showFileUpload || editingFile) && (
          <FileUploadForm
            onSubmit={handleFileUpload}
            onCancel={() => {
              setShowFileUpload(false);
              setEditingFile(null);
            }}
            readOnly={!canEdit}
            initialFileData={editingFile || undefined}
          />
        )}

        <PatientFileManager
          files={patientFiles}
          loading={filesLoading}
          error={filesError}
          canEdit={canEdit}
          onDelete={handleFileDelete}
          onEdit={handleEditFile}
          role={role}
        />
      </div>
    );
  }

  function renderAccessControls() {
    if (!loggedIn) return null;
    if (role === "governance") return null;

    const isOwner =
      role === "patient" &&
      effectivePatient &&
      effectivePatient.webId === webId;

    if (!isOwner) {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-3">
            Access control
          </h2>
          <p className="text-gray-600">
            Only the patient can grant or revoke access to their record.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-3">
          Access control (ACP)
        </h2>
        <p className="text-gray-600 mb-4">
          Grant or revoke access to your <strong className="font-semibold">full record</strong> for the doctor
          and the emergency contact. When doctor access is granted, a governance grant is recorded and the doctor
          must accept a legal notice before data loads.
        </p>

        <div className="space-y-4 mb-6">
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
            <input
              type="checkbox"
              className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
              checked={doctorCanReadWrite}
              onChange={(e) => setDoctorCanReadWrite(e.target.checked)}
            />
            <div>
              <div className="font-medium text-gray-800">
                Doctor - read and write
              </div>
              <div className="text-sm text-gray-500">
                Allows full access to read and modify the record
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
            <input
              type="checkbox"
              className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
              checked={emergencyCanRead}
              onChange={(e) => setEmergencyCanRead(e.target.checked)}
            />
            <div>
              <div className="font-medium text-gray-800">
                Emergency contact - read only
              </div>
              <div className="text-sm text-gray-500">
                Allows viewing the record in emergency situations
              </div>
            </div>
          </label>
        </div>

        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
          onClick={handleApplyAccess}
        >
          Update access control
        </button>
      </div>
    );
  }

  function renderGovernanceDashboard() {
    if (!isGovernance) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Governance audit dashboard</h2>
            <p className="text-gray-600 text-sm mt-1">
              Logs are stored in the governance pod under /governance/audit/events/.
            </p>
          </div>

          <button
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            onClick={refreshAudit}
            disabled={auditLoading}
          >
            {auditLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {auditError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {auditError}
          </div>
        )}

        {auditLoading && auditEvents.length === 0 && (
          <div className="text-gray-600">Loading…</div>
        )}

        {!auditLoading && auditEvents.length === 0 && (
          <div className="text-gray-600">
            No logs found yet. Generate logs by granting, acknowledging, or revoking access.
          </div>
        )}

        {auditEvents.length > 0 && (
          <div className="overflow-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Actor</th>
                  <th className="text-left px-3 py-2">Recipient</th>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((ev) => (
                  <tr key={ev.eventId} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtTime(ev.at)}</td>
                    <td className="px-3 py-2 font-semibold">{ev.type}</td>
                    <td className="px-3 py-2">{shortId(ev.actorWebId)}</td>
                    <td className="px-3 py-2">{shortId(ev.doctorWebId)}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={ev.scopeUrl}>
                      {ev.scopeUrl}
                    </td>
                    <td className="px-3 py-2 font-mono" title={ev.eventHash}>
                      {ev.eventHash.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // -------------------------
  // Main render
  // -------------------------
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initialising Solid session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {renderHeader()}

      {/* Legal Notice Modal (doctor only) */}
      {showLegalNotice && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 mb-3">
              Legal Notice
            </h2>
            <p className="text-gray-600 mb-3">
              This notice must be accepted each time access is granted.
            </p>

            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-auto">
              {legalNoticeText}
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                onClick={() => {
                  setShowLegalNotice(false);
                  setPendingGrant(null);
                }}
              >
                Cancel
              </button>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
                onClick={handleAcceptLegalNotice}
              >
                I Accept
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 pb-12">
        {/* Governance sees only governance UI */}
        {isGovernance ? (
          renderGovernanceDashboard()
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2">
              {renderPatientSelector()}

              {fullRecordError && ![403, 404].includes(fullRecordStatus ?? 0) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                  {fullRecordError}
                </div>
              )}

              {renderFullRecord()}
              {renderFileManagement()}
            </section>

            <section>
              {renderAccessControls()}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-3">
                  Role-specific notes
                </h2>

                {role === "doctor" && (
                  <p className="text-gray-600">
                    As a doctor, you can view and edit the patient's full record when granted access.
                    Each time access is granted, you must accept a legal notice before the record loads.
                    If access is revoked, the UI clears the data shortly after.
                  </p>
                )}

                {role === "emergency" && (
                  <p className="text-gray-600">
                    As the emergency profile, you should only see records where ACP grants read access.
                  </p>
                )}

                {role === "patient" && (
                  <p className="text-gray-600">
                    You are logged in as the patient. You can manage your records and files.
                    Use the access control card to grant or revoke access. Grants are also recorded in the governance pod.
                  </p>
                )}

                {role === "pharmacy" && (
                  <p className="text-gray-600">
                    As a pharmacy, you can view files that have been shared with you.
                  </p>
                )}

                {role === "nurse" && (
                  <p className="text-gray-600">
                    As a nurse, you can view patient files and assist with data entry when enabled by policy.
                  </p>
                )}

                {role === "unknown" && (
                  <p className="text-gray-600">
                    Your WebID is not recognised as one of the configured roles.
                    Update src/solid/config.ts if this is a new actor.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

type FullRecordFormProps = {
  role: Role;
  fullRecord: FullRecord;
  onChange: (value: FullRecord) => void;
  onSave?: () => void;
};

const FullRecordForm: React.FC<FullRecordFormProps> = ({
  role,
  fullRecord,
  onChange,
  onSave,
}) => {
  const readOnly =
    role === "emergency" ||
    role === "pharmacy" ||
    role === "nurse" ||
    role === "governance" ||
    role === "unknown";

  function updateField(field: keyof FullRecord, value: string) {
    onChange({ ...fullRecord, [field]: value });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6">
        Full medical record
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Patient name
          </span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.patientName}
            disabled={readOnly}
            onChange={(e) => updateField("patientName", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Date of birth
          </span>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.dateOfBirth}
            disabled={readOnly}
            onChange={(e) => updateField("dateOfBirth", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Blood type
          </span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.bloodType}
            disabled={readOnly}
            onChange={(e) => updateField("bloodType", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Address
          </span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.address}
            disabled={readOnly}
            onChange={(e) => updateField("address", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Allergies
          </span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.allergies}
            disabled={readOnly}
            onChange={(e) => updateField("allergies", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Diagnoses
          </span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.diagnoses}
            disabled={readOnly}
            onChange={(e) => updateField("diagnoses", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Medications
          </span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.medications}
            disabled={readOnly}
            onChange={(e) => updateField("medications", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.notes}
            disabled={readOnly}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </label>
      </div>

      {onSave && !readOnly && (
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
          onClick={onSave}
        >
          Save record to pod
        </button>
      )}

      {readOnly && (
        <p className="text-gray-500 text-sm italic mt-4">
          You are viewing this record read only. Only patients and doctors can edit.
        </p>
      )}
    </div>
  );
};

export default App;
