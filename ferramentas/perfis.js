const ui=interfaceMod('seele/perfis','Perfis do servidor','Seu perfil aqui pode ser diferente em cada comunidade.');
let profiles={},me='',editing=false,selected=null,editorRevision=0,draft=null;
const images=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const deferredImages=new Set(),CACHE_LIMIT=64*1024*1024;
let cachedChars=0;
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
async function getImage(id,slot,path,background=false){
  if(!path)return null;
  if(images.has(path))return images.get(path);
  if(background&&deferredImages.has(path))return null;
  const response=await ui.request({op:'asset',person:id,slot});
  const expected=response.total||response.image?.length||0;
  if(background&&cachedChars+expected>CACHE_LIMIT){deferredImages.add(path);return null;}
  if(response.paged){
    const limit=4*Math.ceil(10*1024*1024/3)+32;
    if(response.path!==path||!Number.isInteger(response.total)||response.total>limit)throw new Error('Imagem recebida inválida.');
    while(response.image.length<response.total){
      const part=await ui.request({op:'asset',person:id,slot,path,offset:response.image.length});
      if(part.path!==path||part.total!==response.total||!part.image||part.image.length>65536)throw new Error('A imagem mudou. Abra o perfil novamente.');
      response.image+=part.image;
    }
    if(response.image.length!==response.total)throw new Error('Imagem recebida inválida.');
  }
  if(response.image && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(response.image))throw new Error('Imagem recebida inválida.');
  while(images.size&&(cachedChars+(response.image?.length||0)>CACHE_LIMIT||images.size>=256)){
    const first=images.keys().next().value;cachedChars-=images.get(first)?.length||0;images.delete(first);deferredImages.add(first);
  }
  deferredImages.delete(path);cachedChars+=response.image?.length||0;images.set(path,response.image);return response.image;
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
      const limit=10*1024*1024;
      if(file.size>limit)throw new Error('Use uma imagem de até 10 MiB.');
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
    });form.append(f.wrap,ui.el('p','Até 10 MiB e 4096 px por lado. GIF e WebP animados são preservados. O envio respeita o ritmo do SEELE: 10 MiB levam cerca de 5 minutos, ou mais em uma conexão lenta.','sm-note'));
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
// Replace the native visual identity, not its event handlers or live voice
// state. Removing this class on unload immediately restores the original UI.
ui.css(`#tela-sessao .painel-pessoas .pessoa.pf-replaced{display:flex;flex-direction:column;gap:8px;padding:8px;border:0;background:transparent}#tela-sessao .pf-replaced>.pessoa-cabeca .pessoa-identidade,#tela-sessao .pf-replaced>.barra{display:none}#tela-sessao .pf-replaced>.pessoa-cabeca{order:2}#tela-sessao .pf-replaced>.pessoa-rodape{order:3}#tela-sessao .pf-replaced>.volume{order:4}#tela-sessao .pf-replaced>.seele-perfis-roster{margin:0}#tela-sessao .pf-moderate{order:5;align-self:flex-start;border:1px solid var(--seele-linha-forte);background:transparent;color:var(--seele-osso);font:inherit;padding:4px 8px;cursor:pointer}`);
function decorate(){
  const all=people();
  for(const [id,node] of rosterNodes)if(!all.some(p=>String(p.id)===id)){node.remove();rosterNodes.delete(id);}
  for(const row of document.querySelectorAll('#tela-sessao .painel-pessoas .pessoa')){
    const raw=row.querySelector('.pessoa-nome')?.textContent?.replace(/\s*\(você\)\s*$/,'').trim();
    const matching=all.filter(p=>(p.nickname || p.apelido)===raw);
    const existing=row.querySelector('.seele-perfis-roster');
    if(matching.length!==1){existing?.remove();row.classList.remove('pf-replaced');row.querySelector('.pf-moderate')?.remove();continue;}
    row.classList.add('pf-replaced');
    const nativeModeration=row.querySelector('[data-moderar-pessoa]');
    if(nativeModeration&&!row.querySelector('.pf-moderate')){
      const moderate=ui.el('button','Moderar','pf-moderate');moderate.type='button';moderate.setAttribute('aria-label','Moderar '+raw);
      moderate.onclick=()=>nativeModeration.click();row.append(moderate);
    }
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
    await getImage(id,'avatar',p.avatar,true);await getImage(id,'banner',p.banner,true);
  }
  decorate();
}
// Native rosters are redrawn frequently. Reapply the replacement presentation.
let scheduled=false;
const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!ui.disposed)decorate();});});
observer.observe(document.body,{childList:true,subtree:true});
ui.disposers.push(()=>{observer.disconnect();document.querySelectorAll('.seele-perfis-roster,.pf-moderate').forEach(e=>e.remove());document.querySelectorAll('.pf-replaced').forEach(e=>e.classList.remove('pf-replaced'));images.clear();deferredImages.clear();cachedChars=0;rosterNodes.clear();});
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
