(()=>{
  const ctx={person:'1',channel:null,admin:true,write:true};
  const request=r=>JSON.parse(aoPedir(JSON.stringify(ctx),JSON.stringify(r)));
  const check=r=>{if(!r.ok)throw Error(r.error);return r;};
  const initial=check(request({op:'view'}));
  if(kind==='estilo'){
    check(request({op:'save',revision:0,theme:initial.theme}));
    if(request({op:'view'}).revision!==1)throw Error('persistência');
    check(request({op:'reset',revision:1}));
  }else{
    // A recusa de um campo diz qual campo, e o caminho dela também roda aqui.
    const recusa=request({op:'save',revision:0,profile:{displayName:'x'.repeat(41),pronouns:'',bio:'Teste',status:'',accent:'#f2521f',effect:'sparkle'}});
    if(recusa.ok||Object.keys(recusa.erros||{}).join()!=='displayName')throw Error('recusa sem erros por campo: '+JSON.stringify(recusa));
    check(request({op:'save',revision:0,profile:{displayName:'Aurora',pronouns:'',bio:'Teste',status:'',accent:'#f2521f',effect:'sparkle'}}));
    // O envio em fragmentos saiu: só pelo volume.
    if(request({op:'upload-start',slot:'banner',length:100}).ok)throw Error('o envio em fragmentos ainda é aceito');
    // Pelo volume: o MOD autoriza, o produto transmite (aqui, o tamanho que
    // chegou), e só então a referência nova é publicada — e avisada.
    const inicio=check(request({op:'upload-start',slot:'banner',transporte:'volume',bytes:43}));
    __volume.set(__esperas.get(inicio.token),43);
    const fim=check(request({op:'upload-finish',token:inicio.token}));
    if(!fim.profile.banner||!fim.profile.banner.startsWith('volume:'))throw Error('a capa não foi publicada pelo volume');
    if(check(request({op:'asset',person:'1',slot:'banner'})).volume!==fim.profile.banner.slice(7))throw Error('a capa não é servida pelo volume');
    const aviso=JSON.parse(__avisos[__avisos.length-1]||'null');
    if(!aviso||aviso.carga.pessoa!=='1'||aviso.carga.revisao!==fim.profile.revision)throw Error('o envio não foi avisado: '+JSON.stringify(aviso));
    check(request({op:'clear-image',revision:fim.profile.revision,slot:'banner'}));
    check(request({op:'view'}));
    // **A maior imagem antiga, em fragmentos, sob o teto real de 8 MiB.** A
    // 3.x gravava assim, e a 4.0.0 continua lendo: semeada direto no disco,
    // fora do motor, e lida em páginas de até 64 KiB.
    const prefix='data:image/gif;base64,R0lGOD',total='data:image/gif;base64,'.length+4*Math.ceil(10*1024*1024/3);
    const caminho='uploads/1-antigo.parts';
    let partes=0;
    for(let n=0;n<total;n+=6000,partes++){
      const length=Math.min(6000,total-n);
      let part=n===0?prefix+'A'.repeat(length-prefix.length):'A'.repeat(length);
      if(n+length===total)part=part.slice(0,-2)+'==';
      if(!arquivos.escrever(caminho+'.'+partes,part))throw Error('disco');
    }
    arquivos.escrever(caminho,JSON.stringify({format:1,parts:partes,length:total}));
    const store=JSON.parse(dados.profiles);
    store['1'].banner=caminho;
    dados.profiles=JSON.stringify(store);
    const first=check(request({op:'asset',person:'1',slot:'banner'}));
    if(!first.paged||first.image.length>65536)throw Error('paginação');
    let offset=first.image.length;
    while(offset<total){
      const part=check(request({op:'asset',person:'1',slot:'banner',path:first.path,offset}));
      if(!part.image||part.image.length>65536)throw Error('fragmento');offset+=part.image.length;
    }
    if(offset!==total)throw Error('a imagem antiga não foi lida inteira');
  }
  return 'OK — runtime QuickJS, memória limitada a 8 MiB';
})()
