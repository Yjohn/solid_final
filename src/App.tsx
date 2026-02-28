// src/App.tsx
import React, { useState } from "react";
import type { PatientFile } from "./solid/healthData";
import { session } from "./solid/session";
import { PATIENTS, DOCTOR_WEBID, EMERGENCY_WEBID, PHARMACY_WEBID, NURSE_WEBID } from "./solid/config";
import { emptyFullRecord, saveFullRecord, loadPatientFiles, savePatientFile, deletePatientFile } from "./solid/healthData";
import { applyAccessForFullRecord } from "./solid/acp";
import { bootstrapGovernanceStore, createGrantAndActivate, revokeActiveGrant } from "./solid/governanceSolid";

// Hooks
import { useSolidSession }           from "./app/hooks/useSolidSession";
import { usePatientContext }          from "./app/hooks/usePatientContext";
import type { PatientKey }            from "./app/hooks/usePatientContext";
import { useDoctorGate }             from "./app/hooks/useDoctorGate";
import { useGovernanceAudit }        from "./app/hooks/useGovernanceAudit";
import { usePatientData }            from "./app/hooks/usePatientData";
import { useDoctorRevocationPolling } from "./app/hooks/useDoctorRevocationPolling";

// UI utilities
import { useToast }   from "./components/ui/Toast";
import { useConfirm } from "./components/ui/ConfirmDialog";

// Components
import { Header }             from "./components/Header";
import { FullRecordForm }     from "./components/FullRecordForm";
import { LegalNoticeModal }   from "./components/LegalNoticeModal";
import { GovernanceDashboard } from "./components/GovernanceDashboard";
import { AccessControls }     from "./components/AccessControls";
import { RoleNotes }          from "./components/RoleNotes";
import PatientFileManager     from "./components/PatientFileManager";
import FileUploadForm         from "./components/FileUploadForm";

const App: React.FC = () => {
  const { toast }   = useToast();
  const { confirm } = useConfirm();

  // ── Session & context ─────────────────────────────────────────
  const { ready, loggedIn, webId, login, logout } = useSolidSession();

  const {
    role, selectedPatient, setSelectedPatient,
    effectivePatient, patientHealthContainerUrl, isGovernance,
  } = usePatientContext(loggedIn, webId);

  // ── Doctor gate & governance audit ────────────────────────────
  const doctorGate = useDoctorGate();
  const audit = useGovernanceAudit(isGovernance);

  // ── Patient data ──────────────────────────────────────────────
  const patientData = usePatientData({
    loggedIn,
    role,
    webId,
    effectivePatient,
    patientHealthContainerUrl,
    noticeAcceptedTick: doctorGate.noticeAcceptedTick,
    doctorGate: role === "doctor" ? doctorGate.gateOrThrow : undefined,
  });

  // ── File editor local state ───────────────────────────────────
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingFile,    setEditingFile]    = useState<PatientFile | null>(null);

  // ── Revocation polling (doctor) ───────────────────────────────
  useDoctorRevocationPolling({
    loggedIn, role, effectivePatient, patientHealthContainerUrl,
    // Only poll when the doctor has confirmed access and data is loaded
    hasActiveData: patientData.fullRecord !== null || patientData.patientFiles.length > 0,
    onRevoked: () => {
      doctorGate.clearGateUi();
      patientData.setFullRecord(null);
      patientData.setFullRecordStatus(403);
      patientData.setFullRecordError("Access revoked. Data cleared.");
      patientData.setPatientFiles([]);
    },
  });

  // ── Actions ───────────────────────────────────────────────────
  async function handleBootstrapGovernance() {
    try {
      await bootstrapGovernanceStore(session.fetch);
      toast("Governance store bootstrapped successfully.", "success");
      await audit.refreshAudit();
    } catch (e: any) {
      toast("Bootstrap failed: " + (e?.message ?? String(e)), "error");
    }
  }

  async function handleSaveRecord() {
    if (!effectivePatient || !patientData.fullRecord) return;
    try {
      await saveFullRecord(session.fetch, effectivePatient.podBaseUrl, patientData.fullRecord);

      // Reload to confirm persisted state
      const res = await session.fetch(`${effectivePatient.podBaseUrl}health/full-record.json`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      patientData.setFullRecord(await res.json());
      patientData.setFullRecordStatus(res.status);
      patientData.setFullRecordError(null);
      toast("Record saved to pod.", "success");
    } catch (e: any) {
      toast("Failed to save record: " + (e?.message ?? String(e)), "error");
    }
  }

  async function handleApplyAccess() {
    if (!effectivePatient || !patientHealthContainerUrl) {
      toast("No patient selected.", "warning");
      return;
    }
    try {
      // Step 1 – write ACP policy to the patient pod
      await applyAccessForFullRecord(session.fetch, {
        resourceUrl:          patientHealthContainerUrl,
        patientWebId:         effectivePatient.webId,
        doctorWebId:          DOCTOR_WEBID,
        emergencyWebId:       EMERGENCY_WEBID,
        pharmacyWebId:        PHARMACY_WEBID,
        nurseWebId:           NURSE_WEBID,
        doctorCanReadWrite:   patientData.doctorCanReadWrite,
        emergencyCanRead:     patientData.emergencyCanRead,
        pharmacyCanRead:      false,
        nurseCanReadWrite:    false,
        restrictToClientAndIssuer: true,
      });
      toast("Access policy applied to your pod.", "info");

      // Step 2 – update governance grant and notify
      if (patientData.doctorCanReadWrite) {
        await createGrantAndActivate(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId:  DOCTOR_WEBID,
          scopeUrl:     patientHealthContainerUrl,
        });
        toast("Doctor access granted. The doctor must accept a legal notice before viewing your record.", "success");
        toast("Grant recorded in the Governance Pod.", "info");
      } else {
        await revokeActiveGrant(session.fetch, {
          patientWebId: effectivePatient.webId,
          doctorWebId:  DOCTOR_WEBID,
          scopeUrl:     patientHealthContainerUrl,
        });
        toast("Doctor access revoked. The doctor can no longer view your data.", "success");
        toast("Revocation recorded in the Governance Pod.", "info");
      }
    } catch (e: any) {
      toast("Failed to update access control: " + (e?.message ?? String(e)), "error");
    }
  }

  async function handleFileUpload(fileData: PatientFile) {
    if (!effectivePatient) { toast("No patient selected.", "warning"); return; }
    try {
      if (editingFile) {
        const updated = patientData.patientFiles.map((f) =>
          f.id === editingFile.id ? { ...f, ...fileData, updatedAt: new Date().toISOString() } : f,
        );
        const res = await session.fetch(`${effectivePatient.podBaseUrl}health/files.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated, null, 2),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        patientData.setPatientFiles(updated);
        setEditingFile(null);
        setShowFileUpload(false);
        toast("File updated.", "success");
      } else {
        await savePatientFile(session.fetch, effectivePatient.podBaseUrl, fileData);
        setShowFileUpload(false);
        toast("File saved.", "success");
      }
      patientData.setPatientFiles(await loadPatientFiles(session.fetch, effectivePatient.podBaseUrl));
    } catch (e: any) {
      toast("Failed to save file: " + (e?.message ?? String(e)), "error");
    }
  }

  async function handleFileDelete(fileId: string) {
    const ok = await confirm({
      title: "Delete file",
      message: "Are you sure you want to permanently delete this file?",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    if (!effectivePatient) { toast("No patient selected.", "warning"); return; }
    try {
      await deletePatientFile(session.fetch, effectivePatient.podBaseUrl, fileId);
      patientData.setPatientFiles((files) => files.filter((f) => f.id !== fileId));
      toast("File deleted.", "success");
    } catch (e: any) {
      toast("Failed to delete file: " + (e?.message ?? String(e)), "error");
    }
  }

  function handleEditFile(file: PatientFile) {
    setEditingFile(file);
    setShowFileUpload(true);
  }

  // ── Session initialising ──────────────────────────────────────
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Initialising Solid session…</p>
        </div>
      </div>
    );
  }

  const canEdit = role === "patient" || role === "doctor";

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        loggedIn={loggedIn}
        webId={webId}
        role={role}
        isGovernance={isGovernance}
        onLogin={login}
        onLogout={logout}
        onBootstrapGovernance={handleBootstrapGovernance}
      />

      {/* Legal notice modal – doctor only */}
      {doctorGate.showLegalNotice && (
        <LegalNoticeModal
          noticeText={doctorGate.legalNoticeText}
          onAccept={doctorGate.acceptNotice}
          onCancel={doctorGate.cancelNotice}
        />
      )}

      <main className="container mx-auto px-4 pb-12">
        {/* ── Governance view ── */}
        {isGovernance ? (
          <GovernanceDashboard
            auditEvents={audit.auditEvents}
            auditLoading={audit.auditLoading}
            auditError={audit.auditError}
            onRefresh={audit.refreshAudit}
          />
        ) : (
          /* ── Main two-column layout ── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column – record + files */}
            <section className="lg:col-span-2 space-y-0">
              {/* Patient selector */}
              {loggedIn && role !== "governance" && (
                role === "patient" ? (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl text-sm">
                    <span className="text-teal-600 font-medium">
                      {effectivePatient?.label ?? "Unknown patient"} — your pod
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mb-4">
                    <label htmlFor="patientSelect" className="text-sm font-medium text-slate-700">
                      Patient:
                    </label>
                    <select
                      id="patientSelect"
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={selectedPatient}
                      onChange={(e) => setSelectedPatient(e.target.value as PatientKey)}
                    >
                      {(Object.keys(PATIENTS) as PatientKey[]).map((key) => (
                        <option key={key} value={key}>{PATIENTS[key].label}</option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {/* General error banner */}
              {patientData.fullRecordError && ![403, 404].includes(patientData.fullRecordStatus ?? 0) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm">
                  {patientData.fullRecordError}
                </div>
              )}

              {/* Full record */}
              {loggedIn && role !== "governance" && (() => {
                if (!effectivePatient) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-red-700 text-sm">
                      Could not determine patient.
                    </div>
                  );
                }

                if (patientData.fullRecordStatus === 403) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5">
                      <h2 className="text-sm font-semibold text-slate-800 mb-1">Full Record</h2>
                      <p className="text-sm text-red-700">
                        {patientData.fullRecordError ?? "You do not have access to this patient's full record."}
                      </p>
                    </div>
                  );
                }

                if (patientData.fullRecordStatus === 404 && role !== "patient") {
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
                      <h2 className="text-sm font-semibold text-slate-800 mb-1">Full Record</h2>
                      <p className="text-sm text-blue-700">No full record has been created yet for this patient.</p>
                    </div>
                  );
                }

                if (!patientData.fullRecord) {
                  if (role === "patient") {
                    return (
                      <FullRecordForm
                        role={role}
                        fullRecord={emptyFullRecord()}
                        onChange={patientData.setFullRecord}
                        onSave={handleSaveRecord}
                      />
                    );
                  }
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5 text-slate-500 text-sm">
                      Loading record…
                    </div>
                  );
                }

                return (
                  <FullRecordForm
                    role={role}
                    fullRecord={patientData.fullRecord}
                    onChange={patientData.setFullRecord}
                    onSave={handleSaveRecord}
                  />
                );
              })()}

              {/* Files section */}
              {loggedIn && role !== "governance" && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900">Patient Files</h2>
                      {patientData.patientFiles.length > 0 && (
                        <span className="text-xs font-semibold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                          {patientData.patientFiles.length}
                        </span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                        onClick={() => { setShowFileUpload(true); setEditingFile(null); }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add File
                      </button>
                    )}
                  </div>

                  {showFileUpload && (
                    <FileUploadForm
                      onSubmit={handleFileUpload}
                      onCancel={() => { setShowFileUpload(false); setEditingFile(null); }}
                      readOnly={!canEdit}
                      initialFileData={editingFile ?? undefined}
                    />
                  )}

                  <PatientFileManager
                    files={patientData.patientFiles}
                    loading={patientData.filesLoading}
                    error={patientData.filesError}
                    canEdit={canEdit}
                    onDelete={handleFileDelete}
                    onEdit={handleEditFile}
                    role={role}
                  />
                </div>
              )}
            </section>

            {/* Right column – access control + role notes */}
            <section className="space-y-5">
              {loggedIn && role !== "governance" && (
                <>
                  <AccessControls
                    role={role}
                    effectivePatientWebId={effectivePatient?.webId}
                    webId={webId}
                    doctorCanReadWrite={patientData.doctorCanReadWrite}
                    emergencyCanRead={patientData.emergencyCanRead}
                    onDoctorChange={patientData.setDoctorCanReadWrite}
                    onEmergencyChange={patientData.setEmergencyCanRead}
                    onApply={handleApplyAccess}
                  />
                  <RoleNotes role={role} />
                </>
              )}

              {!loggedIn && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
                  Please log in to view or edit health records.
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;