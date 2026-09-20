import axios from "axios";

const ENV_URL = process.env.REACT_APP_BACKEND_URL || "";
// The platform proxy rewrites the Origin header, so cross-origin calls from alias hosts fail CORS.
// When served over https from a different host than ENV_URL, call the API on the same origin.
const PAGE_ORIGIN = typeof window !== "undefined" && window.location.protocol === "https:" ? window.location.origin : "";
export const BACKEND_URL = PAGE_ORIGIN && PAGE_ORIGIN !== ENV_URL ? PAGE_ORIGIN : ENV_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

export function fmtErr(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
      .join(", ");
  }
  if (typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return String(detail);
}

export function brl(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function mediaUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BACKEND_URL}${pathOrUrl}`;
  if (pathOrUrl.startsWith("/")) return `${BACKEND_URL}${pathOrUrl}`;
  return `${BACKEND_URL}/api/files/${pathOrUrl}`;
}

export const DOW = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

export const STATUS_META = {
  waiting: { label: "Aguardando", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  signal_pending: { label: "Sinal pendente", tone: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  signal_paid: { label: "Sinal pago", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  confirmed: { label: "Confirmado", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed: { label: "Concluído", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  refused: { label: "Recusado", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  cancelled: { label: "Cancelado", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};
