/* Formats d'affichage (français). Fonctions pures : testées dans tests/unit. */
export function toMillis(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t instanceof Date) return t.getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}

export function relativeTime(t, now = Date.now()) {
  const ms = toMillis(t);
  if (!ms) return "—";
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} jours`;
  return dateLabel(ms);
}

export function dateLabel(t) {
  const ms = toMillis(t);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTimeLabel(t) {
  const ms = toMillis(t);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function bytesLabel(n) {
  const v = Number(n) || 0;
  if (v < 1000) return `${v} o`;
  if (v < 1e6) return `${(v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko`;
  return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export function durationLabel(ms) {
  const v = Math.max(0, Math.round(Number(ms) || 0));
  if (v < 1000) return `${v} ms`;
  const s = v / 1000;
  if (s < 60) return `${s.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export function dayKey(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function initials(first, last, email) {
  const a = (first || "").trim(), b = (last || "").trim();
  const s = (a ? a[0] : "") + (b ? b[0] : "");
  return (s || (email || "?")[0] || "?").toUpperCase();
}
