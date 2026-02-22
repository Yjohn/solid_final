// src/components/PatientFileManager.tsx
import React from "react";
import type { PatientFile } from "../solid/healthData";
import type { Role } from "../app/hooks/usePatientContext";

interface PatientFileManagerProps {
  files: PatientFile[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onDelete: (fileId: string) => void;
  onEdit: (file: PatientFile) => void;
  role: Role;
}

const PatientFileManager: React.FC<PatientFileManagerProps> = ({
  files,
  loading,
  error,
  canEdit,
  onDelete,
  onEdit,
  role,
}) => {
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "lab":
        return "🔬";
      case "prescription":
        return "💊";
      case "imaging":
        return "🩻";
      case "report":
        return "📄";
      case "note":
        return "📝";
      default:
        return "📁";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-500">No files have been added yet.</p>
        {canEdit && (
          <p className="text-gray-400 text-sm mt-2">
            Click "Add New File" to add lab results, prescriptions, etc.
          </p>
        )}
      </div>
    );
  }

  const filteredFiles = files.filter((file) => {
    if (role === "pharmacy") {
      return file.type === "prescription";
    }
    if (role === "emergency") {
      return file.sharedWithEmergency;
    }
    if (role === "nurse") {
      return file.sharedWithNurse;
    }
    if (role === "doctor") {
      return file.sharedWithDoctor;
    }
    return true;
  });

  if (filteredFiles.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-500">No files available for your role.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredFiles.map((file) => (
        <div
          key={file.id}
          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-200"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{getFileIcon(file.type)}</span>
              <div>
                <h3 className="font-semibold text-gray-800">{file.title}</h3>

                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    {file.type}
                  </span>

                  {file.sharedWithDoctor && (
                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                      Shared with Doctor
                    </span>
                  )}
                  {file.sharedWithEmergency && (
                    <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                      Shared with Emergency
                    </span>
                  )}
                  {file.sharedWithNurse && (
                    <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                      Shared with Nurse
                    </span>
                  )}
                  {file.sharedWithPharmacy && (
                    <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                      Shared with Pharmacy
                    </span>
                  )}
                </div>

                <p className="text-gray-600 text-sm mt-2">{file.description}</p>

                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Created: {formatDate(file.createdAt)}</span>
                  {file.updatedAt !== file.createdAt && (
                    <span>Updated: {formatDate(file.updatedAt)}</span>
                  )}
                  <span>By: {file.createdBy}</span>
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(file)}
                  className="text-blue-600 hover:text-blue-800 p-2"
                  title="Edit file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>

                <button
                  onClick={() => onDelete(file.id)}
                  className="text-red-600 hover:text-red-800 p-2"
                  title="Delete file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {file.content && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-700 text-sm mb-2">Content:</h4>
              <pre className="text-gray-600 text-sm whitespace-pre-wrap">{file.content}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PatientFileManager;