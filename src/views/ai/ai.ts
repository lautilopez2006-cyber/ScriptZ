// Optional AI client. Off by default; uses the user's own key (Anthropic) or any OpenAI-compatible endpoint (Ollama, LM Studio…).
import { getState } from '../../app/store';
import { toFountain } from '../../io/fountain';
import type { Project } from '../../core/model';

export interface AiMessage { system: string; user: string; maxTokens?: number }

export async function askAi(m: AiMessage): Promise<string> {
  const cfg = getState().settings.ai;
  if (!cfg.enabled) throw new Error('AI disabled');
  if (cfg.provider === 'anthropic') {
    if (!cfg.apiKey) throw new Error('API key missing');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.model || 'claude-haiku-5-5', max_tokens: m.maxTokens ?? 1500, system: m.system, messages: [{ role: 'user', content: m.user }] }),
    });
    const j = (await r.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!r.ok) throw new Error(j.error?.message ?? 'HTTP ' + r.status);
    return (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
  }
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {}) },
    body: JSON.stringify({ model: cfg.model, max_tokens: m.maxTokens ?? 1500, messages: [{ role: 'system', content: m.system }, { role: 'user', content: m.user }] }),
  });
  const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string };
  if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : j.error?.message ?? 'HTTP ' + r.status);
  return (j.choices?.[0]?.message?.content ?? '').trim();
}

export async function testAi(): Promise<void> {
  const out = await askAi({ system: 'Reply with the single word OK.', user: 'ping', maxTokens: 10 });
  if (!out) throw new Error('empty response');
}

const MAX_CHARS = 120_000;

export function scriptForAi(p: Project): { text: string; truncated: boolean } {
  const text = toFountain(p.blocks.filter((b) => b.type !== 'note'));
  return text.length > MAX_CHARS ? { text: text.slice(0, MAX_CHARS), truncated: true } : { text, truncated: false };
}

export function langName(locale: string): string {
  return locale.startsWith('en') ? 'English' : locale.startsWith('pt') ? 'Portuguese' : 'Spanish';
}

const BASE = 'You are a seasoned script editor helping a screenwriter. Be concrete, concise and respectful of the writer\'s voice. Never invent facts that contradict the script.';

export const PROMPTS = {
  logline: (p: Project) => ({ system: BASE, user: `Write 3 alternative loglines (one sentence each, max 35 words) and then a one-paragraph synopsis for this script. Answer in ${langName(p.locale)}. Format exactly:\nLOGLINES:\n1. …\n2. …\n3. …\nSYNOPSIS:\n…\n\nSCRIPT:\n${scriptForAi(p).text}` }),
  summaries: (p: Project, scenes: { label: string; heading: string; text: string }[]) => ({
    system: BASE,
    user: `For each scene below write a one-line summary (max 20 words) in ${langName(p.locale)}. Reply ONLY with lines in the form "<scene number>: <summary>".\n\n${scenes.map((s) => `### ${s.label}. ${s.heading}\n${s.text}`).join('\n\n')}`,
    maxTokens: 3000,
  }),
  continuity: (p: Project) => ({ system: BASE, user: `Review this script for continuity problems: character names spelled differently, timeline contradictions (day/night, ages, dates), objects or wounds that appear/disappear, characters in two places at once, and unanswered setups. List each issue with its scene heading and a short suggestion. Answer in ${langName(p.locale)}. If there are none, say so.\n\nSCRIPT:\n${scriptForAi(p).text}`, maxTokens: 2500 }),
  rewrite: (p: Project, selection: string, instruction: string, context: string) => ({ system: BASE + ' Return only the rewritten text, with no preamble, quotes or explanations, keeping the same screenplay element structure.', user: `Context (surrounding scene):\n${context}\n\nRewrite this passage — ${instruction || 'tighten it and make the dialogue sharper'} — in ${langName(p.locale)}:\n${selection}`, maxTokens: 1200 }),
  ask: (p: Project, q: string) => ({ system: BASE, user: `${q}\n\nAnswer in ${langName(p.locale)}.\n\nSCRIPT:\n${scriptForAi(p).text}`, maxTokens: 2000 }),
};
