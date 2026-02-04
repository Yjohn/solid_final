import React, { useEffect, useState } from "react";
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
} from "./solid/config";
import {
  emptyFullRecord,
  loadFullRecord,
  saveFullRecord,
  loadPatientFiles,
  savePatientFile,
  deletePatientFile,
} from "./solid/healthData";
import { applyAccessForFullRecord, readAccessForFullRecord } from "./solid/acp";
import PatientFileManager from "./components/PatientFileManager";
import FileUploadForm from "./components/FileUploadForm";

export type Role =
  | "patient"
  | "doctor"
  | "emergency"
  | "pharmacy"
  | "nurse"
  | "unknown";
type PatientKey = keyof typeof PATIENTS;

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<Role>("unknown");

  const [selectedPatient, setSelectedPatient] =
    useState<PatientKey>("patient1");
  const [fullRecord, setFullRecord] = useState<FullRecord | null>(null);
  const [fullRecordStatus, setFullRecordStatus] = useState<number | null>(null);
  const [fullRecordError, setFullRecordError] = useState<string | null>(null);

  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [showFileUpload, setShowFileUpload] = useState(false);
  const [editingFile, setEditingFile] = useState<PatientFile | null>(null);

  const [doctorCanReadWrite, setDoctorCanReadWrite] = useState(false);
  const [emergencyCanRead, setEmergencyCanRead] = useState(false);

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

  useEffect(() => {
    setFullRecord(null);
    setFullRecordStatus(null);
    setFullRecordError(null);
    setPatientFiles([]);
    setFilesError(null);
    setFilesLoading(false);
    if (!loggedIn) {
      setFullRecord(null);
      setFullRecordStatus(null);
      setFullRecordError(null);
      setPatientFiles([]);
      return;
    }

    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    if (!effectivePatient) {
      setFullRecord(null);
      setFullRecordStatus(null);
      setFullRecordError(
        "Could not determine which patient this WebID belongs to.",
      );
      setPatientFiles([]);
      return;
    }

    const patient = PATIENTS[effectivePatient];

    setFullRecord(null);
    setFullRecordStatus(null);
    setFullRecordError(null);

    let cancelled = false;

    loadFullRecord(session.fetch, patient.podBaseUrl)
      .then(({ data, status }) => {
        if (cancelled) return;
        setFullRecord(data);
        setFullRecordStatus(status);

        if (status === 404) {
          const empty = emptyFullRecord();
          setFullRecord(empty);
          setFullRecordStatus(404);
          setFullRecordError("No full record exists yet for this patient.");
          return;
        }

        if (status === 403) {
          setFullRecordError(
            "You do not have access to this patient's full record.",
          );
        } else if (status === 404) {
          setFullRecordError("No full record exists yet for this patient.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setFullRecord(null);
        setFullRecordStatus(null);
        setFullRecordError("Error loading full record: " + err.message);
      });

    setFilesLoading(true);
    setFilesError(null);

    loadPatientFiles(session.fetch, patient.podBaseUrl)
      .then((files) => {
        if (cancelled) return;
        setPatientFiles(files);
        setFilesLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFilesError("Error loading patient files: " + err.message);
        setFilesLoading(false);
      });

    if (role === "patient" && effectivePatient) {
      const patient = PATIENTS[effectivePatient];
      const resourceUrl = new URL("health/", patient.podBaseUrl).toString();
      readAccessForFullRecord(session.fetch, resourceUrl)
        .then(
          ({ doctorCanReadWrite: docAccess, emergencyCanRead: emgAccess }) => {
            if (cancelled) return;
            setDoctorCanReadWrite(docAccess);
            setEmergencyCanRead(emgAccess);
          },
        )
        .catch((err) => {
          if (cancelled) return;
          console.error("Error reading ACP:", err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [loggedIn, role, webId, selectedPatient]);

  function detectRole(id?: string): Role {
    if (!id) return "unknown";

    const patientKeys = Object.keys(PATIENTS) as PatientKey[];
    if (patientKeys.some((key) => PATIENTS[key].webId === id)) {
      return "patient";
    }

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

    return selected;
  }

  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  async function handleSaveRecord() {
    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    if (!effectivePatient || !fullRecord) return;

    const patient = PATIENTS[effectivePatient];

    try {
      await saveFullRecord(session.fetch, patient.podBaseUrl, fullRecord);
      alert("Record saved to pod.");
    } catch (e: any) {
      alert("Failed to save record: " + e.message);
    }
  }

  async function handleApplyAccess() {
    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    if (!effectivePatient) {
      alert("No patient selected.");
      return;
    }

    const patient = PATIENTS[effectivePatient];

    const resourceUrl = new URL("health/", patient.podBaseUrl).toString();

    try {
      await applyAccessForFullRecord(session.fetch, {
        resourceUrl,
        patientWebId: patient.webId,

        doctorWebId: DOCTOR_WEBID,
        emergencyWebId: EMERGENCY_WEBID,
        pharmacyWebId: PHARMACY_WEBID,
        nurseWebId: NURSE_WEBID,

        doctorCanReadWrite,
        emergencyCanRead,
        pharmacyCanRead: false,
        nurseCanReadWrite: false,
      });
      alert("ACP updated for this patient's /health/ container.");
    } catch (e: any) {
      alert("Failed to update access control: " + e.message);
    }
  }

  async function handleFileUpload(
    fileData: Omit<PatientFile, "id" | "createdAt" | "updatedAt">,
  ) {
    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    if (!effectivePatient) {
      alert("No patient selected.");
      return;
    }

    const patient = PATIENTS[effectivePatient];

    try {
      if (editingFile) {
        const updatedFiles = patientFiles.map((f) =>
          f.id === editingFile.id
            ? { ...f, ...fileData, updatedAt: new Date().toISOString() }
            : f,
        );
        const url = `${patient.podBaseUrl}health/files.json`;
        const res = await session.fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedFiles, null, 2),
        });
        if (!res.ok) throw new Error(res.statusText);
        setPatientFiles(updatedFiles);
        setEditingFile(null);
        setShowFileUpload(false);
        alert("File updated successfully!");
      } else {
        await savePatientFile(session.fetch, patient.podBaseUrl, fileData);
        alert("File saved successfully!");
        setShowFileUpload(false);
      }

      const files = await loadPatientFiles(session.fetch, patient.podBaseUrl);
      setPatientFiles(files);
    } catch (e: any) {
      alert("Failed to save file: " + e.message);
    }
  }

  async function handleFileDelete(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    if (!effectivePatient) {
      alert("No patient selected.");
      return;
    }

    const patient = PATIENTS[effectivePatient];

    try {
      await deletePatientFile(session.fetch, patient.podBaseUrl, fileId);

      // Update local state
      setPatientFiles((files) => files.filter((f) => f.id !== fileId));
      alert("File deleted successfully!");
    } catch (e: any) {
      alert("Failed to delete file: " + e.message);
    }
  }

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
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
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
    if (role === "patient") {
      const myKey = getEffectivePatientKey(role, webId, selectedPatient);
      const label = myKey ? PATIENTS[myKey].label : "Unknown patient";

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
    if (fullRecordStatus === 404 && role !== "patient" && role !== "doctor") {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Full record</h2>
          <p className="text-blue-700">
            No full record has been created yet for this patient.
          </p>
        </div>
      );
    }

    if (!loggedIn) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            Please log in to view or edit health records.
          </p>
        </div>
      );
    }

    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
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
            You do not have access to this patient's full record.
          </p>
        </div>
      );
    }

    if (fullRecordStatus === 404) {
      if (role === "patient" || role === "doctor") {
        const emptyRecord = emptyFullRecord();
        return (
          <FullRecordForm
            role={role}
            fullRecord={emptyRecord}
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

    const effectivePatient = getEffectivePatientKey(
      role,
      webId,
      selectedPatient,
    );
    const isOwner =
      role === "patient" &&
      effectivePatient &&
      PATIENTS[effectivePatient].webId === webId;

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
          Grant or revoke access to your{" "}
          <strong className="font-semibold">full record</strong> for the doctor
          and the emergency contact. These settings are written to an ACP ACR
          document in your Solid pod.
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

  function handleEditFile(file: PatientFile) {
    setEditingFile(file);
    setShowFileUpload(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {renderHeader()}

      <main className="container mx-auto px-4 pb-12">
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
                  As a doctor, you can view and edit the patient's full record
                  when granted access. You can also add and manage patient
                  files.
                </p>
              )}
              {role === "emergency" && (
                <p className="text-gray-600">
                  As the emergency profile, you should only see records where
                  the ACP grants you read access. If there is no access you will
                  see a clear message instead of another patient's data.
                </p>
              )}
              {role === "patient" && (
                <p className="text-gray-600">
                  You are logged in as the patient. You can add lab results,
                  prescriptions, and other medical files to your record. Use the
                  access control card to grant or revoke access for other roles.
                </p>
              )}
              {role === "pharmacy" && (
                <p className="text-gray-600">
                  As a pharmacy, you can view prescription files that have been
                  shared with you.
                </p>
              )}
              {role === "nurse" && (
                <p className="text-gray-600">
                  As a nurse, you can view patient files and assist with data
                  entry under doctor supervision.
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
          You are viewing this record read only. Only patients and doctors can
          edit.
        </p>
      )}
    </div>
  );
};

export default App;
