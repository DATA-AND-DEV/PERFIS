const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const factory=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ferramentas/fila.js'),'utf8')+';filaDePedidos');
test('fila: upload de 10 MiB mais tráfego concorrente respeita o balde do SEELE',async()=>{
  let time=0,last=0,tokens=60,other=0;const starts=[];
  function frame(t){tokens=Math.min(60,tokens+(t-last)*.02);last=t;assert.ok(tokens>=1,'quadro descartado pelo limite do SEELE');tokens--;}
  const send=factory(async n=>{
    // 10 other control frames/s, beyond the MOD's own eight requests/s.
    while(other<=time){frame(other);other+=100;}
    frame(time);starts.push(time);return n;
  },()=>true,{now:()=>time,wait:async ms=>{time+=ms;}});
  const count=Math.ceil((4*Math.ceil(10*1024*1024/3)+22)/6000)+1;
  const replies=await Promise.all(Array.from({length:count},(_,i)=>send(i)));
  assert.equal(replies.length,count);
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=125);
  assert.ok(time>=290000,'envio grande não pode virar rajada instantânea');
});
test('controle: o envio sem fila esgota as 60 fichas da rajada',()=>{
  let tokens=60,dropped=0;for(let i=0;i<2331;i++){if(tokens>=1)tokens--;else dropped++;}
  assert.equal(dropped,2271);
});
test('fila: erro não repete escrita e não bloqueia o próximo pedido',async()=>{
  let time=0,calls=0;
  const send=factory(async()=>{if(++calls===1)throw Error('timeout');return 'ok';},()=>true,{now:()=>time,wait:async ms=>{time+=ms;}});
  await assert.rejects(send(),/timeout/);assert.equal(await send(),'ok');assert.equal(calls,2);
});
test('fila: descarregar cancela pedidos que ainda não chegaram à ponte',async()=>{
  let active=true,time=0,calls=0;
  const send=factory(async()=>{calls++;},()=>active,{now:()=>time,wait:async ms=>{time+=ms;active=false;}});
  await send();await assert.rejects(send(),/descarregado/);assert.equal(calls,1);
});
