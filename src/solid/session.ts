// src/solid/session.ts
import {
  getDefaultSession,
  handleIncomingRedirect,
  login as solidLogin,
} from "@inrupt/solid-client-authn-browser";
import { SOLID_ISSUER, CLIENT_ID, REDIRECT_URL, POST_LOGOUT_URL } from "./config";

export type AuthenticatedFetch = typeof getDefaultSession extends () => infer S
  ? S extends { fetch: infer F }
    ? F
    : never
  : never;

export const session = getDefaultSession();

export async function initSessionFromRedirect(): Promise<void> {
  await handleIncomingRedirect();
}

export function isLoggedIn(): boolean {
  return session.info.isLoggedIn;
}

export function getWebId(): string | undefined {
  return session.info.webId;
}

export async function login(): Promise<void> {
  await solidLogin({
    oidcIssuer: SOLID_ISSUER,
    redirectUrl: REDIRECT_URL,
    clientId: CLIENT_ID,
  });
}

export async function logout(): Promise<void> {
  await session.logout();
  window.location.href = POST_LOGOUT_URL;
}