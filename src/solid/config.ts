export function requireEnv(name: string): string {
  const v = import.meta.env[name];
  if (!v || typeof v !== "string")
    throw new Error(`Missing required env variable: ${name}`);
  return v;
}

export const SOLID_ISSUER = "http://localhost:3000/";
export const CLIENT_ID = "http://localhost:5173/clientid.json";
export const REDIRECT_URL = "http://localhost:5173/";
export const POST_LOGOUT_URL = "http://localhost:5173/";

export const DOCTOR_WEBID = "http://localhost:3000/doctor/profile/card#me";

export const EMERGENCY_WEBID = "http://localhost:3000/emergency/profile/card#me";

export const PHARMACY_WEBID = "http://localhost:3000/pharmacy/profile/card#me";

export const NURSE_WEBID = "http://localhost:3000/nurse/profile/card#me";

export const PATIENTS = {
  patient1: {
    label: "Patient 1",
    webId: "http://localhost:3000/patient/profile/card#me",
    podBaseUrl: "http://localhost:3000/patient/",
  },
  patient2: {
    label: "Patient 2",
    webId: "http://localhost:3000/patient2/profile/card#me",
    podBaseUrl: "http://localhost:3000/patient2/",
  },
  patient3: {
    label: "Patient 3",
    webId: "http://localhost:3000/patient3/profile/card#me",
    podBaseUrl: "http://localhost:3000/patient3/",
  },
  patient4: {
    label: "Patient 4",
    webId: "http://localhost:3000/patient4/profile/card#me",
    podBaseUrl: "http://localhost:3000/patient4/",
  }
} as const;
