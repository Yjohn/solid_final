// src/App.tsx
import React, { useMemo, useState } from "react";
import type { FullRecord, PatientFile } from "./solid/healthData";

import { session } from "./solid/session";

import {
  PATIENTS,
  DOCTOR_WEBID,
  EMERGENCY_WEBID,
  PHARMACY_WEBID,
  NURSE_WEBID,
} from "./solid/config";

import {
  emptyFullRecord,
  saveFullRecord,
  loadPatientFiles,
  savePatientFile,
  deletePatientFile,
} from "./solid/healthData";

import { applyAccessForFullRecord } from "./solid/acp";

import { bootstrapGovernanceStore, createGrantAndActivate, revokeActiveGrant } from "./solid/governanceSolid";

import PatientFileManager from "./components/PatientFileManager";
import FileUploadForm from "./components/FileUploadForm";

import { useSolidSession } from "./app/hooks/useSolidSession";
import { usePatientContext, type Role, type PatientKey } from "./app/hooks/usePatientContext";
import { useDoctorGate } from "./app/hooks/useDoctorGate";
import { useGovernanceAudit } from "./app/hooks/useGovernanceAudit";
import { usePatientData } from "./app/hooks/usePatientData";
import { useDoctorRevocationPolling } from "./app/hooks/useDoctorRevocationPolling";
import { fmtTime, shortId } from "./app/utils";

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
      <h2 className="text-xl font-bold text-gray-800 mb-6">Full medical record</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Patient name</span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.patientName}
            disabled={readOnly}
            onChange={(e) => updateField("patientName", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Date of birth</span>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.dateOfBirth}
            disabled={readOnly}
            onChange={(e) => updateField("dateOfBirth", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Blood type</span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.bloodType}
            disabled={readOnly}
            onChange={(e) => updateField("bloodType", e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Address</span>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.address}
            disabled={readOnly}
            onChange={(e) => updateField("address", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">Allergies</span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.allergies}
            disabled={readOnly}
            onChange={(e) => updateField("allergies", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">Diagnoses</span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.diagnoses}
            disabled={readOnly}
            onChange={(e) => updateField("diagnoses", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">Medications</span>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            value={fullRecord.medications}
            disabled={readOnly}
            onChange={(e) => updateField("medications", e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">Notes</span>
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

const App: React.FC = () => {
  // -------------------------
  // Session + context
  // -------------------------
  const { ready, loggedIn, webId, login, logout } = useSolidSession();
  const {
    role,
    selectedPatient,
    setSelectedPatient,
    effectivePatientKey,
    effectivePatient,
    patientHealthContainerUrl,
    isGovernance,
  } = usePatientContext(loggedIn, webId);

  // -------------------------
  // Doctor gate + audit
  // -------------------------
  const doctorGate = useDoctorGate();
  const audit = useGovernanceAudit(isGovernance);

  // -------------------------
  // Patient data (record/files/toggles)
  // -------------------------
  const patientData = usePatientData({
    loggedIn,
    role,
    webId,
    effectivePatient,
    patientHealthContainerUrl,
    noticeAcceptedTick: doctorGate.noticeAcceptedTick,
    doctorGate: role === "doctor" ? doctorGate.gateOrThrow : undefined,
  });

  // -------------------------
  // File editor UI
  // -------------------------
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingFile, setEditingFile] = useState<PatientFile | null>(null);

  // -------------------------
  // Doctor revocation polling
  // -------------------------
  useDoctorRevocationPolling({
    loggedIn,
    role,
    effectivePatient,
    patientHealthContainerUrl,
    onRevoked: () => {
      doctorGate.clearGateUi();

      patientData.setFullRecord(null);
      patientData.setFullRecordStatus(403);
      patientData.setFullRecordError("Access revoked. Data cleared.");

      patientData.setPatientFiles([]);
    },
  });

  // -------------------------
  // Actions
  // -------------------------
  async function handleBootstrapGovernance() {
    try {
      await bootstrapGovernanceStore(session.fetch);
      alert("Governance store bootstrapped successfully.");
      await audit.refreshAudit();
    } catch (e: any) {
      alert("Bootstrap failed: " + (e?.message || String(e)));
    }
  }

  async function handleSaveRecord() {
    if (!effectivePatient || !patientData.fullRecord) return;

    try {
      await saveFullRecord(session.fetch, effectivePatient.podBaseUrl, patientData.fullRecord);
      alert("Record saved to pod.");

      // Reload record to confirm persisted state
      const res = await session.fetch(`${effectivePatient.podBaseUrl}health/full-record.json`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      patientData.setFullRecord((await res.json()) as FullRecord);
      patientData.setFullRecordStatus(res.status);
      patientData.setFullRecordError(null);
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

        doctorCanReadWrite: patientData.doctorCanReadWrite,
        emergencyCanRead: patientData.emergencyCanRead,
        pharmacyCanRead: false,
        nurseCanReadWrite: false,

        restrictToClientAndIssuer: true,
      });

      // 2) Governance grant state for doctor
      if (patientData.doctorCanReadWrite) {
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
        // Keep the existing “edit by overwriting files.json” behaviour
        const updatedFiles = patientData.patientFiles.map((f) =>
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

        patientData.setPatientFiles(updatedFiles);
        setEditingFile(null);
        setShowFileUpload(false);
        alert("File updated successfully!");
      } else {
        await savePatientFile(session.fetch, effectivePatient.podBaseUrl, fileData);
        alert("File saved successfully!");
        setShowFileUpload(false);
      }

      const files = await loadPatientFiles(session.fetch, effectivePatient.podBaseUrl);
      patientData.setPatientFiles(files);
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
      patientData.setPatientFiles((files) => files.filter((f) => f.id !== fileId));
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
  // Render helpers
  // -------------------------
  function renderHeader() {
    return (
      <header className="sticky top-0 z-10 bg-white shadow-md px-6 py-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">CSS Healthcare ACP</h1>
            <p className="text-gray-600 mt-1">Self-hosted Solid pods with Access Control Policies (ACP)</p>
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
                  <div className="text-sm text-gray-700 max-w-xs truncate">{webId}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500">Role</div>
                  <div className="text-sm font-semibold text-gray-800 capitalize">{role}</div>
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
                  onClick={logout}
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
          <p className="text-yellow-800">Please log in to view or edit health records.</p>
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

    if (patientData.fullRecordStatus === 403) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-red-700">
            {patientData.fullRecordError || "You do not have access to this patient's full record."}
          </p>
        </div>
      );
    }

    if (patientData.fullRecordStatus === 404) {
      if (role === "patient") {
        const empty = emptyFullRecord();
        return (
          <FullRecordForm
            role={role}
            fullRecord={patientData.fullRecord ?? empty}
            onChange={patientData.setFullRecord}
            onSave={handleSaveRecord}
          />
        );
      }

      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-blue-700">No full record has been created yet for this patient.</p>
        </div>
      );
    }

    if (!patientData.fullRecord) {
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
        fullRecord={patientData.fullRecord}
        onChange={patientData.setFullRecord}
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
          files={patientData.patientFiles}
          loading={patientData.filesLoading}
          error={patientData.filesError}
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
      role === "patient" && effectivePatient && effectivePatient.webId === webId;

    if (!isOwner) {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-3">Access control</h2>
          <p className="text-gray-600">Only the patient can grant or revoke access to their record.</p>
        </div>
      );
    }

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Access control (ACP)</h2>
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
              checked={patientData.doctorCanReadWrite}
              onChange={(e) => patientData.setDoctorCanReadWrite(e.target.checked)}
            />
            <div>
              <div className="font-medium text-gray-800">Doctor - read and write</div>
              <div className="text-sm text-gray-500">Allows full access to read and modify the record</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
            <input
              type="checkbox"
              className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
              checked={patientData.emergencyCanRead}
              onChange={(e) => patientData.setEmergencyCanRead(e.target.checked)}
            />
            <div>
              <div className="font-medium text-gray-800">Emergency contact - read only</div>
              <div className="text-sm text-gray-500">Allows viewing the record in emergency situations</div>
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
            onClick={audit.refreshAudit}
            disabled={audit.auditLoading}
          >
            {audit.auditLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {audit.auditError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {audit.auditError}
          </div>
        )}

        {audit.auditLoading && audit.auditEvents.length === 0 && (
          <div className="text-gray-600">Loading…</div>
        )}

        {!audit.auditLoading && audit.auditEvents.length === 0 && (
          <div className="text-gray-600">
            No logs found yet. Generate logs by granting, acknowledging, or revoking access.
          </div>
        )}

        {audit.auditEvents.length > 0 && (
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
                {audit.auditEvents.map((ev) => (
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
      {doctorGate.showLegalNotice && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 mb-3">Legal Notice</h2>
            <p className="text-gray-600 mb-3">This notice must be accepted each time access is granted.</p>

            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-auto">
              {doctorGate.legalNoticeText}
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg"
                onClick={doctorGate.cancelNotice}
              >
                Cancel
              </button>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
                onClick={async () => {
                  try {
                    await doctorGate.acceptNotice();
                  } catch (e: any) {
                    alert("Failed to acknowledge notice: " + (e?.message || String(e)));
                  }
                }}
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

              {patientData.fullRecordError && ![403, 404].includes(patientData.fullRecordStatus ?? 0) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                  {patientData.fullRecordError}
                </div>
              )}

              {renderFullRecord()}
              {renderFileManagement()}
            </section>

            <section>
              {renderAccessControls()}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-3">Role-specific notes</h2>

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
                  <p className="text-gray-600">As a pharmacy, you can view files that have been shared with you.</p>
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

export default App;