/* SEELE Perfis 1.1.0 — identidade e permissão vêm exclusivamente do contexto. */
(() => {
  'use strict';
  const LIMITS={avatar:512*1024,banner:1024*1024}, CHUNK=6000, ASSET_PART=65536, MAX_PROFILES=128;
  const encodedLimit=slot=>4*Math.ceil(LIMITS[slot]/3)+32;
  const effects=['none','aurora','sparkle','pulse'];
  function fail(message) { throw new Error(message); }
  function text(value,max) { if (typeof value!=='string' || value.length>max) fail('Texto maior que o permitido.'); return value.trim(); }
  function person(value) { if (typeof value!=='string' || !/^[1-9][0-9]{0,19}$/.test(value)) fail('Pessoa inválida.'); return value; }
  function blank() { return {revision:0,displayName:'',pronouns:'',bio:'',status:'',accent:'#f2521f',effect:'none',avatar:null,banner:null}; }
  function validate(raw,old) {
    if (!raw || typeof raw!=='object') fail('Perfil inválido.');
    if (!/^#[0-9a-f]{6}$/i.test(raw.accent || '') || !effects.includes(raw.effect)) fail('Efeito ou cor inválidos.');
    return {...old,revision:old.revision+1,displayName:text(raw.displayName,40),pronouns:text(raw.pronouns,30),bio:text(raw.bio,280),status:text(raw.status,60),accent:raw.accent.toLowerCase(),effect:raw.effect};
  }
  function validImage(image) {
    const match=/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match || match[2].length%4!==0) return false;
    const starts={png:'iVBORw0KGgo',jpeg:'/9j/',gif:'R0lGOD',webp:'UklGR'};
    return match[2].startsWith(starts[match[1]]);
  }
  globalThis.aoPedir=(contextJSON,requestJSON)=>{
    try {
      const ctx=JSON.parse(contextJSON),r=JSON.parse(requestJSON),me=person(ctx.person);
      const store=dados.profiles ? JSON.parse(dados.profiles) : {};
      // Delete superseded assets only on a later request, after metadata committed.
      // File effects cannot roll back with the database transaction.
      if(dados.garbage){
        const referenced=Object.values(store).flatMap(p=>[p.avatar,p.banner]);
        for(const asset of JSON.parse(dados.garbage))if(!referenced.includes(asset))arquivos.apagar(asset);
        delete dados.garbage;
      }
      const retire=asset=>{if(asset)dados.garbage=JSON.stringify([...(dados.garbage?JSON.parse(dados.garbage):[]),asset]);};
      const own=store[me] || blank();
      if (r.op==='view') {
        const ids=Array.isArray(r.people) ? r.people : [me];
        if (ids.length>32) fail('Consulte até 32 perfis por vez.');
        const profiles={};
        for (const id of ids) { person(id); if (store[id]) profiles[id]=store[id]; }
        profiles[me]=own;
        return JSON.stringify({ok:true,me,profiles});
      }
      if (r.op==='asset') {
        const id=person(r.person),slot=r.slot;
        if (!['avatar','banner'].includes(slot)) fail('Imagem inválida.');
        const path=store[id]?.[slot];
        const image=path ? arquivos.ler(path) : null;
        if(r.offset!==undefined){
          if(!Number.isInteger(r.offset)||r.offset<0||r.offset>(image?.length||0))fail('Posição de imagem inválida.');
          if(r.path!==path)fail('A imagem mudou. Abra o perfil novamente.');
          return JSON.stringify({ok:true,path,total:image?.length||0,image:image?.slice(r.offset,r.offset+ASSET_PART)||null});
        }
        // Small legacy assets retain their response shape; large assets require
        // pagination rather than exceeding SEELE's maximum reply-part count.
        if(image?.length>ASSET_PART)return JSON.stringify({ok:true,path,total:image.length,image:image.slice(0,ASSET_PART),paged:true});
        return JSON.stringify({ok:true,image});
      }
      // A forged owner/admin in r is irrelevant. Only ctx.person can mutate.
      if (r.person!==undefined && r.person!==me) fail('Você só pode editar o próprio perfil.');
      if (ctx.write!==true) fail('Você não tem permissão de escrita neste canal.');
      if (!store[me] && Object.keys(store).length>=MAX_PROFILES) fail('Este servidor atingiu o limite de 128 perfis.');
      if (r.op==='upload-start') {
        if (!['avatar','banner'].includes(r.slot)) fail('Imagem inválida.');
        if (!Number.isInteger(r.length) || r.length<1 || r.length>encodedLimit(r.slot)) fail('Imagem muito grande: avatar até 512 KiB; banner até 1 MiB.');
        const old=dados['upload-'+me] ? JSON.parse(dados['upload-'+me]) : null;
        const token=String(mundo.agora())+'-'+Math.random().toString(36).slice(2,14);
        const upload={token,path:'uploads/'+me+'-'+token+'.txt',slot:r.slot,total:r.length,length:0,next:0,started:mundo.agora()};
        dados['upload-'+me]=JSON.stringify(upload);
        if (old) arquivos.apagar(old.path);
        return JSON.stringify({ok:true,token});
      }
      if (r.op==='upload-part') {
        const up=dados['upload-'+me] ? JSON.parse(dados['upload-'+me]) : null;
        if (!up || up.token!==r.token || up.next!==r.index || mundo.agora()-up.started>600) fail('Upload expirado ou fora de ordem. Escolha a imagem novamente.');
        if (typeof r.part!=='string' || !r.part.length || r.part.length>CHUNK || up.length+r.part.length>up.total) fail('Fragmento inválido.');
        const prefix=up.length ? arquivos.ler(up.path) : '';
        if (prefix===null || prefix.length<up.length) fail('Não foi possível ler o upload.');
        const image=prefix.slice(0,up.length)+r.part;
        const finished=image.length===up.total;
        if (finished) {
          if(!validImage(image))fail('Use PNG, JPEG, WebP ou GIF válido.');
          const base64=image.slice(image.indexOf(',')+1);
          const bytes=base64.length/4*3-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
          if(bytes>LIMITS[up.slot])fail('Imagem maior que o limite deste campo.');
        }
        if (!arquivos.escrever(up.path,image)) fail('Falha ao gravar a imagem.');
        up.length=image.length; up.next++;
        if (finished) {
          const previous=own[up.slot];
          store[me]={...own,[up.slot]:up.path,revision:own.revision+1};
          dados.profiles=JSON.stringify(store); delete dados['upload-'+me];
          retire(previous);
        } else dados['upload-'+me]=JSON.stringify(up);
        return JSON.stringify({ok:true,finished,revision:store[me]?.revision || 0});
      }
      if (r.revision!==own.revision) fail('Seu perfil mudou em outra janela. Recarregue antes de salvar.');
      if (r.op==='save') store[me]=validate(r.profile,own);
      else if (r.op==='clear-image') {
        if (!['avatar','banner'].includes(r.slot)) fail('Imagem inválida.');
        store[me]={...own,[r.slot]:null,revision:own.revision+1};
        retire(own[r.slot]);
      } else if (r.op==='reset') {
        store[me]={...blank(),revision:own.revision+1};
        for (const slot of ['avatar','banner']) retire(own[slot]);
      } else fail('Operação desconhecida.');
      dados.profiles=JSON.stringify(store);
      return JSON.stringify({ok:true,me,profile:store[me]});
    } catch(e) { return JSON.stringify({ok:false,error:e.message}); }
  };
})();
