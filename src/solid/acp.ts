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
const accessControls: string[] = ["<#ownerAccess>"];
  if (doctorCanReadWrite) accessControls.push("<#doctorAccess>");
  if (emergencyCanRead) accessControls.push("<#emergencyAccess>");
  if (pharmacyCanRead) accessControls.push("<#pharmacyAccess>");
  if (nurseCanReadWrite) accessControls.push("<#nurseAccess>");
  return `
@prefix acp: <http://www.w3.org/ns/solid/acp#>.
@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#root>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}>;
  acp:accessControl ${accessControls.join(", ")};
  acp:memberAccessControl ${accessControls.join(", ")} .
  
<#healthContainerACR>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}>;
  acp:accessControl <#ownerAccessControl>${doctorCanReadWrite ? ", <#doctorAccessControl>" : ""}${emergencyCanRead ? ", <#emergencyAccessControl>" : ""}${pharmacyCanRead ? ", <#pharmacyAccessControl>" : ""}${nurseCanReadWrite ? ", <#nurseAccessControl>" : ""} .

<#filesJsonACR>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}files.json>;
  acp:accessControl <#ownerAccessControl>${doctorCanReadWrite ? ", <#doctorAccessControl>" : ""}${emergencyCanRead ? ", <#emergencyAccessControl>" : ""}${pharmacyCanRead ? ", <#pharmacyAccessControl>" : ""}${nurseCanReadWrite ? ", <#nurseAccessControl>" : ""} .

<#fullRecordJsonACR>
  a acp:AccessControlResource;
  acp:resource <${resourceUrl}full-record.json>;
  acp:accessControl <#ownerAccessControl>${doctorCanReadWrite ? ", <#doctorAccessControl>" : ""}${emergencyCanRead ? ", <#emergencyAccessControl>" : ""}${pharmacyCanRead ? ", <#pharmacyAccessControl>" : ""}${nurseCanReadWrite ? ", <#nurseAccessControl>" : ""} .

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
  options: AccessOptions
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

export async function readAccessForFullRecord(
  fetchFn: AuthenticatedFetch,
  resourceUrl: string,
): Promise<{ doctorCanReadWrite: boolean; emergencyCanRead: boolean }> {

  const fullRecordUrl = `${resourceUrl}full-record.json`;

  const checkAccess = async (method: "GET" | "PUT") => {
    const res = await fetchFn(fullRecordUrl, { method });
    return res.status !== 403;
  };

  let doctorCanReadWrite = false;
  let emergencyCanRead = false;

  try {
    doctorCanReadWrite =
      (await checkAccess("GET")) && (await checkAccess("PUT"));

    emergencyCanRead = await checkAccess("GET");

  } catch (e) {
    console.error("Access probe failed:", e);
  }

  return { doctorCanReadWrite, emergencyCanRead };
}
