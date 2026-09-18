// All requests from this MOD share one budget, including reads and polling.
// SEELE's control bucket allows 20/s; use at most 8/s, leaving headroom for
// chat, telemetry and other MODs. Never retry writes automatically.
function filaDePedidos(send,active,{now=()=>performance.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let tail=Promise.resolve(),next=0;
  return (...args)=>{
    const job=tail.then(async()=>{
      if(!active())throw new Error('O MOD foi descarregado.');
      while(now()<next){await wait(next-now());if(!active())throw new Error('O MOD foi descarregado.');}
      next=now()+125;
      return send(...args);
    });
    tail=job.catch(()=>{});
    return job;
  };
}
