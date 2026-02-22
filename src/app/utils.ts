// src/app/utils.ts
export function shortId(w?: string) {
  if (!w) return "";
  return w.replace("http://localhost:3000/", "").replace("/profile/card#me", "");
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}