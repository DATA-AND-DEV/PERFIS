/* Gerado por ferramentas/build.mjs. Sem dependências. */
(()=>{
"use strict";
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

const ui=interfaceMod('seele/perfis','Perfis do servidor','Seu perfil aqui pode ser diferente em cada comunidade.');
let profiles={},me='',editing=false,selected=null,editorRevision=0,draft=null;
const images=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let pauseMotion=false;
const defaults={revision:0,displayName:'',pronouns:'',bio:'',status:'',accent:'#f2521f',effect:'none',avatar:null,banner:null};
ui.css(`.seele-perfis .pf-card{border:1px solid #4e5974;border-radius:18px;overflow:hidden;background:#171d2c;position:relative;min-width:0}.seele-perfis .pf-banner{height:156px;background:linear-gradient(130deg,#624a9b,#17616b);position:relative;overflow:hidden}.seele-perfis .pf-banner img{width:100%;height:100%;object-fit:cover}.seele-perfis .pf-info{padding:0 22px 24px;position:relative;overflow-wrap:anywhere}.seele-perfis .pf-avatar{width:78px;height:78px;border-radius:50%;border:5px solid #171d2c;background:#3f365d;display:grid;place-items:center;font-size:28px;font-weight:700;object-fit:cover;margin-top:-39px;position:relative}.seele-perfis .pf-name{margin:12px 0 0;font-size:24px;color:#f4f2ff}.seele-perfis .pf-bio{white-space:pre-wrap;color:#d0d8ef}.seele-perfis .pf-directory{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:20px 0}.seele-perfis .pf-directory button{text-align:left;overflow-wrap:anywhere}.seele-perfis .pf-tag{font-size:12px;padding:4px 9px;border-radius:99px;background:#313a50;color:#e5eaff;display:inline-block}.seele-perfis .pf-tools{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:20px}`);
ui.css(`@keyframes perfis-aurora{0%,100%{filter:hue-rotate(0deg);transform:scale(1)}50%{filter:hue-rotate(50deg);transform:scale(1.08)}}`);
ui.css(`@keyframes perfis-pulse{0%,100%{opacity:.2}50%{opacity:.8}}`);
ui.css(`@keyframes perfis-sparkle{from{background-position:0 0}to{background-position:30px 60px}}`);
ui.css(`.seele-perfis .pf-card[data-effect=aurora] .pf-banner{animation:perfis-aurora 10s ease-in-out infinite}.seele-perfis .pf-card[data-effect=pulse] .pf-banner::after{content:'';position:absolute;inset:0;background:linear-gradient(30deg,#ffffff66,transparent);animation:perfis-pulse 5s ease-in-out infinite}.seele-perfis .pf-card[data-effect=sparkle] .pf-banner::after{content:'';position:absolute;inset:0;background-image:radial-gradient(#fff9 1px,transparent 2px);background-size:30px 30px;animation:perfis-sparkle 8s linear infinite}`);
ui.css(`.seele-perfis .pf-paused .pf-banner,.seele-perfis .pf-paused .pf-banner::after{animation:none!important}.seele-perfis-roster{font:11px system-ui;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:4px 8px;cursor:pointer;margin:6px 0}`);
ui.css(`@media(prefers-reduced-motion:reduce){.seele-perfis .pf-banner,.seele-perfis .pf-banner::after{animation:none!important}}`);
// The profile artwork may move; its frame and controls retain SEELE's geometry.
ui.css(`.seele-perfis .pf-card{border-color:var(--sm-line);border-radius:0;background:var(--sm-panel)}.seele-perfis .pf-info{padding:0 24px 24px}.seele-perfis .pf-avatar{border-radius:0;border-width:4px;border-color:var(--sm-panel);width:80px;height:80px;margin-top:-40px;font-family:var(--seele-display)}.seele-perfis .pf-name{color:var(--sm-ink);font-size:28px;margin-top:16px}.seele-perfis .pf-bio{color:var(--sm-ink)}.seele-perfis .pf-tag{border-radius:0;background:var(--sm-bg);border:1px solid var(--sm-line);color:var(--sm-muted);padding:4px 8px;font-size:10px}.seele-perfis .pf-directory{gap:8px;margin:24px 0}.seele-perfis .pf-tools{margin-bottom:24px}.seele-perfis-roster{font:var(--seele-t-rotulo,10px) var(--seele-mono);border-radius:0;margin:8px 0;text-transform:uppercase}`);
const people=()=>ui.snapshot?.presentes || [];
const name=id=>{const p=people().find(p=>String(p.id)===id);return p?.nickname || p?.apelido || 'Pessoa '+id;};
const motionOff=()=>reduced.matches || pauseMotion;
async function getImage(id,slot,path){
  if(!path)return null;
  if(images.has(path))return images.get(path);
  const response=await ui.request({op:'asset',person:id,slot});
  if(response.image && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(response.image))throw new Error('Imagem recebida inválida.');
  if(images.size>256)images.clear();images.set(path,response.image);return response.image;
}
function card(profile,id){
  const p={...defaults,...profile},node=ui.el('article',undefined,'pf-card');node.dataset.effect=motionOff()?'none':p.effect;
  if(motionOff())node.classList.add('pf-paused');
  const banner=ui.el('div',undefined,'pf-banner');banner.style.background='linear-gradient(120deg,'+p.accent+',#172c48)';
  const bannerImage=images.get(p.banner);
  if(bannerImage && !motionOff()){const img=ui.el('img');img.src=bannerImage;img.alt='Banner de '+name(id);banner.append(img);}
  const info=ui.el('div',undefined,'pf-info'),avatarImage=images.get(p.avatar);
  const avatar=ui.el(avatarImage&&!motionOff()?'img':'span',undefined,'pf-avatar');
  if(avatar.tagName==='IMG'){avatar.src=avatarImage;avatar.alt='Avatar de '+name(id);}else avatar.textContent=(p.displayName || name(id)).slice(0,2).toUpperCase();
  avatar.style.borderColor=p.accent;
  info.append(avatar,ui.el('h2',p.displayName || name(id),'pf-name'),ui.el('p',name(id)+' · ID '+id,'sm-note'));
  if(p.pronouns)info.append(ui.el('span',p.pronouns,'pf-tag'));
  if(p.status)info.append(ui.el('p',p.status));
  if(p.bio)info.append(ui.el('p',p.bio,'pf-bio'));
  if(motionOff()&&(p.banner||p.avatar))info.append(ui.el('p','Imagens ocultas para reduzir movimento.','sm-note'));
  node.append(banner,info);return node;
}
async function load(id){
  const response=await ui.request({op:'view',people:[id]});me=response.me;Object.assign(profiles,response.profiles);
  const p=profiles[id] || defaults;
  await getImage(id,'avatar',p.avatar);await getImage(id,'banner',p.banner);
}
function tools(){
  const bar=ui.el('div',undefined,'pf-tools');
  bar.append(ui.button('Pessoas do servidor',async()=>{editing=false;await directory();}),ui.button('Editar meu perfil',async()=>{await load(me);editing=true;editor();},true));
  const motion=ui.field('Pausar efeitos e imagens','checkbox',pauseMotion);
  motion.input.onchange=()=>{pauseMotion=motion.input.checked;decorate();if(editing)refreshPreview();else if(selected)show(selected);};bar.append(motion.wrap);return bar;
}
async function directory(){
  selected=null;ui.body.replaceChildren(tools(),ui.el('h2','Pessoas conectadas'));
  const grid=ui.el('div',undefined,'pf-directory');
  for(const p of people()){
    const id=String(p.id);
    grid.append(ui.button(name(id),async()=>{await load(id);selected=id;show(id);}));
  }
  if(!people().length)grid.append(ui.el('p','Nenhuma pessoa disponível.'));
  ui.body.append(grid,ui.el('p','Os perfis e suas imagens ficam neste servidor. Cada pessoa edita apenas o próprio perfil.','sm-note'));
  ui.message('Selecione alguém para ver o perfil completo.');
}
function show(id){editing=false;selected=id;ui.body.replaceChildren(tools(),card(profiles[id],id));ui.message('Perfil neste servidor.');}
let preview;
function refreshPreview(){if(preview)preview.replaceChildren(card(draft,me));}
function editor(){
  draft={...defaults,...profiles[me]};editorRevision=draft.revision;selected=me;
  ui.body.replaceChildren(tools());
  const grid=ui.el('div',undefined,'sm-grid'),form=ui.el('div');preview=ui.el('div');
  for(const [key,label,max,type] of [['displayName','Nome no perfil',40,'text'],['pronouns','Pronomes',30,'text'],['status','Status',60,'text'],['bio','Sobre mim',280,'textarea'],['accent','Cor do perfil',7,'color']]){
    const f=ui.field(label,type,draft[key],{maxlength:max});f.input.oninput=()=>{draft[key]=f.input.value;refreshPreview();};form.append(f.wrap);
  }
  const effect=ui.field('Efeito do banner','select',draft.effect,{values:[['none','Sem efeito'],['aurora','Aurora'],['sparkle','Estrelas'],['pulse','Brilho pulsante']]});
  effect.input.onchange=()=>{draft.effect=effect.input.value;refreshPreview();};form.append(effect.wrap);
  form.append(ui.el('p','PNG, JPEG, WebP ou GIF animado, até 256 KiB. Banner recomendado: 960 × 320. As imagens são publicadas ao terminar o envio.','sm-note'));
  for(const [slot,label] of [['avatar','Avatar'],['banner','Banner animado']]){
    const f=ui.field(label,'file','',{accept:'image/png,image/jpeg,image/webp,image/gif'});
    f.input.onchange=()=>ui.run(async()=>{
      const file=f.input.files?.[0];if(!file)return;
      if(file.size>262144)throw new Error('Use uma imagem de até 256 KiB.');
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Formato de imagem não suportado.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file);});
      await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.width<=4096&&image.height<=4096?resolve():reject(new Error('A imagem deve ter no máximo 4096 px por lado.'));image.onerror=()=>reject(new Error('Imagem inválida.'));image.src=data;});
      const start=await ui.request({op:'upload-start',slot,length:data.length});
      let result;
      for(let offset=0,index=0;offset<data.length;offset+=6000,index++){
        result=await ui.request({op:'upload-part',token:start.token,index,part:data.slice(offset,offset+6000)});
        ui.message('Enviando '+label.toLowerCase()+'… '+Math.min(100,Math.round((offset+6000)/data.length*100))+'%');
      }
      await load(me);draft[slot]=profiles[me][slot];editorRevision=result.revision;refreshPreview();ui.message(label+' publicado. Os textos continuam em edição até salvar.');
    });form.append(f.wrap);
    form.append(ui.button('Remover '+label.toLowerCase(),async()=>{const r=await ui.request({op:'clear-image',slot,revision:editorRevision});profiles[me]=r.profile;draft[slot]=null;editorRevision=r.profile.revision;refreshPreview();ui.message('Imagem removida.');}));
  }
  grid.append(form,preview);ui.body.append(grid);refreshPreview();
  const actions=ui.el('div',undefined,'sm-actions');
  actions.append(ui.button('Salvar perfil',async()=>{const r=await ui.request({op:'save',revision:editorRevision,profile:draft});profiles[me]=r.profile;editorRevision=r.profile.revision;draft={...r.profile};refreshPreview();ui.message('Perfil salvo neste servidor.');},true));
  actions.append(ui.button('Descartar alterações',async()=>{await load(me);editor();ui.message('Perfil recarregado.');}));
  ui.body.append(actions);ui.message('Prévia local. Salve para publicar os textos e o efeito.');
}
ui.css(`.seele-perfis-roster{display:block;width:100%;padding:0!important;text-align:left;overflow:hidden;border:1px solid var(--seele-linha-forte,#3a322a);background:var(--seele-negro-painel,#0a0806);color:var(--seele-osso,#eae3cf)}.seele-perfis-roster .pf-banner{height:56px;position:relative;overflow:hidden}.seele-perfis-roster .pf-banner img{width:100%;height:100%;object-fit:cover}.seele-perfis-roster .pf-mini-info{display:flex;align-items:center;gap:8px;padding:8px;position:relative}.seele-perfis-roster .pf-mini-avatar{width:40px;height:40px;flex:0 0 40px;object-fit:cover;display:grid;place-items:center;border:2px solid var(--seele-laranja-nerv);background:var(--seele-negro-painel);margin-top:-24px;font:700 20px var(--seele-display)}.seele-perfis-roster .pf-mini-copy{min-width:0;display:grid;gap:4px}.seele-perfis-roster .pf-mini-name{font:700 16px var(--seele-display);overflow-wrap:anywhere}.seele-perfis-roster .pf-mini-status{font:10px var(--seele-mono);text-transform:none;overflow-wrap:anywhere;color:var(--seele-rotulo-painel)}.seele-perfis-roster[data-effect=aurora] .pf-banner{animation:perfis-aurora 10s ease-in-out infinite}.seele-perfis-roster[data-effect=pulse] .pf-banner::after{content:'';position:absolute;inset:0;background:linear-gradient(30deg,#ffffff66,transparent);animation:perfis-pulse 5s ease-in-out infinite}.seele-perfis-roster[data-effect=sparkle] .pf-banner::after{content:'';position:absolute;inset:0;background-image:radial-gradient(#fff9 1px,transparent 2px);background-size:30px 30px;animation:perfis-sparkle 8s linear infinite}.seele-perfis-roster:focus-visible{outline:2px solid var(--seele-laranja-nerv);outline-offset:2px}`);
const rosterNodes=new Map();
function decorate(){
  const all=people();
  for(const [id,node] of rosterNodes)if(!all.some(p=>String(p.id)===id)){node.remove();rosterNodes.delete(id);}
  for(const row of document.querySelectorAll('#tela-sessao .painel-pessoas .pessoa')){
    const raw=row.querySelector('.pessoa-nome')?.textContent?.replace(/\s*\(você\)\s*$/,'').trim();
    const matching=all.filter(p=>(p.nickname || p.apelido)===raw);
    const existing=row.querySelector('.seele-perfis-roster');
    if(matching.length!==1){existing?.remove();continue;}
    const id=String(matching[0].id),p={...defaults,...profiles[id]};
    const key=JSON.stringify([id,p.revision,motionOff(),Boolean(images.get(p.avatar)),Boolean(images.get(p.banner))]);
    if(existing?.dataset.key===key)continue;
    const b=existing || rosterNodes.get(id) || ui.el('button',undefined,'seele-perfis-roster');
    if(!existing && b.dataset.key===key){row.prepend(b);continue;}
    rosterNodes.set(id,b);b.type='button';b.dataset.key=key;b.dataset.effect=motionOff()?'none':p.effect;b.setAttribute('aria-label','Ver perfil de '+raw);
    const banner=ui.el('div',undefined,'pf-banner');banner.style.background='linear-gradient(120deg,'+p.accent+',#172c48)';
    if(images.get(p.banner)&&!motionOff()){const img=ui.el('img');img.src=images.get(p.banner);img.alt='';banner.append(img);}
    const info=ui.el('span',undefined,'pf-mini-info'),avatar=ui.el(images.get(p.avatar)&&!motionOff()?'img':'span',undefined,'pf-mini-avatar');
    if(avatar.tagName==='IMG'){avatar.src=images.get(p.avatar);avatar.alt='';}else avatar.textContent=(p.displayName||raw).slice(0,2).toUpperCase();
    avatar.style.borderColor=p.accent;
    const copy=ui.el('span',undefined,'pf-mini-copy');copy.append(ui.el('span',p.displayName||raw,'pf-mini-name'));
    if(p.status)copy.append(ui.el('span',p.status,'pf-mini-status'));
    info.append(avatar,copy);b.replaceChildren(banner,info);
    b.onclick=()=>ui.run(async()=>{await load(id);selected=id;show(id);if(!ui.dialog.open)ui.dialog.showModal();});
    if(!existing)row.prepend(b);
  }
}
async function syncRoster(){
  const ids=people().map(p=>String(p.id));
  for(let i=0;i<ids.length;i+=32){
    const response=await ui.request({op:'view',people:ids.slice(i,i+32)});
    Object.assign(profiles,response.profiles);
  }
  decorate();
  if(!motionOff())for(const id of ids){
    const p=profiles[id];if(!p)continue;
    await getImage(id,'avatar',p.avatar);await getImage(id,'banner',p.banner);
  }
  decorate();
}
// Native rosters are redrawn frequently. Debounce and never replace native controls.
let scheduled=false;
const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!ui.disposed)decorate();});});
observer.observe(document.body,{childList:true,subtree:true});
ui.disposers.push(()=>{observer.disconnect();document.querySelectorAll('.seele-perfis-roster').forEach(e=>e.remove());images.clear();rosterNodes.clear();});
const motionChanged=()=>{decorate();if(ui.dialog.open){if(editing)refreshPreview();else if(selected)show(selected);}};
reduced.addEventListener('change',motionChanged);ui.disposers.push(()=>reduced.removeEventListener('change',motionChanged));
ui.onPoll=async()=>{
  me=String(ui.snapshot.me);
  const previousSelectedRevision=profiles[selected]?.revision;
  await syncRoster();
  if(ui.dialog.open && selected && !editing){const id=selected,before=previousSelectedRevision;await load(id);if(ui.dialog.open && selected===id && !editing && profiles[id]?.revision!==before)show(id);}
};
ui.onOpen=async()=>{me=String(ui.snapshot.me);await load(me);editing=false;await directory();};
ui.onClose=()=>{editing=false;preview=null;};
ui.start();

})();
