const params=new URLSearchParams(location.search),person=params.get('person')==='2'?'2':'1',world=params.get('server') || 'a';
document.querySelector('#identity').textContent=(person==='1'?'Host':'Participante')+' · servidor '+world;
globalThis.SeeleMods={
  snapshot:async()=>({me:person,server:'Jardim noturno',open_channel:1,channels:[{id:1,name:'geral'}],presentes:[{id:'1',nickname:'Alex'},{id:'2',nickname:'Mika'}]}),
  request:async(id,channel,request)=>{const response=await fetch('/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mod:id.split('/')[1],request,person,server:world})});return response.json();}
};
document.querySelector('#unload').onclick=()=>{for(const id of ['seele/perfis'])dispatchEvent(new CustomEvent('seele-mod-unload',{detail:id}));};
