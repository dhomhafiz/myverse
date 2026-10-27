/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node validation harness. */
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const root=process.cwd(),out=path.join(root,process.env.TEST_OUTPUT||'artifacts/phase3f1-contact');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});const profile=path.join(root,'.tmp/chrome-beacon-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let inspectFailure,failureShot; let socket;const results=[],errors=[],samples=[],captures=[];let filmstrip=0;
 try{
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(m.error);else p.resolve(m.result);}}if(m.method==='Page.screencastFrame'){const n=filmstrip++;if(n<60)fs.writeFile(path.join(out,'interaction-frame-'+String(n).padStart(3,'0')+'.jpg'),Buffer.from(m.params.data,'base64'));send('Page.screencastFrameAck',{sessionId:m.params.sessionId});}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});socket.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const assert=(pass,label)=>{if(!pass)throw Error(label);results.push({pass,label});console.log('PASS',label);};
  const wait=async(expression,label)=>{for(let i=0;i<1500;i++){if(await evaluate(expression))return;await sleep(20);}throw Error('Timeout: '+label);};
  const key=async(key)=>{const keyCode={Enter:13,Escape:27,Home:36,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[key];await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,text:key==='Enter'?'\r':undefined});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});};
  const mouse=(type,x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type,x,y,buttons,button:type==='mouseMoved'?'none':'left',clickCount:type==='mouseMoved'?0:1});
  const click=async selector=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse('mouseMoved',p.x,p.y);await mouse('mousePressed',p.x,p.y,1);await mouse('mouseReleased',p.x,p.y);};
  const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));captures.push(name);};
  inspectFailure=evaluate;failureShot=shot;
  const scene=()=>evaluate(`(()=>{const canvas=document.querySelector('.room-surface canvas');let fiber=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))];while(fiber){let hook=fiber.memoizedState;for(let i=0;hook&&i<100;i++,hook=hook.next){const value=hook.memoizedState?.current;if(value?.camera?.isCamera&&value.scene?.isScene){window.__scene=value;return true;}}fiber=fiber.return;}return false;})()`);
  const pose=()=>evaluate('({position:__scene.camera.position.toArray(),rotation:[__scene.camera.rotation.x,__scene.camera.rotation.y,__scene.camera.rotation.z],fov:__scene.camera.fov})');
  const base=process.env.TEST_URL||'http://127.0.0.1:3031';
  const ready='location.pathname==="/"&&document.querySelector(".room-experience")?.dataset.navigationMode==="explore"&&!document.querySelector(".room-return-loader")';
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__pointerListeners=new Map();window.__contexts=new Map();window.__actions=[];
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,...args){if(type==='pointermove'){if(!__pointerListeners.has(this))__pointerListeners.set(this,new Set());__pointerListeners.get(this).add(fn)}return add.call(this,type,fn,...args)};
    EventTarget.prototype.removeEventListener=function(type,fn,...args){if(type==='pointermove')__pointerListeners.get(this)?.delete(fn);return remove.call(this,type,fn,...args)};
    const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const c=context.call(this,type,...args);if(c)__contexts.set(this,type);return c};
    document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a&&(a.protocol==='mailto:'||a.href.startsWith('https://wa.me/'))){e.preventDefault();__actions.push({href:a.href,target:a.target})}},true);
  `});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/contact'});
  await wait('document.querySelector(".contact-page")?.hasAttribute("data-contact-visible")&&document.activeElement?.tagName==="H1"','contact reveal');
  assert(await evaluate('document.querySelectorAll("a.contact-card").length===2&&document.querySelectorAll(".contact-card a,.contact-card button").length===0'),'two entire-card native links with no nested controls');
  assert(await evaluate('document.querySelectorAll(".contact-icon").length===2&&document.querySelector(".contact-icon").getBoundingClientRect().width===64'),'large email and WhatsApp icons');
  assert(await evaluate('document.querySelector("a.contact-card").href==="mailto:dhomhafiz@gmail.com"&&document.querySelectorAll("a.contact-card")[1].href==="https://wa.me/60197860823"'),'verified email and normalized Malaysian WhatsApp destinations');
  assert(await evaluate('[...__contexts.values()].filter(v=>v.includes("webgl")).length===0&&document.querySelectorAll("canvas").length===0'),'direct Contact adds no WebGL renderer or visible Canvas');
  assert(await evaluate('__pointerListeners.get(document.querySelector(".contact-page"))?.size===1'),'one shared ripple pointer listener');
  const resting=await evaluate('document.querySelector("a.contact-card").getBoundingClientRect().top');
  await send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:1000,maxHeight:700,everyNthFrame:2});
  let rect=await evaluate('(()=>{const r=document.querySelector("a.contact-card").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await mouse('mouseMoved',rect.x,rect.y);await wait(`Math.abs(document.querySelector('a.contact-card').getBoundingClientRect().top-(${resting}-7))<.3`,'hover transform settled');
  assert(await evaluate(`Math.abs(document.querySelector('a.contact-card').getBoundingClientRect().top-(${resting}-7))<.2`),'enabled card lifts 7px on hover');await shot('contact-hover');
  await mouse('mousePressed',rect.x,rect.y,1);await sleep(250);assert(await evaluate(`document.querySelector('a.contact-card').getBoundingClientRect().top>${resting}-6`),'press compresses hovered card');await shot('contact-press');await mouse('mouseReleased',rect.x,rect.y);
  assert(await evaluate('__actions.at(-1).href==="mailto:dhomhafiz@gmail.com"'),'mouse activation anywhere in email card opens configured mail destination');
  await mouse('mouseMoved',1100,270);await sleep(300);assert(await evaluate(`Math.abs(document.querySelector('a.contact-card').getBoundingClientRect().top-${resting})<.2`),'card returns to rest after pointer exit');
  const title=await evaluate('(()=>{const r=document.querySelector(".contact-title").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()');
  for(let x=750;x<1150;x+=40){await mouse('mouseMoved',x,200);await sleep(55)}await wait('document.querySelector(".contact-page").hasAttribute("data-html-ripple-active")','ripple active');await shot('contact-ripple');
  assert(await evaluate(`JSON.stringify((()=>{const r=document.querySelector('.contact-title').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})())===${JSON.stringify(JSON.stringify(title))}&&getComputedStyle(document.querySelector('.contact-title')).filter==='none'&&getComputedStyle(document.querySelector('a.contact-card')).filter==='none'&&document.querySelector('.contact-backdrop').style.filter.includes('url')`),'ripple affects only the decorative backdrop; text and control layout remain stationary');
  await send('Page.stopScreencast');await sleep(3200);assert(await evaluate('!document.querySelector(".contact-page").hasAttribute("data-html-ripple-active")&&!document.querySelector(".contact-backdrop").style.filter'),'ripple stops and removes filter after real wave lifetime');
  await evaluate('document.querySelectorAll("a.contact-card")[1].focus()');await key('Enter');assert(await evaluate('__actions.at(-1).href==="https://wa.me/60197860823"&&__actions.at(-1).target==="_blank"'),'keyboard Enter activates WhatsApp link in a new tab');await shot('contact-keyboard-focus');
  await evaluate('void(window.__contactArea=document.querySelector(".contact-page"))');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(150);
  assert(await evaluate('!document.querySelector(".contact-page").hasAttribute("data-html-ripple-ready")&&__pointerListeners.get(__contactArea).size===0&&getComputedStyle(document.querySelector("a.contact-card")).transitionDuration==="0s"'),'reduced motion removes ripple listeners and card transitions');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await sleep(150);
  rect=await evaluate('(()=>{const r=document.querySelector("a.contact-card").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[rect]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(await evaluate('__actions.at(-1).href==="mailto:dhomhafiz@gmail.com"'),'touch activates full email card');
  assert(await evaluate('document.querySelector("a.contact-card").getBoundingClientRect().bottom<innerHeight&&document.querySelectorAll("a.contact-card")[1].getBoundingClientRect().top<innerHeight*.8'),'first mobile action fully visible; second card substantially visible above fold');
  assert(await evaluate('document.documentElement.scrollWidth===innerWidth'),'390px has no horizontal overflow');await shot('contact-mobile-390');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});await sleep(100);assert(await evaluate('document.documentElement.scrollWidth===innerWidth&&document.querySelector("a.contact-card").getBoundingClientRect().bottom<innerHeight'),'320px has no overflow and shows the entire primary action');await shot('contact-mobile-320');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Emulation.setEmulatedMedia',{features:[]});
  await click('.room-return-control button');await wait('!!document.querySelector(".room-return-loader")','direct loader');await wait(ready,'direct contact return');await scene();
  assert(await evaluate('document.querySelectorAll(".room-surface canvas").length===1&&!document.querySelector(".boot-screen")'),'direct Contact returns through real readiness with one room Canvas and no boot');
  await evaluate('window.__canvas=document.querySelector(".room-surface canvas");window.__seenLoader=false;new MutationObserver(()=>{if(document.querySelector(".room-return-loader"))__seenLoader=true}).observe(document.body,{childList:true,subtree:true});__canvas.focus()');await key('ArrowLeft');await wait('Math.abs(__scene.camera.rotation.y-(Math.atan2(-1.2,3.35)+.105))<1e-10','Free Look settling before pose measurement');const saved=await pose();
  for(let i=0;i<5;i++){
    await wait(`(()=>{const b=document.querySelector('.hotspot-indicator[data-target="iphone_15_pro_max"]');if(!b)return false;const r=b.getBoundingClientRect();return r.width===44&&getComputedStyle(b).visibility==='visible'})()`,'phone beacon visible');
    await sleep(100);await click('.hotspot-indicator[data-target="iphone_15_pro_max"]');await wait('location.pathname==="/contact"&&document.querySelector(".contact-page")?.hasAttribute("data-contact-visible")','phone Contact cycle '+i);
    assert(await evaluate('document.querySelector(".room-surface canvas")===__canvas'),'persistent Canvas retained on Contact cycle '+i);
    assert(await evaluate('document.querySelectorAll(".contact-page").length===1&&document.querySelectorAll(".html-ripple-definitions").length===1&&__pointerListeners.get(document.querySelector(".contact-page"))?.size===1'),'one Contact and ripple listener cycle '+i);
    await evaluate('void(window.__lastContact=document.querySelector(".contact-page"))');await click('.room-return-control button');await wait(ready,'return cycle '+i);await scene();
    const actual=await pose();samples.push({cycle:i,saved,actual,phone:await evaluate('(()=>{const p=__scene.scene.getObjectByName("iphone_15_pro_max"),f=__scene.scene.getObjectByName("iphone_flip_pivot");return {y:p.position.y,flip:f.rotation.x}})()')});
    assert(Math.hypot(...actual.position.map((v,j)=>v-saved.position[j]))<1e-8&&Math.hypot(...actual.rotation.map((v,j)=>v-saved.rotation[j]))<1e-8,'exact saved camera restored cycle '+i);
    assert(await evaluate('document.querySelector(".room-surface canvas")===__canvas&&!__seenLoader&&!document.querySelector(".boot-screen")&&__pointerListeners.get(__lastContact)?.size===0'),'no loader, boot, duplicate Canvas or leaked ripple listener cycle '+i);
    assert(await evaluate('Math.abs(__scene.scene.getObjectByName("iphone_15_pro_max").position.y-.8045)<1e-8&&Math.abs(__scene.scene.getObjectByName("iphone_flip_pivot").rotation.x)<1e-8'),'phone returns to original face-down pose cycle '+i);
  }
  await shot('five-contact-cycles-home');
  for(const route of ['/work','/skills','/about','/credits']){
    await send('Page.navigate',{url:base+route});await wait('!!document.querySelector(".room-return-control button")','route '+route);await sleep(900);assert(await evaluate('document.querySelector("h1")?.textContent.length>0'),'destination remains functional '+route);
    if(route==='/work')assert(await evaluate('document.querySelectorAll(".gallery-liquid canvas").length===1'),'Work retains one existing ripple renderer');
    assert(await evaluate('getComputedStyle(document.querySelector(".room-return-control button")).fontSize==="11px"'),'default Return size preserved '+route);
  }
  assert(errors.length===0,'no runtime exceptions or React lifecycle errors');
  await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({base,results,errors,samples,captures},null,2));await send('Browser.close');
 }catch(error){try{samples.push({failureState:await inspectFailure('({url:location.href,room:{...document.querySelector(".room-experience")?.dataset},status:document.querySelector(".room-loader-status")?.textContent})')});await failureShot('failure')}catch{}await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({results,errors,samples,captures,failure:String(error)},null,2));throw error}
 finally{socket?.close();chrome.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
