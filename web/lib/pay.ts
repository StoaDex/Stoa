import { getAddress, isAddress, type Address } from "viem";

/** Stoa Pay: a payment request is just a link. Nothing is stored; the link carries who gets paid, how much and a note. */
export const PAY_MAX_USDG = 10_000;
export const NOTE_MAX = 80;

export type PayRequest = { to: Address; amount: string; note: string };

/** Reads and checks a request from the link's query. Returns null when the link is not a valid request. */
export function readRequest(q: { to?: string | null; amount?: string | null; note?: string | null }): PayRequest | null {
  const to = q.to ?? "", amount = (q.amount ?? "").trim();
  if (!isAddress(to, { strict: false })) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > PAY_MAX_USDG) return null;
  // the note is plain text, shown as text; links and markup are stripped so a request cannot pose as a Stoa message
  const note = (q.note ?? "").replace(/https?:\/\/\S+/gi, "").replace(/[<>]/g, "").trim().slice(0, NOTE_MAX);
  return { to: getAddress(to), amount, note };
}

export function requestUrl(origin: string, r: PayRequest): string {
  const u = new URL("/pay", origin);
  u.searchParams.set("to", r.to);
  u.searchParams.set("amount", r.amount);
  if (r.note) u.searchParams.set("note", r.note);
  return u.toString();
}
