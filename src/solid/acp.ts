// src/solid/acp.ts
import type { AuthenticatedFetch } from "./session";
import { SOLID_ISSUER, CLIENT_ID } from "./config";

type AccessOptions = {
  resourceUrl: string;
  patientWebId: string;

  doctorWebId: string;
  emergencyWebId: string;
  pharmacyWebId: string;
  nurseWebId: string;

  doctorCanReadWrite: boolean;
  emergencyCanRead: boolean;
  pharmacyCanRead: boolean;
  nurseCanReadWrite: boolean;

  restrictToClientAndIssuer?: boolean;
};

function matcherBlock(agentWebId: string, restrict: boolean): string {
  if (!restrict) {
    return `
    acp:anyOf [
      a acp:Matcher;
      acp:agent <${agentWebId}>;
    ];`.trim();
  }

  const issuer = SOLID_ISSUER.endsWith("/") ? SOLID_ISSUER : SOLID_ISSUER + "/";

  return `
    acp:anyOf [
      a acp:Matcher;
      acp:agent <${agentWebId}>;
      acp:client <${CLIENT_ID}>;
      acp:issuer <${issuer}>;
    ];`.trim();
}

function buildAcrTurtle(opts: AccessOptions): string {
  const {
    resourceUrl,
    patientWebId,
    doctorWebId,
    emergencyWebId,
    pharmacyWebId,
    nurseWebId,
    doctorCanReadWrite,
    emergencyCanRead,
    pharmacyCanRead,
    nurseCanReadWrite,
    restrictToClientAndIssuer = true,
  } = opts;

  const accessControls: string[] = ["<#ownerAccessControl>"];
  if (doctorCanReadWrite) accessControls.push("<#doctorAccessControl>");
  if (emergencyCanRead) accessControls.push("<#emergencyAccessControl>");
  if (pharmacyCanRead) accessControls.push("<#pharmacyAccessControl>");
  if (nurseCanReadWrite) accessControls.push("<#nurseAccessControl>");

  return `
@prefix acp: <http://www.w3.org/ns/solid/acp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#root>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}>;
  acp:accessControl ${accessControls.join(", ")};
  acp:memberAccessControl ${accessControls.join(", ")} .

<#filesJsonACR>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}files.json>;
  acp:accessControl ${accessControls.join(", ")} .

<#fullRecordJsonACR>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}full-record.json>;
  acp:accessControl ${accessControls.join(", ")} .

<#ownerAccessControl>
  a acp:AccessControl;
  acp:apply [
    a acp:Policy;
    acp:allow acl:Read, acl:Write, acl:Append, acl:Control;
${matcherBlock(patientWebId, restrictToClientAndIssuer)}
  ] .

${
  doctorCanReadWrite
    ? `
<#doctorAccessControl>
  a acp:AccessControl;
  acp:apply [
    a acp:Policy;
    acp:allow acl:Read, acl:Write;
${matcherBlock(doctorWebId, restrictToClientAndIssuer)}
  ] .
`
    : ""
}

${
  emergencyCanRead
    ? `
<#emergencyAccessControl>
  a acp:AccessControl;
  acp:apply [
    a acp:Policy;
    acp:allow acl:Read;
${matcherBlock(emergencyWebId, restrictToClientAndIssuer)}
  ] .
`
    : ""
}

${
  pharmacyCanRead
    ? `
<#pharmacyAccessControl>
  a acp:AccessControl;
  acp:apply [
    a acp:Policy;
    acp:allow acl:Read;
${matcherBlock(pharmacyWebId, restrictToClientAndIssuer)}
  ] .
`
    : ""
}

${
  nurseCanReadWrite
    ? `
<#nurseAccessControl>
  a acp:AccessControl;
  acp:apply [
    a acp:Policy;
    acp:allow acl:Read, acl:Write;
${matcherBlock(nurseWebId, restrictToClientAndIssuer)}
  ] .
`
    : ""
}
`.trim();
}

function acrUrlForResource(resourceUrl: string): string {
  return `${resourceUrl}.acr`;
}

export async function applyAcpForResource(
  fetchFn: AuthenticatedFetch,
  options: AccessOptions,
): Promise<void> {
  const acrUrl = acrUrlForResource(options.resourceUrl);
  const turtle = buildAcrTurtle(options);

  const res = await fetchFn(acrUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update ACR: ${res.status} ${res.statusText}\n${text}`);
  }
}

export const applyAccessForFullRecord = applyAcpForResource;

/**
 * Read ACP “intent” by inspecting the ACR Turtle for policy blocks.
 * This fixes the previous approach that probed access with the patient’s own fetch (always succeeds).
 */
export async function readAccessForFullRecord(
  fetchFn: AuthenticatedFetch,
  resourceUrl: string, // health/ container URL
): Promise<{ doctorCanReadWrite: boolean; emergencyCanRead: boolean }> {
  const acrUrl = acrUrlForResource(resourceUrl);
  const res = await fetchFn(acrUrl, {
    method: "GET",
    headers: { Accept: "text/turtle" },
    cache: "no-store",
  });

  if (res.status === 404) {
    return { doctorCanReadWrite: false, emergencyCanRead: false };
  }

  if (!res.ok) {
    // If ACR can't be read, default to false (don’t auto-check toggles on)
    return { doctorCanReadWrite: false, emergencyCanRead: false };
  }

  const ttl = await res.text();
  const doctorCanReadWrite = ttl.includes("<#doctorAccessControl>");
  const emergencyCanRead = ttl.includes("<#emergencyAccessControl>");

  return { doctorCanReadWrite, emergencyCanRead };
}