// Compares the latest commit on GitHub main with the signed Twigpine mirror, for the "in sync" check on /open.
// GitHub is read through git's own smart-HTTP ref list (no API key, no API rate limit).
export const TWIGPINE_DID = "did:key:z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt";
export const TWIGPINE_REPO_URL = "https://explorer.twigpine.com/repos/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa";

export type MirrorSync = { github?: string; twigpine?: string; twigpineAt?: string; inSync: boolean; ok: boolean };

async function githubMain(): Promise<string | undefined> {
  const r = await fetch("https://github.com/StoaDex/Stoa.git/info/refs?service=git-upload-pack", { next: { revalidate: 120 }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return undefined;
  const t = await r.text();
  const m = t.match(/([0-9a-f]{40}) refs\/heads\/main/) ?? t.match(/([0-9a-f]{40}) HEAD/);
  return m?.[1];
}

async function twigpineMain(): Promise<{ sha?: string; at?: string }> {
  const r = await fetch(`https://node.twigpine.com/api/v1/repos/${TWIGPINE_DID}/stoa/refs`, { next: { revalidate: 120 }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return {};
  const j = (await r.json()) as { refs?: { ref_name: string; sha: string; updated_at?: string }[] };
  const ref = j.refs?.find((x) => x.ref_name === "refs/heads/main");
  return { sha: ref?.sha, at: ref?.updated_at };
}

export async function readMirrorSync(): Promise<MirrorSync> {
  const [g, t] = await Promise.all([githubMain().catch(() => undefined), twigpineMain().catch(() => ({}) as { sha?: string; at?: string })]);
  return { github: g, twigpine: t.sha, twigpineAt: t.at, inSync: !!g && g === t.sha, ok: !!g && !!t.sha };
}
