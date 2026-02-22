// src/app/errors.ts
export class LegalNoticeRequiredError extends Error {
  constructor() {
    super("LEGAL_NOTICE_REQUIRED");
    this.name = "LegalNoticeRequiredError";
  }
}

export class NoActiveGrantError extends Error {
  constructor() {
    super("NO_ACTIVE_GRANT");
    this.name = "NoActiveGrantError";
  }
}