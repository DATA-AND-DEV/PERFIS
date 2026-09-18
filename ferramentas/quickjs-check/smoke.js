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
  }
  return 'OK — runtime QuickJS, memória limitada a 8 MiB';
})()
