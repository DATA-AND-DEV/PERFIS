/* Shared at build time only. Each distributed MOD contains its own copy. */
function interfaceMod(id,title,subtitle) {
  const api=globalThis.SeeleMods;
  if (!api) throw new Error('Este MOD exige a API 2 do SEELE.');
  const prefix=id.replace('/','-');
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  let sheet,releaseStyles;const inserted=[];
  try{sheet=new CSSStyleSheet();document.adoptedStyleSheets=[...document.adoptedStyleSheets,sheet];releaseStyles=()=>{document.adoptedStyleSheets=document.adoptedStyleSheets.filter(s=>s!==sheet);};}
  catch{sheet=[...document.styleSheets].find(s=>{try{return Boolean(s.cssRules);}catch{return false;}});if(!sheet)throw new Error('Nenhuma folha CSS disponível.');releaseStyles=()=>{for(const rule of inserted){const i=[...sheet.cssRules].indexOf(rule);if(i>=0)sheet.deleteRule(i);}};}
  const css=rules=>{let depth=0,start=0;for(let i=0;i<rules.length;i++){if(rules[i]==='{')depth++;if(rules[i]==='}'&&--depth===0){const n=sheet.insertRule(rules.slice(start,i+1),sheet.cssRules.length);inserted.push(sheet.cssRules[n]);start=i+1;}}};
  css(`.${prefix}{--sm-bg:var(--seele-negro-absoluto,#050403);--sm-panel:var(--seele-negro-painel,#0a0806);--sm-ink:var(--seele-osso,#eae3cf);--sm-muted:var(--seele-rotulo-painel,#908574);--sm-accent:var(--seele-laranja-nerv,#f2521f);--sm-line:var(--seele-linha-forte,#3a322a);color:var(--sm-ink);font:var(--seele-t-dado,13px)/1.5 var(--seele-mono,"IBM Plex Mono",monospace)}`);
  css(`dialog.${prefix}{background:var(--sm-bg);width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 64px);padding:0;border:1px solid var(--sm-accent);border-radius:0;overflow:auto;box-shadow:none;color-scheme:dark;scrollbar-color:var(--sm-line) var(--sm-bg);scrollbar-width:thin}`);
  css(`dialog.${prefix}::-webkit-scrollbar{width:8px}dialog.${prefix}::-webkit-scrollbar-thumb{background:var(--sm-line)}dialog.${prefix}::-webkit-scrollbar-track{background:var(--sm-bg)}`);
  css(`dialog.${prefix}::backdrop{background:rgba(5,4,3,.82)}`);
  css(`.${prefix} header{display:flex;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid var(--sm-line);position:sticky;top:0;background:var(--sm-panel);z-index:3}`);
  css(`.${prefix} h1,.${prefix} h2{font-family:var(--seele-display,"Saira Condensed",sans-serif);font-weight:900;text-transform:uppercase;letter-spacing:.06em}.${prefix} h1{font-size:28px;line-height:1.2;margin:0;color:var(--sm-accent)}.${prefix} h2{font-size:18px;margin:0 0 16px}`);
  css(`.${prefix} p{margin:8px 0;color:var(--sm-muted)}.${prefix} .sm-body{padding:24px}.${prefix} .sm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}`);
  css(`.${prefix} button,.${prefix} input,.${prefix} select,.${prefix} textarea{font:inherit;color:var(--sm-ink);background:var(--sm-panel);border:1px solid var(--sm-line);border-radius:0;padding:8px 16px;max-width:100%;box-sizing:border-box}`);
  css(`.${prefix} button{cursor:pointer}.${prefix} button:disabled{opacity:.5;cursor:wait}.${prefix} button:hover:not(:disabled){border-color:var(--sm-accent)}.${prefix} button:focus-visible,.${prefix} input:focus-visible,.${prefix} select:focus-visible,.${prefix} textarea:focus-visible{outline:3px solid var(--sm-accent);outline-offset:3px}`);
  css(`.${prefix} button{text-transform:uppercase;letter-spacing:.04em}.${prefix} .sm-primary{background:var(--sm-accent);color:var(--sm-bg);font-weight:700}.${prefix} label{display:grid;gap:8px;margin-bottom:16px;color:var(--sm-muted)}.${prefix} input:not([type=checkbox]),.${prefix} select,.${prefix} textarea{width:100%}.${prefix} input[type=color]{height:40px;padding:4px}.${prefix} textarea{min-height:96px;resize:vertical}.${prefix} .sm-check{display:flex;align-items:center;gap:8px}`);
  css(`.${prefix} .sm-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.${prefix} .sm-colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.${prefix} .sm-note{font-size:var(--seele-t-rotulo,10px)}.${prefix} .sm-status{padding:16px 24px;border-top:1px solid var(--sm-line);min-height:24px;white-space:pre-wrap}.${prefix} .sm-error{color:var(--seele-vermelho-alerta,#ff1a1a)}`);
  css(`.${prefix}-launcher{padding:8px 16px;display:block}.${prefix}-launcher button{width:100%;padding:8px 16px;text-align:left;background:transparent;color:var(--seele-osso,#eae3cf);border:0;border-left:2px solid var(--seele-laranja-nerv,#f2521f);border-radius:0;cursor:pointer;font:700 var(--seele-t-dado,13px) var(--seele-mono,"IBM Plex Mono",monospace);text-transform:uppercase;letter-spacing:.06em}`);
  css(`@media(max-width:650px){.${prefix} .sm-grid{grid-template-columns:1fr}.${prefix} .sm-body,.${prefix} header{padding:16px}}`);
  const launcher=el('section',undefined,prefix+'-launcher');
  const launch=el('button',title);launch.type='button';launch.setAttribute('aria-haspopup','dialog');launcher.append(launch);
  const dialog=el('dialog',undefined,prefix);dialog.setAttribute('aria-label',title);
  const header=el('header'),heading=el('div');heading.style.flex='1';heading.append(el('h1',title),el('p',subtitle));
  const close=el('button','Fechar');close.type='button';header.append(heading,close);
  const body=el('div',undefined,'sm-body'),status=el('div','Conectando…','sm-status');status.setAttribute('role','status');
  dialog.append(header,body,status);document.body.append(dialog);
  let disposed=false,busy=false,snapshot=null,channel=null,timer,opening=false,polling=false;
  const disposers=[];
  const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('sm-error',error);};
  const field=(label,type,value,options={})=>{
    const wrap=el('label',label),input=el(type==='textarea'?'textarea':type==='select'?'select':'input');
    if (input.tagName==='INPUT') input.type=type;
    if(type==='checkbox')wrap.className='sm-check';
    if (options.values) for (const [value,title] of options.values) {const opt=el('option',title);opt.value=value;input.append(opt);}
    if (type==='checkbox') input.checked=Boolean(value);else input.value=String(value??'');
    for(const [key,val] of Object.entries(options)) if(key!=='values') input.setAttribute(key,String(val));
    wrap.append(input);return {wrap,input};
  };
  const button=(label,action,primary=false)=>{const b=el('button',label,primary?'sm-primary':'');b.type='button';b.onclick=()=>run(action);return b;};
  async function request(payload) {
    if(disposed || channel===null) throw new Error('Entre em um servidor com um canal de texto.');
    const response=await api.request(id,channel,payload);
    if(disposed) throw new Error('O MOD foi descarregado.');
    if(!response.ok) throw new Error(response.error || 'O servidor recusou a operação.');
    return response;
  }
  async function run(action) {
    if(busy || disposed)return;busy=true;
    const buttons=[...dialog.querySelectorAll('button')];const previous=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
    try{await action();}catch(e){message(e.message || String(e),true);}finally{busy=false;buttons.forEach((b,i)=>b.disabled=previous[i]);}
  }
  function hide(){dialog.close();launch.focus();ui.onClose?.();}
  close.onclick=hide;dialog.addEventListener('cancel',()=>ui.onClose?.());
  const ui={id,prefix,el,css,field,button,body,dialog,message,request,run,disposers,get snapshot(){return snapshot;},get disposed(){return disposed;},get busy(){return busy;},get channel(){return channel;},onPoll:null,onOpen:null,onClose:null};
  async function poll(){
    if(disposed || busy || polling)return;polling=true;
    try{
      snapshot=await api.snapshot();if(disposed)return;
      channel=Number(snapshot.open_channel || snapshot.channels?.[0]?.id) || null;
      const host=document.querySelector('#tela-sessao .painel-canais .canais-rolagem');
      if(host && launcher.parentNode!==host)host.append(launcher);
      launcher.hidden=!channel;
      if(channel)await ui.onPoll?.();
    }catch(e){if(dialog.open)message(e.message || 'Sem conexão.',true);}finally{polling=false;}
  }
  launch.onclick=async()=>{
    if(opening)return;opening=true;
    try{await poll();if(disposed)return;dialog.showModal();await run(()=>ui.onOpen?.());}finally{opening=false;}
  };
  function dispose(event){
    if(event.detail!==id)return;disposed=true;clearInterval(timer);dialog.close();dialog.remove();launcher.remove();
    for(const fn of disposers)fn();releaseStyles();
    globalThis.removeEventListener('seele-mod-unload',dispose);
  }
  globalThis.addEventListener('seele-mod-unload',dispose);
  ui.start=()=>{poll();timer=setInterval(poll,4000);};
  return ui;
}
