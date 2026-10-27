/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node validation harness. */
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const root=process.cwd(),out=path.join(root,process.env.TEST_OUTPUT||'artifacts/phase3f1-contact');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});const profile=path.join(root,'.tmp/chrome-beacon-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let failureShot; let socket;const results=[],errors=[],samples=[],captures=[];let filmstrip=0;
 try{
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(m.error);else p.resolve(m.result);}}if(m.method==='Page.screencastFrame'){const n=filmstrip++;if(n<60)fs.writeFile(path.join(out,'interaction-frame-'+String(n).padStart(3,'0')+'.jpg'),Buffer.from(m.params.data,'base64'));send('Page.screencastFrameAck',{sessionId:m.params.sessionId});}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});socket.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const assert=(pass,label)=>{if(!pass)throw Error(label);results.push({pass,label});console.log('PASS',label);};
  const wait=async(expression,label)=>{for(let i=0;i<1500;i++){if(await evaluate(expression))return;await sleep(20);}throw Error('Timeout: '+label);};
  const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));captures.push(name);};
  failureShot=shot;
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__draws=new Map();
    for(const kind of ['WebGLRenderingContext','WebGL2RenderingContext']){
      const C=window[kind];if(!C)continue;const names=new WeakMap();
      const get=C.prototype.getUniformLocation;C.prototype.getUniformLocation=function(p,n){const l=get.call(this,p,n);if(l)names.set(l,n);return l};
      const f=C.prototype.uniform1f;C.prototype.uniform1f=function(l,v){return f.call(this,l,names.get(l)==='uTime'?100:v)};
      const a=C.prototype.uniform4fv;C.prototype.uniform4fv=function(l,v,...rest){if(names.get(l)?.startsWith('uRipples')){const fixed=new Float32Array(48);fixed.set([.5,.5,99.4,.7]);return a.call(this,l,fixed)}return a.call(this,l,v,...rest)};
      for(const method of ['drawArrays','drawElements']){const original=C.prototype[method];C.prototype[method]=function(...args){window.__draws.set(this.canvas,(window.__draws.get(this.canvas)||0)+1);return original.apply(this,args)}}
    }
  `});
  for(const [label,base] of [['before','http://127.0.0.1:3030'],['after','http://127.0.0.1:3032']]){
    for(const [width,height] of [[1920,1080],[1366,768],[768,1024],[390,844],[320,740]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/contact'});
      await wait('document.querySelector(".contact-page")?.hasAttribute("data-contact-visible")&&document.activeElement?.tagName==="H1"','contact settled');
      samples.push({label,width,height,metrics:await evaluate(`(()=>{const cards=[...document.querySelectorAll('.contact-card')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}});const button=document.querySelector('.room-return-control button');return {cards,headline:getComputedStyle(document.querySelector('.contact-title')).letterSpacing,returnFont:getComputedStyle(button).fontSize,returnHeight:button.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}})()`)});
      await shot(label+'-contact-'+width);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/work'});await wait('document.querySelector(".gallery")?.hasAttribute("data-gallery-interactive")&&document.querySelector(".gallery")?.hasAttribute("data-liquid-ready")','work ripple');await shot(label+'-work-fixed-ripple');
    const a=await evaluate('__draws.get(document.querySelector(".gallery-liquid canvas"))||0');await sleep(3200);const b=await evaluate('__draws.get(document.querySelector(".gallery-liquid canvas"))||0');samples.push({label,atRestDraws:b-a});assert(b===a,label+' Work has no idle draw loop');
  }
  await fs.writeFile(path.join(out,'comparison-report.json'),JSON.stringify({samples,captures,errors,results},null,2));await send('Browser.close');
 }catch(error){try{await failureShot('comparison-failure')}catch{}await fs.writeFile(path.join(out,'comparison-report.json'),JSON.stringify({samples,captures,errors,results,failure:String(error)},null,2));throw error}
 finally{socket?.close();chrome.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
