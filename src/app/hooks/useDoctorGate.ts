// src/app/hooks/useDoctorGate.ts
import { useState } from "react";
import { session } from "../../solid/session";
import {
  acknowledgeGrant,
  getActiveGrantState,
  hasDoctorAcknowledged,
} from "../../solid/governanceSolid";
import type { GrantState } from "../../solid/governanceSolid";
import { DOCTOR_WEBID } from "../../solid/config";
import { LegalNoticeRequiredError, NoActiveGrantError } from "../errors";

export function useDoctorGate() {
  const [showLegalNotice, setShowLegalNotice] = useState(false);
  const [legalNoticeText, setLegalNoticeText] = useState("");
  const [pendingGrant, setPendingGrant] = useState<GrantState | null>(null);
  const [noticeAcceptedTick, setNoticeAcceptedTick] = useState(0);

  async function gateOrThrow(patientWebId: string, scopeUrl: string) {
    const st = await getActiveGrantState(session.fetch, {
      patientWebId,
      doctorWebId: DOCTOR_WEBID,
      scopeUrl,
    });

    if (!st || st.status !== "active" || !st.activeGrantUrl) {
      throw new NoActiveGrantError();
    }

    const ok = await hasDoctorAcknowledged(session.fetch, st.activeGrantUrl, DOCTOR_WEBID);
    if (ok) return;

    const termsRes = await session.fetch(st.termsUrl, { cache: "no-store" });
    const termsText = termsRes.ok ? await termsRes.text() : "Terms could not be loaded.";

    setPendingGrant(st);
    setLegalNoticeText(termsText);
    setShowLegalNotice(true);

    throw new LegalNoticeRequiredError();
  }

  async function acceptNotice() {
    if (!pendingGrant?.activeGrantUrl) return;

    await acknowledgeGrant(session.fetch, {
      grantUrl: pendingGrant.activeGrantUrl,
      doctorWebId: DOCTOR_WEBID,
      patientWebId: pendingGrant.patientWebId,
      scopeUrl: pendingGrant.scopeUrl,
      termsVersion: pendingGrant.termsVersion,
      termsHash: pendingGrant.termsHash,
    });

    setShowLegalNotice(false);
    setPendingGrant(null);
    setNoticeAcceptedTick((n) => n + 1);
  }

  function cancelNotice() {
    setShowLegalNotice(false);
    setPendingGrant(null);
  }

  function clearGateUi() {
    setShowLegalNotice(false);
    setPendingGrant(null);
  }

  return {
    showLegalNotice,
    legalNoticeText,
    noticeAcceptedTick,
    gateOrThrow,
    acceptNotice,
    cancelNotice,
    clearGateUi,
  };
}