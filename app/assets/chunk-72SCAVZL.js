import{b as g}from"./chunk-EPMLWRJW.js";import{f as l}from"./chunk-4LYSBKMS.js";async function u(e){let t=l().settings.ai;if(!t.enabled)throw new Error("AI disabled");if(t.provider==="anthropic"){if(!t.apiKey)throw new Error("API key missing");let a=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":t.apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:t.model||"claude-haiku-5-5",max_tokens:e.maxTokens??1500,system:e.system,messages:[{role:"user",content:e.user}]})}),p=await a.json().catch(()=>({}));if(!a.ok)throw new Error(p.error?.message??"HTTP "+a.status);return(p.content??[]).filter(c=>c.type==="text").map(c=>c.text??"").join(`
`).trim()}let n=t.baseUrl.replace(/\/+$/,""),s=await fetch(n+"/chat/completions",{method:"POST",headers:{"content-type":"application/json",...t.apiKey?{authorization:"Bearer "+t.apiKey}:{}},body:JSON.stringify({model:t.model,max_tokens:e.maxTokens??1500,messages:[{role:"system",content:e.system},{role:"user",content:e.user}]})}),i=await s.json().catch(()=>({}));if(!s.ok)throw new Error(typeof i.error=="string"?i.error:i.error?.message??"HTTP "+s.status);return(i.choices?.[0]?.message?.content??"").trim()}async function w(){if(!await u({system:"Reply with the single word OK.",user:"ping",maxTokens:10}))throw new Error("empty response")}var h=12e4;function m(e){let t=g(e.blocks.filter(n=>n.type!=="note"));return t.length>h?{text:t.slice(0,h),truncated:!0}:{text:t,truncated:!1}}function r(e){return e.startsWith("en")?"English":e.startsWith("pt")?"Portuguese":"Spanish"}var o="You are a seasoned script editor helping a screenwriter. Be concrete, concise and respectful of the writer's voice. Never invent facts that contradict the script.",x={logline:e=>({system:o,user:`Write 3 alternative loglines (one sentence each, max 35 words) and then a one-paragraph synopsis for this script. Answer in ${r(e.locale)}. Format exactly:
LOGLINES:
1. \u2026
2. \u2026
3. \u2026
SYNOPSIS:
\u2026

SCRIPT:
${m(e).text}`}),summaries:(e,t)=>({system:o,user:`For each scene below write a one-line summary (max 20 words) in ${r(e.locale)}. Reply ONLY with lines in the form "<scene number>: <summary>".

${t.map(n=>`### ${n.label}. ${n.heading}
${n.text}`).join(`

`)}`,maxTokens:3e3}),continuity:e=>({system:o,user:`Review this script for continuity problems: character names spelled differently, timeline contradictions (day/night, ages, dates), objects or wounds that appear/disappear, characters in two places at once, and unanswered setups. List each issue with its scene heading and a short suggestion. Answer in ${r(e.locale)}. If there are none, say so.

SCRIPT:
${m(e).text}`,maxTokens:2500}),rewrite:(e,t,n,s)=>({system:o+" Return only the rewritten text, with no preamble, quotes or explanations, keeping the same screenplay element structure.",user:`Context (surrounding scene):
${s}

Rewrite this passage \u2014 ${n||"tighten it and make the dialogue sharper"} \u2014 in ${r(e.locale)}:
${t}`,maxTokens:1200}),ask:(e,t)=>({system:o,user:`${t}

Answer in ${r(e.locale)}.

SCRIPT:
${m(e).text}`,maxTokens:2e3})};export{u as a,w as b,m as c,r as d,x as e};
