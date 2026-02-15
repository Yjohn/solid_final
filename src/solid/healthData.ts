// src/solid/healthData.ts
export type PatientKey = "patient1" | "patient2";

export type FullRecord = {
  patientName: string;
  dateOfBirth: string;
  bloodType: string;
  address: string;
  allergies: string;
  diagnoses: string;
  medications: string;
  notes: string;
};

export type PatientFile = {
  id: string;
  title: string;
  description: string;
  content: string;
  type: "lab" | "prescription" | "imaging" | "report" | "note";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  sharedWithDoctor: boolean;
  sharedWithEmergency: boolean;
  sharedWithNurse: boolean;
  sharedWithPharmacy: boolean;
};

export function emptyFullRecord(): FullRecord {
  return {
    patientName: "",
    dateOfBirth: "",
    bloodType: "",
    address: "",
    allergies: "",
    diagnoses: "",
    medications: "",
    notes: "",
  };
}

export async function loadFullRecord(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  autoCreateOn404: boolean = true,
): Promise<{ data: FullRecord | null; status: number }> {
  const url = `${podBaseUrl}health/full-record.json`;
  const res = await fetchFn(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  //   if (res.status === 404) {
  //     const emptyRecord = emptyFullRecord();
  //     await saveFullRecord(fetchFn, podBaseUrl, emptyRecord);
  //     return { data: emptyRecord, status: 200 };
  //   }
  //   if (res.status === 403) return { data: null, status: 403 };
  //   if (!res.ok) throw new Error(res.statusText);

  //   return { data: await res.json(), status: res.status };
  // }
  // Do NOT auto-create for doctors/emergency etc
  if (res.status === 404) {
    if (!autoCreateOn404) return { data: null, status: 404 };

    const emptyRecord = emptyFullRecord();
    await saveFullRecord(fetchFn, podBaseUrl, emptyRecord);
    return { data: emptyRecord, status: 200 };
  }

  if (res.status === 403) return { data: null, status: 403 };
  if (!res.ok) throw new Error(res.statusText);

  return { data: await res.json(), status: res.status };
}

export async function saveFullRecord(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  record: FullRecord,
): Promise<void> {
  const url = `${podBaseUrl}health/full-record.json`;
  const res = await fetchFn(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record, null, 2),
  });
  if (!res.ok) throw new Error(res.statusText);
}

export async function loadPatientFiles(
  fetchFn: typeof fetch,
  podBaseUrl: string,
): Promise<PatientFile[]> {
  const url = `${podBaseUrl}health/files.json`;
  const res = await fetchFn(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function savePatientFile(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  file: Omit<PatientFile, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  const files = await loadPatientFiles(fetchFn, podBaseUrl);
  const now = new Date().toISOString();

  files.push({
    ...file,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });

  const url = `${podBaseUrl}health/files.json`;
  const res = await fetchFn(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(files, null, 2),
  });
  if (!res.ok) throw new Error(res.statusText);
}

export async function deletePatientFile(
  fetchFn: typeof fetch,
  podBaseUrl: string,
  fileId: string,
): Promise<void> {
  const files = await loadPatientFiles(fetchFn, podBaseUrl);
  const filtered = files.filter((f) => f.id !== fileId);

  const url = `${podBaseUrl}health/files.json`;
  const res = await fetchFn(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filtered, null, 2),
  });
  if (!res.ok) throw new Error(res.statusText);
}
