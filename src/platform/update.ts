// Update check against GitHub Releases (no installer download: opens the release page).
import { APP_VERSION } from '../app/version';

export interface UpdateInfo { available: boolean; version: string; url: string; notes: string }

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export async function checkForUpdate(repo: string): Promise<UpdateInfo> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('repo');
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = (await r.json()) as { tag_name?: string; html_url?: string; body?: string };
  const version = (j.tag_name ?? '').replace(/^v/i, '');
  return { available: !!version && compareVersions(version, APP_VERSION) > 0, version, url: j.html_url ?? `https://github.com/${repo}/releases`, notes: (j.body ?? '').slice(0, 2000) };
}
