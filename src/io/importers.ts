// Import any supported file as a new project.
import { adoptProject } from '../app/actions';
import { toast, getState } from '../app/store';
import { pickFile } from '../platform';
import { emptyProject, defaultTitlePage, uid, type Block, type Project, type TitlePage } from '../core/model';
import { loadProject, ProjectFormatError } from '../core/migrate';
import { parseFountain } from './fountain';
import { parseFdx } from './fdx';
import { isZip } from './zip';
import { classifyParagraphs, looksLikeFountain, parasFromText, splitTitlePage } from './detect';
import { t } from '../i18n';

export const IMPORT_EXTENSIONS = ['scriptz', 'json', 'fdx', 'fountain', 'spmd', 'txt', 'md', 'markdown', 'fadein', 'celtx', 'highland', 'wdz', 'pdf', 'docx'];

function guessTemplate(blocks: Block[]): string {
  if (blocks.some((b) => b.type === 'act')) return 'tv';
  return 'feature';
}

export function projectFrom(name: string, blocks: Block[], title: Partial<TitlePage>): Project {
  const p = emptyProject();
  const base = name.replace(/\.[^.]+$/, '');
  p.title = (title.title || base).trim();
  p.author = (title.authors ?? '').split('\n')[0] ?? '';
  p.blocks = blocks;
  p.template = guessTemplate(blocks);
  p.titlePage = { ...defaultTitlePage(p.title, p.author), ...Object.fromEntries(Object.entries(title).filter(([, v]) => typeof v === 'string')) } as TitlePage;
  const text = blocks.slice(0, 200).map((b) => b.text).join(' ');
  if (/\b(INT|EXT)\.\s/.test(text) && /\b(NIGHT|DAY|CUT TO)\b/.test(text)) p.locale = 'en';
  else if (/\b(NOITE|DIA)\b/.test(text) && /ã|õ/.test(text)) p.locale = 'pt-BR';
  return p;
}

export async function parseFile(name: string, bytes: Uint8Array): Promise<Project> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const text = () => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  if (ext === 'scriptz' || ext === 'json') return loadProject(text());
  if (ext === 'fdx' || (/<FinalDraft/i.test(text().slice(0, 400)))) {
    const r = parseFdx(text());
    const p = projectFrom(name, r.blocks, r.title);
    for (const [id, summary] of Object.entries(r.summaries)) p.scenes[id] = { ...(p.scenes[id] ?? {}), summary };
    if (r.revisions.length) p.revisions.sets = r.revisions.map((x) => ({ id: x.id, name: x.name, color: (['blue', 'pink', 'yellow', 'green', 'goldenrod', 'buff', 'salmon', 'cherry'].includes(x.color) ? x.color : 'blue') as Project['revisions']['sets'][0]['color'], date: '', mark: '*' }));
    if (r.blocks.some((b) => b.num)) p.revisions.scenesLocked = true;
    return p;
  }
  if (ext === 'pdf') {
    const { parsePdfScript } = await import('./pdfImport');
    const r = await parsePdfScript(bytes);
    return projectFrom(name, r.blocks, r.title);
  }
  if (isZip(bytes) || ['fadein', 'celtx', 'highland', 'wdz', 'docx'].includes(ext)) {
    const { importZipApp } = await import('./apps');
    const r = await importZipApp(name, bytes);
    return projectFrom(name, r.blocks, r.title);
  }
  if (ext === 'fadein' || /<document[^>]+Open Screenplay Format/i.test(text().slice(0, 500))) {
    const { parseOsf } = await import('./apps');
    const r = parseOsf(text());
    return projectFrom(name, r.blocks, r.title);
  }
  // Fountain / Markdown / plain text
  const src = text();
  if (src.trim().startsWith('{')) { try { return loadProject(src); } catch { /* not JSON */ } }
  if (ext === 'txt' && !looksLikeFountain(src)) {
    const { title, body } = splitTitlePage(parasFromText(src));
    return projectFrom(name, classifyParagraphs(body), title);
  }
  const r = parseFountain(src);
  return projectFrom(name, r.blocks, r.title as Partial<TitlePage>);
}

export async function importBytes(name: string, bytes: Uint8Array): Promise<void> {
  try {
    const p = await parseFile(name, bytes);
    // Imported .scriptz keep their id only if it does not collide with a project already in the library.
    if (getState().library.some((x) => x.id === p.id)) { p.id = uid(); p.revision = 1; }
    await adoptProject(p, { message: t('home.imported', { title: p.title || name }) });
  } catch (e) {
    const msg = e instanceof ProjectFormatError ? (e.message === 'newer-version' ? t('err.newerVersion') : t('err.invalidFile')) : String((e as Error)?.message ?? e);
    toast(msg === 'unsupported-package' ? t('err.unsupported') : t('err.generic', { msg }), 'error', undefined, 7000);
  }
}

export async function importWithPicker(): Promise<void> {
  const f = await pickFile([{ name: 'Guiones', extensions: IMPORT_EXTENSIONS }]);
  if (f) await importBytes(f.name, f.bytes);
}
