import { CALENDARS, ics } from "@/lib/ics";

export const dynamic = "force-static";
export function generateStaticParams() { return Object.keys(CALENDARS).map((k) => ({ id: `${k}.ics` })); }

/** /cal/points.ics and /cal/spotlight.ics: reminders to add to any calendar app */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = ics(id.replace(/\.ics$/, ""));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="stoa-${id.replace(/\.ics$/, "")}.ics"`, "cache-control": "public, max-age=3600" } });
}
