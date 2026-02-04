import React, { useState } from "react";
import type { PatientFile } from "../solid/healthData";

interface FileUploadFormProps {
  onSubmit: (fileData: PatientFile) => void;
  onCancel: () => void;
  readOnly?: boolean;
  initialFileData?: PatientFile;
}

const FileUploadForm: React.FC<FileUploadFormProps> = ({
  onSubmit,
  onCancel,
  readOnly = false,
  initialFileData,
}) => {
  const [title, setTitle] = useState(initialFileData?.title || "");
  const [description, setDescription] = useState(
    initialFileData?.description || "",
  );
  const [content, setContent] = useState(initialFileData?.content || "");
  const [fileType, setFileType] = useState<PatientFile["type"]>(
    initialFileData?.type || "lab",
  );
  const [sharedWithDoctor, setSharedWithDoctor] = useState(
    initialFileData?.sharedWithDoctor ?? true,
  );
  const [sharedWithEmergency, setSharedWithEmergency] = useState(
    initialFileData?.sharedWithEmergency ?? false,
  );
  const [sharedWithNurse, setSharedWithNurse] = useState(
    initialFileData?.sharedWithNurse ?? true,
  );
  const [sharedWithPharmacy, setSharedWithPharmacy] = useState(
    initialFileData?.sharedWithPharmacy ?? false,
  );
  const [createdBy, setCreatedBy] = useState(initialFileData?.createdBy || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !createdBy.trim()) {
      alert("Title and Created By are required");
      return;
    }

    const submittedData: PatientFile = {
      id: initialFileData?.id || crypto.randomUUID(),
      createdAt: initialFileData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title,
      description,
      content,
      type: fileType,
      sharedWithDoctor,
      sharedWithEmergency,
      sharedWithNurse,
      sharedWithPharmacy,
      createdBy,
    };

    onSubmit(submittedData);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New File</h3>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File Type
            </label>
            <select
              value={fileType}
              onChange={(e) =>
                setFileType(e.target.value as PatientFile["type"])
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={readOnly}
            >
              <option value="lab">Lab Results</option>
              <option value="prescription">Prescription</option>
              <option value="imaging">Imaging Report</option>
              <option value="report">Medical Report</option>
              <option value="note">Doctor's Note</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={readOnly}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Created By *
            </label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={readOnly}
              placeholder="e.g., Dr. Smith, Lab Technician, etc."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content (optional)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter detailed content, results, or notes here..."
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Share with:
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 p-2 bg-white border border-gray-300 rounded-lg">
              <input
                type="checkbox"
                checked={sharedWithDoctor}
                onChange={(e) => setSharedWithDoctor(e.target.checked)}
                className="h-4 w-4 text-blue-600"
                disabled={readOnly}
              />
              <span className="text-sm">Doctor</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-white border border-gray-300 rounded-lg">
              <input
                type="checkbox"
                checked={sharedWithEmergency}
                onChange={(e) => setSharedWithEmergency(e.target.checked)}
                className="h-4 w-4 text-blue-600"
                disabled={readOnly}
              />
              <span className="text-sm">Emergency</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-white border border-gray-300 rounded-lg">
              <input
                type="checkbox"
                checked={sharedWithNurse}
                onChange={(e) => setSharedWithNurse(e.target.checked)}
                className="h-4 w-4 text-blue-600"
                disabled={readOnly}
              />
              <span className="text-sm">Nurse</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-white border border-gray-300 rounded-lg">
              <input
                type="checkbox"
                checked={sharedWithPharmacy}
                onChange={(e) => setSharedWithPharmacy(e.target.checked)}
                className="h-4 w-4 text-blue-600"
                disabled={readOnly}
              />
              <span className="text-sm">Pharmacy</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
            disabled={readOnly}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={readOnly}
          >
            {initialFileData ? "Update File" : "Add File"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FileUploadForm;
