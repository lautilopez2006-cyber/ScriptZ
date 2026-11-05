import{c as s}from"./chunk-4WYN24YR.js";var p=o=>!!o.text.trim()&&o.type!=="page"&&!o.sug,c=new Set(["character"]);function f(o){let e=o.translation,r=0,n=0,a=0;for(let t of o.blocks){if(!p(t)||c.has(t.type))continue;r++;let l=e?.blocks[t.id];l?.text.trim()&&(n++,l.src!==t.text&&a++)}return{total:r,done:n,stale:a}}var d={en:"en",es:"es-LA","es-ES":"es-ES",pt:"pt-BR"};function m(o){let e=s(o),r=e.translation;if(!r)return e;let n=e.blocks.map(a=>{let t=r.blocks[a.id];return t&&t.text.trim()?{...a,text:t.text,marks:void 0,alts:void 0}:a});return{...e,blocks:n,locale:d[r.lang]??e.locale,title:e.title?`${e.title} (${r.lang.toUpperCase()})`:e.title}}var i=o=>o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function h(o,e){let r=s(o),n=r.translation,a=r.blocks.filter(t=>t.text.trim()&&t.type!=="page").map(t=>{let l=n?.blocks[t.id]?.text??"";return`<tr class="${"t-"+t.type}"><td>${i(t.text)}</td><td>${i(l||(c.has(t.type)?t.text:""))}</td></tr>`}).join(`
`);return`<!doctype html><html lang="${n?.lang??"en"}"><head><meta charset="utf-8"><title>${i(r.title)}</title><style>
@page { size: ${r.page.paper==="a4"?"A4":"letter"} landscape; margin: 0.7in; }
body { font: 11pt/1.35 'Courier Prime', 'Courier New', monospace; color: #111; margin: 0 auto; max-width: 11in; }
h1 { font-size: 13pt; text-align: center; text-decoration: underline; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { text-align: left; font-size: 9pt; border-bottom: 1px solid #999; padding: 4px 8px; }
td { vertical-align: top; padding: 3px 8px; white-space: pre-wrap; }
td + td { border-left: 1px solid #ddd; }
tr.t-scene td { font-weight: bold; text-transform: uppercase; padding-top: 14px; }
tr.t-character td { padding-left: 30%; text-transform: uppercase; }
tr.t-parenthetical td { padding-left: 22%; }
tr.t-dialogue td { padding-left: 12%; padding-right: 8%; }
tr.t-transition td { text-align: right; text-transform: uppercase; }
tr { break-inside: avoid; }
</style></head><body><h1>${i(r.title)}</h1><table><thead><tr><th>${i(e.original)}</th><th>${i(e.translation)} (${i((n?.lang??"").toUpperCase())})</th></tr></thead><tbody>
${a}
</tbody></table></body></html>`}export{p as a,f as b,m as c,h as d};
