import{b as s}from"./chunk-II6SWADN.js";import{d as n}from"./chunk-GMZKKH2R.js";import{c as m}from"./chunk-4WYN24YR.js";import{d as u,g as h}from"./chunk-6OTUWNMC.js";import{n as d}from"./chunk-YNW7DNXG.js";var f="https://lautilopez2006-cyber.github.io/ScriptZ/app/",k="#leer=";function x(e){let t="";for(let r=0;r<e.length;r+=32768)t+=String.fromCharCode(...e.subarray(r,r+32768));return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function y(e){let t=atob(e.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((e.length+3)%4)),r=new Uint8Array(t.length);for(let o=0;o<t.length;o++)r[o]=t.charCodeAt(o);return r}async function g(e,t){let r=new Response(new Blob([e]).stream().pipeThrough(t));return new Uint8Array(await r.arrayBuffer())}function v(e,t,r){let o=m(e),c=o.blocks.filter(a=>a.type!=="note"&&!a.sug&&(!r||r.has(a.id))).map(a=>({id:a.id,type:a.type,text:a.text,...a.marks?.length?{marks:a.marks.filter(i=>["b","i","u","x"].includes(i.k))}:{},...a.dual?{dual:a.dual}:{},...a.num?{num:a.num}:{}})),p=Object.fromEntries(Object.entries(o.characters).map(([a,i])=>[a,{...i,actor:"",castNumber:void 0}]));return{...o,blocks:c,comments:{},research:{},suggestions:{},drafts:{},translation:null,characters:p,logline:t.logline,synopsis:t.synopsis,breakdown:{elements:{}},schedule:{order:[],days:{}},callSheets:{}}}async function j(e){let t=new TextEncoder().encode(JSON.stringify(e));return x(await g(t,new CompressionStream("deflate-raw")))}async function C(e){let t=await g(y(e),new DecompressionStream("deflate-raw")),r=JSON.parse(new TextDecoder().decode(t));if(r.v!==1||!r.project?.blocks)throw new Error("bad-share");return r}function A(){return typeof location<"u"&&/^https?:$/.test(location.protocol)&&!/localhost|127\.0\.0\.1/.test(location.host)?location.origin+location.pathname:f}function U(e,t){let r=u(e.blocks).length,o=h(e.blocks);return{pages:t,scenes:r,characters:o.length,words:d(e),cast:o.slice(0,8)}}function B(e,t,r,o){let c=/<body[^>]*>([\s\S]*)<\/body>/i.exec(r)?.[1]??"",p=/<style[^>]*>([\s\S]*?)<\/style>/i.exec(r)?.[1]??"",a=e.titlePage.authors||e.author,i=o.cast.map(l=>`<li><b>${s(l.name)}</b>${e.characters[l.name]?.bio?`<span>${s(e.characters[l.name].bio)}</span>`:""}</li>`).join("");return`<!doctype html><html lang="${e.locale.slice(0,2)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${s(e.title)}</title>
<style>
:root{--ink:#151b2b;--muted:#6a7389;--accent:#3247c9;--bg:#eceef3}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
.pitch{max-width:860px;margin:0 auto;padding:64px 24px 24px}
.k{font:700 12px system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font:700 clamp(36px,7vw,64px)/1.02 'Courier Prime','Courier New',monospace;letter-spacing:-.03em;margin:10px 0 6px;text-transform:uppercase}
.by{color:var(--muted);margin:0 0 26px}
.logline{font:400 clamp(19px,2.6vw,24px)/1.45 'Courier Prime','Courier New',monospace;border-left:4px solid var(--accent);padding:4px 0 4px 18px;margin:0 0 28px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}.stats span{background:#fff;border-radius:12px;padding:10px 14px;font-size:13px;color:var(--muted)}.stats b{display:block;font:700 22px 'Courier Prime',monospace;color:var(--ink)}
h2{font:700 13px system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:30px 0 10px}
.syn{white-space:pre-wrap}.cast{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.cast li{background:#fff;border-radius:12px;padding:12px 14px}.cast b{display:block;font-family:'Courier Prime',monospace}.cast span{font-size:14px;color:var(--muted)}
.contact{white-space:pre-wrap;background:#fff;border-radius:12px;padding:14px 16px}
.script{padding:24px 0 80px}
.made{text-align:center;color:var(--muted);font-size:13px;padding:24px}
${p}
</style></head><body>
<header class="pitch"><span class="k">${s(t.genre||"")}</span><h1>${s(e.title)}</h1>${a?`<p class="by">${s(a)}</p>`:""}
${t.logline?`<p class="logline">${s(t.logline)}</p>`:""}
<div class="stats"><span><b>${o.pages}</b>${s(n("sh.st.pages"))}</span><span><b>${o.scenes}</b>${s(n("sh.st.scenes"))}</span><span><b>${o.characters}</b>${s(n("sh.st.chars"))}</span></div>
${t.synopsis?`<h2>${s(n("sh.synopsis"))}</h2><div class="syn">${s(t.synopsis)}</div>`:""}
${i?`<h2>${s(n("sh.cast"))}</h2><ul class="cast">${i}</ul>`:""}
${t.contact?`<h2>${s(n("sh.contact"))}</h2><div class="contact">${s(t.contact)}</div>`:""}
</header>
<main class="script">${c}</main>
<p class="made">${s(n("sh.madeWith"))}</p>
</body></html>`}export{k as a,v as b,j as c,C as d,A as e,U as f,B as g};
