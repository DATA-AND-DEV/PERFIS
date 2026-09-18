(()=>{
  const ctx={person:'1',channel:1,admin:true,write:true};
  const request=r=>JSON.parse(aoPedir(JSON.stringify(ctx),JSON.stringify(r)));
  const check=r=>{if(!r.ok)throw Error(r.error);return r;};
  const initial=check(request({op:'view'}));
  if(kind==='estilo'){
    check(request({op:'save',revision:0,theme:initial.theme}));
    if(request({op:'view'}).revision!==1)throw Error('persistência');
    check(request({op:'reset',revision:1}));
  }else{
    check(request({op:'save',revision:0,profile:{displayName:'Aurora',pronouns:'',bio:'Teste',status:'',accent:'#f2521f',effect:'sparkle'}}));
    const image='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const upload=check(request({op:'upload-start',slot:'banner',length:image.length}));
    check(request({op:'upload-part',token:upload.token,index:0,part:image}));
    if(request({op:'asset',person:'1',slot:'banner'}).image!==image)throw Error('imagem');
    check(request({op:'clear-image',revision:2,slot:'banner'}));
    check(request({op:'view'}));
    // Exercise the largest encoded banner under the real 8 MiB heap limit.
    const prefix='data:image/gif;base64,R0lGOD',total='data:image/gif;base64,'.length+4*Math.ceil(10*1024*1024/3);
    const big=check(request({op:'upload-start',slot:'banner',length:total}));
    for(let n=0,i=0;n<total;n+=6000,i++){
      const length=Math.min(6000,total-n);
      let part=n===0?prefix+'A'.repeat(length-prefix.length):'A'.repeat(length);
      if(n+length===total)part=part.slice(0,-2)+'==';
      check(request({op:'upload-part',token:big.token,index:i,part}));
    }
    const first=check(request({op:'asset',person:'1',slot:'banner'}));
    if(!first.paged||first.image.length>65536)throw Error('paginação');
    for(let offset=first.image.length;offset<total;){
      const part=check(request({op:'asset',person:'1',slot:'banner',path:first.path,offset}));
      if(!part.image||part.image.length>65536)throw Error('fragmento');offset+=part.image.length;
    }
  }
  return 'OK — runtime QuickJS, memória limitada a 8 MiB';
})()
