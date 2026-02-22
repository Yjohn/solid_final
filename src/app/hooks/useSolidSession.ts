// src/app/hooks/useSolidSession.ts
import { useEffect, useState } from "react";
import {
  initSessionFromRedirect,
  isLoggedIn,
  getWebId,
  login,
  logout,
} from "../../solid/session";

export function useSolidSession() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      await initSessionFromRedirect();
      setLoggedIn(isLoggedIn());
      setWebId(getWebId());
      setReady(true);
    })();
  }, []);

  async function handleLogin() {
    await login();
  }

  async function handleLogout() {
    await logout(); // the solid/session.ts already redirects
  }

  return { ready, loggedIn, webId, login: handleLogin, logout: handleLogout };
}