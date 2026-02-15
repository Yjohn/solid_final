// src/solid/governanceSolid.ts
import type { AuthenticatedFetch } from "./session";
import {
  GOVERNANCE_POD_BASE,
  GOVERNANCE_WEBID,
  DOCTOR_WEBID,
  PATIENTS,
} from "./config";

/**
 * Minimal, stable governance layer:
 * - Terms: plain text file
 * - Grant state: JSON at /governance/grants/state/<key>.json (patient writes, doctor reads)
 * - Acknowledgement: JSON at /governance/grants/acks/<key>-<grantId>.json (doctor writes)
 * - Audit: JSON event files at /governance/audit/events/<uuid>.json (patient/doctor write)
 *
 * Uses only GET/PUT so it works reliably on CSS without PATCH/POST dependencies.
 */

const TERMS_VERSION = "v1.0";
const TERMS_TEXT =
  "Data Use Notice: You may access this patient record only for the authorised care purpose.\n" +
  "You must not retain, export, or disclose this data outside authorised systems.\n" +
  "Access is logged. If access is revoked, you must stop using any retained copies immediately.\n" +
  "By continuing, you confirm you understand and agree to these terms.";

const GOV = {
  noticesContainer: `${GOVERNANCE_POD_BASE}notices/`,
  termsUrl: `${GOVERNANCE_POD_BASE}notices/terms/v1.txt`,

  grantsContainer: `${GOVERNANCE_POD_BASE}grants/`,
  grantsStateContainer: `${GOVERNANCE_POD_BASE}grants/state/`,
  grantsAcksContainer: `${GOVERNANCE_POD_BASE}grants/acks/`,

  auditContainer: `${GOVERNANCE_POD_BASE}audit/`,
  auditEventsContainer: `${GOVERNANCE_POD_BASE}audit/events/`,
};

export type GrantState = {
  key: string;
  patientWebId: string;
  doctorWebId: string;
  scopeUrl: string;

  status: "active" | "revoked";
  updatedAt: string;

  termsVersion: string;
  termsUrl: string;
  termsHash: string;

  grantId: string;

  // App.tsx expects this name.
  // In this minimal design, activeGrantUrl is the acknowledgement URL (doctor writes it).
  activeGrantUrl: string;
};

type Ack = {
  acknowledgedBy: string;
  acknowledgedAt: string;
  termsVersion: string;
  termsHash: string;
};

export type AuditEvent = {
  eventId: string;
  at: string;
  type: "GRANT" | "NOTICE_ACK" | "REVOKE" | "READ_BLOCKED";
  actorWebId: string;
  patientWebId: string;
  doctorWebId: string;
  scopeUrl: string;
  grantId?: string;
  ackUrl?: string;
  termsVersion?: string;
  termsHash?: string;
  eventHash: string;
};

function nowIso() {
  return new Date().toISOString();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = Array.from(new Uint8Array(buf));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable enough for this demo (shallow key sort)
function canonicalJson(obj: unknown): string {
  const anyObj = obj as any;
  return JSON.stringify(anyObj, Object.keys(anyObj).sort());
}

async function ensureContainer(fetchFn: AuthenticatedFetch, containerUrl: string): Promise<void> {
  const res = await fetchFn(containerUrl, { method: "GET", cache: "no-store" });
  if (res.ok) return;

  if (res.status !== 404) {
    const t = await res.text().catch(() => "");
    throw new Error(`Cannot access container ${containerUrl}: ${res.status}\n${t}`);
  }

  const turtle = `
@prefix ldp: <http://www.w3.org/ns/ldp#>.
<> a ldp:BasicContainer, ldp:Container .
`.trim();

  const created = await fetchFn(containerUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle; charset=utf-8" },
    body: turtle,
  });

  if (!created.ok && created.status !== 412) {
    const t = await created.text().catch(() => "");
    throw new Error(`Failed to create container ${containerUrl}: ${created.status}\n${t}`);
  }
}

async function putText(fetchFn: AuthenticatedFetch, url: string, text: string): Promise<void> {
  const res = await fetchFn(url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    body: text,
  });

  if (!res.ok && res.status !== 412) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed PUT text ${url}: ${res.status}\n${t}`);
  }
}

async function putJson(fetchFn: AuthenticatedFetch, url: string, body: unknown): Promise<void> {
  const res = await fetchFn(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body, null, 2),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed PUT json ${url}: ${res.status}\n${t}`);
  }
}

async function getJson<T>(fetchFn: AuthenticatedFetch, url: string): Promise<T | null> {
  const res = await fetchFn(url, { method: "GET", cache: "no-store" });
  if (res.status === 404) return null;

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed GET ${url}: ${res.status}\n${t}`);
  }
  return (await res.json()) as T;
}

function matcherAgentsBlock(agentWebIds: string[]): string {
  return `
    acp:anyOf [
      a acp:Matcher;
      acp:agent ${agentWebIds.map((w) => `<${w}>`).join(", ")};
    ];`.trim();
}

function buildContainerAcr(args: {
  resourceUrl: string;
  ownerWebId: string;
  readers?: string[];
  writers?: string[];
}): string {
  const readers = args.readers ?? [];
  const writers = args.writers ?? [];

  const accessControls: string[] = ["<#owner>"];
  if (readers.length) accessControls.push("<#readers>");
  if (writers.length) accessControls.push("<#writers>");

  return `
@prefix acp: <http://www.w3.org/ns/solid/acp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#root>
  a acp:AccessControlResource ;
  acp:resource <${args.resourceUrl}> ;
  acp:accessControl ${accessControls.join(", ")} ;
  acp:memberAccessControl ${accessControls.join(", ")} .

<#owner>
  a acp:AccessControl ;
  acp:apply [
    a acp:Policy ;
    acp:allow acl:Read, acl:Write, acl:Append, acl:Control ;
${matcherAgentsBlock([args.ownerWebId])}
  ] .

${
  readers.length
    ? `
<#readers>
  a acp:AccessControl ;
  acp:apply [
    a acp:Policy ;
    acp:allow acl:Read ;
${matcherAgentsBlock(readers)}
  ] .
`
    : ""
}

${
  writers.length
    ? `
<#writers>
  a acp:AccessControl ;
  acp:apply [
    a acp:Policy ;
    acp:allow acl:Write, acl:Append ;
${matcherAgentsBlock(writers)}
  ] .
`
    : ""
}
`.trim();
}

function buildResourceAcr(args: {
  resourceUrl: string;
  ownerWebId: string;
  readers?: string[];
}): string {
  const readers = args.readers ?? [];
  const accessControls: string[] = ["<#owner>"];
  if (readers.length) accessControls.push("<#readers>");

  return `
@prefix acp: <http://www.w3.org/ns/solid/acp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#root>
  a acp:AccessControlResource ;
  acp:resource <${args.resourceUrl}> ;
  acp:accessControl ${accessControls.join(", ")} .

<#owner>
  a acp:AccessControl ;
  acp:apply [
    a acp:Policy ;
    acp:allow acl:Read, acl:Write, acl:Append, acl:Control ;
${matcherAgentsBlock([args.ownerWebId])}
  ] .

${
  readers.length
    ? `
<#readers>
  a acp:AccessControl ;
  acp:apply [
    a acp:Policy ;
    acp:allow acl:Read ;
${matcherAgentsBlock(readers)}
  ] .
`
    : ""
}
`.trim();
}

async function putAcr(fetchFn: AuthenticatedFetch, resourceUrl: string, turtle: string): Promise<void> {
  const acrUrl = `${resourceUrl}.acr`;
  const res = await fetchFn(acrUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle; charset=utf-8", "Cache-Control": "no-store" },
    body: turtle,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed PUT ACR ${acrUrl}: ${res.status}\n${t}`);
  }
}

async function makeKey(patientWebId: string, doctorWebId: string, scopeUrl: string): Promise<string> {
  const raw = `${patientWebId}::${doctorWebId}::${scopeUrl}`;
  const h = await sha256Hex(raw);
  return h.slice(0, 20);
}

function stateUrlForKey(key: string): string {
  return `${GOV.grantsStateContainer}${key}.json`;
}

function ackUrlFor(key: string, grantId: string): string {
  return `${GOV.grantsAcksContainer}${key}-${grantId}.json`;
}

async function writeAudit(
  fetchFn: AuthenticatedFetch,
  ev: Omit<AuditEvent, "eventId" | "at" | "eventHash">,
): Promise<void> {
  const eventId = uuid();
  const at = nowIso();
  const base = { eventId, at, ...ev };
  const eventHash = await sha256Hex(canonicalJson(base));
  const full: AuditEvent = { ...(base as any), eventHash };

  await putJson(fetchFn, `${GOV.auditEventsContainer}${eventId}.json`, full);
}

/**
 * Run once while logged in as Governance WebID.
 */
export async function bootstrapGovernanceStore(fetchFn: AuthenticatedFetch): Promise<void> {
  await ensureContainer(fetchFn, GOV.noticesContainer);
  await ensureContainer(fetchFn, GOV.grantsContainer);
  await ensureContainer(fetchFn, GOV.grantsStateContainer);
  await ensureContainer(fetchFn, GOV.grantsAcksContainer);
  await ensureContainer(fetchFn, GOV.auditContainer);
  await ensureContainer(fetchFn, GOV.auditEventsContainer);

  await putText(fetchFn, GOV.termsUrl, TERMS_TEXT);

  const patientWebIds = Object.values(PATIENTS).map((p) => p.webId);
  const actors = [DOCTOR_WEBID, ...patientWebIds];

  // Terms readable by everyone in demo
  await putAcr(
    fetchFn,
    GOV.noticesContainer,
    buildContainerAcr({
      resourceUrl: GOV.noticesContainer,
      ownerWebId: GOVERNANCE_WEBID,
      readers: actors,
      writers: [],
    }),
  );

  await putAcr(
    fetchFn,
    GOV.termsUrl,
    buildResourceAcr({
      resourceUrl: GOV.termsUrl,
      ownerWebId: GOVERNANCE_WEBID,
      readers: actors,
    }),
  );

  // State: doctor + patients read; patients write
  await putAcr(
    fetchFn,
    GOV.grantsStateContainer,
    buildContainerAcr({
      resourceUrl: GOV.grantsStateContainer,
      ownerWebId: GOVERNANCE_WEBID,
      readers: actors,
      writers: patientWebIds,
    }),
  );

  // Acks: doctor writes; doctor + patients read
  await putAcr(
    fetchFn,
    GOV.grantsAcksContainer,
    buildContainerAcr({
      resourceUrl: GOV.grantsAcksContainer,
      ownerWebId: GOVERNANCE_WEBID,
      readers: actors,
      writers: [DOCTOR_WEBID],
    }),
  );

  // Audit: governance reads (owner). actors write. actors do not read in demo.
  await putAcr(
    fetchFn,
    GOV.auditEventsContainer,
    buildContainerAcr({
      resourceUrl: GOV.auditEventsContainer,
      ownerWebId: GOVERNANCE_WEBID,
      readers: [], // keep private
      writers: actors,
    }),
  );

  await writeAudit(fetchFn, {
    type: "GRANT",
    actorWebId: GOVERNANCE_WEBID,
    patientWebId: GOVERNANCE_WEBID,
    doctorWebId: DOCTOR_WEBID,
    scopeUrl: GOV.auditEventsContainer,
    termsVersion: TERMS_VERSION,
    termsHash: await sha256Hex(`${TERMS_VERSION}::${TERMS_TEXT}`),
  });
}

export async function createGrantAndActivate(
  fetchFn: AuthenticatedFetch,
  args: { patientWebId: string; doctorWebId: string; scopeUrl: string },
): Promise<{ grantId: string; grantUrl: string }> {
  const key = await makeKey(args.patientWebId, args.doctorWebId, args.scopeUrl);
  const grantId = uuid();
  const updatedAt = nowIso();

  const termsHash = await sha256Hex(`${TERMS_VERSION}::${TERMS_TEXT}`);
  const ackUrl = ackUrlFor(key, grantId);

  const state: GrantState = {
    key,
    patientWebId: args.patientWebId,
    doctorWebId: args.doctorWebId,
    scopeUrl: args.scopeUrl,
    status: "active",
    updatedAt,
    termsVersion: TERMS_VERSION,
    termsUrl: GOV.termsUrl,
    termsHash,
    grantId,
    activeGrantUrl: ackUrl,
  };

  await putJson(fetchFn, stateUrlForKey(key), state);

  await writeAudit(fetchFn, {
    type: "GRANT",
    actorWebId: args.patientWebId,
    patientWebId: args.patientWebId,
    doctorWebId: args.doctorWebId,
    scopeUrl: args.scopeUrl,
    grantId,
    ackUrl,
    termsVersion: TERMS_VERSION,
    termsHash,
  });

  return { grantId, grantUrl: ackUrl };
}

export async function revokeActiveGrant(
  fetchFn: AuthenticatedFetch,
  args: { patientWebId: string; doctorWebId: string; scopeUrl: string },
): Promise<void> {
  const key = await makeKey(args.patientWebId, args.doctorWebId, args.scopeUrl);
  const url = stateUrlForKey(key);
  const state = await getJson<GrantState>(fetchFn, url);

  if (!state) return;

  const updatedAt = nowIso();
  const next: GrantState = { ...state, status: "revoked", updatedAt };

  await putJson(fetchFn, url, next);

  await writeAudit(fetchFn, {
    type: "REVOKE",
    actorWebId: args.patientWebId,
    patientWebId: args.patientWebId,
    doctorWebId: args.doctorWebId,
    scopeUrl: args.scopeUrl,
    grantId: state.grantId,
    ackUrl: state.activeGrantUrl,
    termsVersion: state.termsVersion,
    termsHash: state.termsHash,
  });
}

export async function getActiveGrantState(
  fetchFn: AuthenticatedFetch,
  args: { patientWebId: string; doctorWebId: string; scopeUrl: string },
): Promise<GrantState | null> {
  const key = await makeKey(args.patientWebId, args.doctorWebId, args.scopeUrl);
  return getJson<GrantState>(fetchFn, stateUrlForKey(key));
}

export async function hasDoctorAcknowledged(
  fetchFn: AuthenticatedFetch,
  ackUrl: string,
  doctorWebId: string,
): Promise<boolean> {
  const res = await fetchFn(ackUrl, { method: "GET", cache: "no-store" });
  if (res.status === 404) return false;
  if (!res.ok) return false;

  try {
    const ack = (await res.json()) as Ack;
    return ack.acknowledgedBy === doctorWebId;
  } catch {
    return true;
  }
}

export async function acknowledgeGrant(
  fetchFn: AuthenticatedFetch,
  args: {
    grantUrl: string; // ackUrl
    doctorWebId: string;
    patientWebId: string;
    scopeUrl: string;
    termsVersion: string;
    termsHash: string;
  },
): Promise<void> {
  const ack: Ack = {
    acknowledgedBy: args.doctorWebId,
    acknowledgedAt: nowIso(),
    termsVersion: args.termsVersion,
    termsHash: args.termsHash,
  };

  await putJson(fetchFn, args.grantUrl, ack);

  await writeAudit(fetchFn, {
    type: "NOTICE_ACK",
    actorWebId: args.doctorWebId,
    patientWebId: args.patientWebId,
    doctorWebId: args.doctorWebId,
    scopeUrl: args.scopeUrl,
    ackUrl: args.grantUrl,
    termsVersion: args.termsVersion,
    termsHash: args.termsHash,
  });
}

// =======================
// Governance log listing
// =======================

async function listContainerMembers(fetchFn: AuthenticatedFetch, containerUrl: string): Promise<string[]> {
  const res = await fetchFn(containerUrl, {
    method: "GET",
    headers: {
      Accept: "text/turtle, application/ld+json;q=0.9",
      "Cache-Control": "no-store",
    },
    cache: "no-store",
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Failed to list container ${containerUrl}: ${res.status}\n${t}`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const body = await res.text();

  // JSON-LD path
  if (ct.includes("application/ld+json")) {
    try {
      const json = JSON.parse(body);
      const nodes = Array.isArray(json) ? json : [json];
      const containsKey = "http://www.w3.org/ns/ldp#contains";

      const out: string[] = [];
      for (const n of nodes) {
        const contains = n[containsKey];
        if (!contains) continue;

        const arr = Array.isArray(contains) ? contains : [contains];
        for (const x of arr) {
          const id = x?.["@id"];
          if (id) out.push(new URL(id, containerUrl).toString());
        }
      }
      return Array.from(new Set(out));
    } catch {
      // fall through to Turtle parsing
    }
  }

  // Turtle path: handle both "ldp:contains" and "<http://www.w3.org/ns/ldp#contains>"
  const urls = new Set<string>();

  // Find complete statements for contains, then extract all IRIs in that statement.
  const stmtRe =
    /(?:\bldp:contains\b|<http:\/\/www\.w3\.org\/ns\/ldp#contains>)\s+([^.]*)\./gms;

  let stmtMatch: RegExpExecArray | null;
  while ((stmtMatch = stmtRe.exec(body))) {
    const objects = stmtMatch[1];
    const iriRe = /<([^>]+)>/g;
    let iriMatch: RegExpExecArray | null;
    while ((iriMatch = iriRe.exec(objects))) {
      const raw = iriMatch[1];
      urls.add(new URL(raw, containerUrl).toString());
    }
  }

  // Extra safety: also catch single-object patterns
  const singleRe =
    /(?:\bldp:contains\b|<http:\/\/www\.w3\.org\/ns\/ldp#contains>)\s*<([^>]+)>/g;

  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(body))) {
    urls.add(new URL(m[1], containerUrl).toString());
  }

  return Array.from(urls);
}

export async function listAuditEvents(
  fetchFn: AuthenticatedFetch,
  opts?: { limit?: number },
): Promise<AuditEvent[]> {
  const limit = opts?.limit ?? 300;

  const members = await listContainerMembers(fetchFn, GOV.auditEventsContainer);
  const eventUrls = members.filter((u) => u.endsWith(".json"));

  const events: AuditEvent[] = [];
  const chunkSize = 15;

  for (let i = 0; i < eventUrls.length; i += chunkSize) {
    const chunk = eventUrls.slice(i, i + chunkSize);

    const chunkResults = await Promise.all(
      chunk.map(async (url) => {
        try {
          const ev = await getJson<AuditEvent>(fetchFn, url);
          return ev;
        } catch {
          return null;
        }
      }),
    );

    for (const ev of chunkResults) {
      if (ev) events.push(ev);
    }
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, limit);
}
