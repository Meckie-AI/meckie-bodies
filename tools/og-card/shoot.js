const WebSocket=require('ws'); const fs=require('fs'); const http=require('http');
const get=(p)=>new Promise(r=>http.get('http://localhost:9666'+p,s=>{let b='';s.on('data',d=>b+=d);s.on('end',()=>r(JSON.parse(b)))}));
(async()=>{
  const list=await get('/json/list');
  const t=list.find(x=>x.type==='page')||list[0];
  const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
  await new Promise(r=>ws.on('open',r));
  ws.on('message',m=>{const o=JSON.parse(m);if(o.id&&pend.has(o.id)){pend.get(o.id)(o);pend.delete(o.id)}});
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async(e)=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result.value;

  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:630,deviceScaleFactor:2,mobile:false});
  await send('Page.enable');
  await send('Page.navigate',{url:'http://localhost:4301/?v='+Date.now()});
  // the four viewers each build geometry and load three.js; give them room
  await new Promise(r=>setTimeout(r,14000));
  console.log('  iframes:', await ev(`document.querySelectorAll('iframe').length`));
  console.log('  canvases drawn:', await ev(`[...document.querySelectorAll('iframe')].filter(f=>{try{return f.contentDocument.querySelector('canvas')}catch(e){return false}}).length`));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(process.env.OUT, Buffer.from(shot.result.data,'base64'));
  console.log('  wrote', process.env.OUT, (fs.statSync(process.env.OUT).size/1024).toFixed(0)+'KB');
  process.exit(0);
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1)});
