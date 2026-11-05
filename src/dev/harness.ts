import '../styles/editor.css';
import { ScriptEditor } from '../editor/engine';
import { loadProject } from '../core/migrate';
import { resolveStyles, localeTokens } from '../core/format';
import { emptyProject, block } from '../core/model';
declare global { interface Window { ed: ScriptEditor; changes: number; loadSample: (json: string) => void; mk: (json?: string) => void } }
window.changes = 0;
window.mk = (json?: string) => {
  const p = json ? loadProject(json) : (() => { const x = emptyProject(); x.blocks = [block('scene', 'INT. CASA - NOCHE'), block('action', 'Llueve.')]; return x; })();
  document.getElementById('host')!.innerHTML = '';
  window.ed?.destroy();
  window.ed = new ScriptEditor(document.getElementById('host')!, p.blocks, {
    styles: resolveStyles(p), template: p.template, locale: p.locale, page: p.page, locks: null, sceneLetters: false, scenesLocked: false,
    lang: localeTokens(p.locale).lang, readOnly: false, zoom: 1, pageView: true, showSceneNumbers: false, focusMode: 'off', typewriter: false,
    elementKeys: { 'Mod+1': 'scene', 'Mod+2': 'action', 'Mod+3': 'character', 'Mod+4': 'dialogue', 'Mod+5': 'parenthetical', 'Mod+6': 'transition' },
    macros: {}, knownCharacters: () => ['MARA', 'TOMÁS'], tagCategory: () => 'props', isRevised: () => false,
    header: (i, l) => ({ left: '', center: '', right: i === 0 ? '' : l + '.' }), footer: () => ({ left: '', center: '', right: '' }),
  }, { onChange: () => { window.changes++; }, onElementMenu: () => {} });
};
window.mk();
