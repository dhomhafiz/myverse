/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node validation harness. */
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const root=process.cwd(),out=path.join(root,process.env.TEST_OUTPUT||'artifacts/phase3d1');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});const profile=path.join(root,'.tmp/chrome-beacon-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let inspectFailure,failureShot; let socket;const results=[],errors=[],samples=[],captures=[];let filmstrip=0;
 try{
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(m.error);else p.resolve(m.result);}}if(m.method==='Page.screencastFrame'){const n=filmstrip++;if(n<80)fs.writeFile(path.join(out,'return-frame-'+String(n).padStart(3,'0')+'.jpg'),Buffer.from(m.params.data,'base64'));send('Page.screencastFrameAck',{sessionId:m.params.sessionId});}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
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
  const base=process.env.TEST_URL||'http://127.0.0.1:3026';
  const ready='location.pathname==="/"&&document.querySelector(".room-experience")?.dataset.navigationMode==="explore"&&document.querySelector(".room-experience")?.dataset.phase==="exploring"&&!document.querySelector(".room-return-loader")';
  const status=()=>evaluate('({route:location.pathname,status:document.querySelector(".experience-shell")?.dataset.roomStatus,pending:document.querySelector(".experience-shell")?.dataset.roomPending,room:{...document.querySelector(".room-experience")?.dataset},label:document.querySelector(".room-loader-status")?.textContent,canvas:document.querySelectorAll(".room-surface canvas").length})');
  const direct=async route=>{
    await send('Page.navigate',{url:base+route});
    await wait('document.querySelector(".room-return-control button")&&!document.querySelector(".boot-screen")','destination');
    await wait('document.activeElement?.tagName==="H1" || location.pathname.startsWith("/work/")','hydration');
    if(route.startsWith('/work/'))await sleep(500);
    assert(await evaluate('document.querySelectorAll(".room-surface canvas").length===0'),route+' direct entry has no room renderer');
  };
  const returnRoom=async(label,capture=false)=>{
    if(capture)await send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:1000,maxHeight:700,everyNthFrame:1});
    await click('.room-return-control button');
    await wait('!!document.querySelector(".room-return-loader")','conditional loader');
    if(capture)await shot('01-skills-loading');
    await wait('!!document.querySelector(".room-surface canvas")','canvas mount');
    for(let i=0;i<200;i++){if(await scene())break;await sleep(10)}
    await evaluate(`window.__draws=[];window.__originalRender=__scene.gl.render;__scene.gl.render=function(...args){__draws.push({position:__scene.camera.position.toArray(),fov:__scene.camera.fov,status:document.querySelector('.experience-shell').dataset.roomStatus,pending:document.querySelector('.experience-shell').dataset.roomPending});return __originalRender.apply(this,args)}`);
    let finalizing=false;
    for(let i=0;i<1500;i++){
      const state=await status();
      if(state.label==='FINALIZING SCENE...'&&!finalizing){finalizing=true;if(capture)await shot('02-skills-finalizing');}
      if(state.route==='/'&&state.room.navigationMode==='explore')break;
      if(state.status==='failed')throw Error(JSON.stringify(state));
      await sleep(20);
    }
    await wait(ready,'return complete '+label);
    await scene();
    const draws=await evaluate('window.__draws');
    samples.push({label,draws,state:await status(),pose:await pose()});
    const monitorX=label.includes('skills')?.3:-.7;
    assert(draws.some(d=>Math.abs(d.position[0]-monitorX)<.03),label+' starts at configured '+(monitorX>0?'RIGHT':'LEFT')+' monitor focus');
    assert(await evaluate('Math.hypot(...__scene.camera.position.toArray().map((v,i)=>v-[-1.35,1.6,1.7][i]))<1e-8'),label+' dollies to Home');
    assert(await evaluate('document.querySelector(".experience-shell").dataset.roomPending===""'),label+' all real readiness gates satisfied');
    assert(await evaluate('document.activeElement===document.querySelector(".room-surface canvas")'),label+' Free Look receives keyboard focus');
    if(capture){await shot('03-skills-return-home');await send('Page.stopScreencast');}
    await evaluate('__scene.gl.render=__originalRender');
  };
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  for(const route of ['/skills','/skills','/skills','/work','/work/netflix','/work/project-preview']){await direct(route);await returnRoom(route,route==='/skills'&&samples.length===0);}
  // A separate root-origin session verifies original boot and persistent room ownership.
  await send('Page.navigate',{url:base+'/'});await wait('document.querySelector(".room-experience")?.dataset.phase==="ready"','root boot ready');
  await click('.enter-button');await wait('!!document.querySelector(".intro-skip")','intro');await key('Escape');await wait(ready,'boot enter');await scene();
  await evaluate('window.__persistent=document.querySelector(".room-surface canvas");__persistent.focus()');await key('ArrowLeft');await wait('Math.abs(__scene.camera.rotation.y-(Math.atan2(-1.2,3.35)+.105))<1e-10','Free Look settles');
  const saved=await pose();
  await evaluate(`window.__chairPose=()=>{const transforms=[];__scene.scene.getObjectByName('gaming_chair').traverse(o=>transforms.push({id:o.uuid,p:o.position.toArray(),q:o.quaternion.toArray()}));return JSON.stringify(transforms)};window.__chairBefore=__chairPose()`);
  await evaluate(`window.__loaderSeen=false; window.__observer=new MutationObserver(()=>{if(document.querySelector('.room-return-loader'))window.__loaderSeen=true});__observer.observe(document.body,{subtree:true,childList:true})`);
  for(let i=0;i<5;i++){
    const skills=i%2===0,route=skills?'/skills':'/work';
    await wait(`(()=>{const b=document.querySelector('.hotspot-indicator[data-target="${skills?'monitor_right':'monitor_left'}"]');if(!b)return false;const r=b.getBoundingClientRect(),v=__scene.camera.position.clone().set(0,.48,.04);__scene.scene.getObjectByName('${skills?'screen_right_anchor':'screen_left_anchor'}').localToWorld(v);v.project(__scene.camera);return Math.hypot((v.x+1)*innerWidth/2-r.x-r.width/2,(1-v.y)*innerHeight/2-r.y-r.height/2)<1})()`,'beacon position settled');
    await click(skills?'.hotspot-indicator[data-target="monitor_right"]':'.hotspot-indicator[data-target="monitor_left"]');
    await wait(`location.pathname===${JSON.stringify(route)}&&document.activeElement?.tagName==='H1'`,'room-origin destination');
    await sleep(700);
    assert(await evaluate('document.querySelector(".room-surface canvas")===__persistent'),route+' retains Canvas cycle '+i);
    if(i<2){await mouse('mouseMoved',1000,700);await shot(skills?'04-skills-idle':'07-work-idle');const b=await evaluate('(()=>{const r=document.querySelector(".room-return-control button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await mouse('mouseMoved',b.x,b.y);await sleep(250);await shot(skills?'05-skills-hover':'08-work-hover');assert(await evaluate('getComputedStyle(document.querySelector(".room-return-control button"),"::after").transform==="matrix(1, 0, 0, 1, 0, 0)"'),'shared hover underline '+route);}
    if(i===0){await evaluate('document.querySelector(".room-return-control button").focus()');await key('Tab');await key('Tab');await evaluate('document.querySelector(".room-return-control button").focus()');await shot('06-skills-focus');await key('Enter');}else await click('.room-return-control button');
    await wait(ready,'cycle '+i);
    assert(await evaluate('document.querySelector(".room-surface canvas")===__persistent&&!__loaderSeen'),'persistent return has no loader '+i);
    const p=await pose();samples.push({cycle:i,saved,returned:p});assert(Math.hypot(...p.position.map((v,j)=>v-saved.position[j]))<1e-8&&Math.hypot(...p.rotation.map((v,j)=>v-saved.rotation[j]))<1e-8,'saved Free Look restored '+i);
    assert(await evaluate('!document.querySelector(".boot-screen")'),'no repeated boot '+i);
  }
  assert(await evaluate('__chairPose()===__chairBefore'),'chair hierarchy and pose remain unchanged over five cycles');
  await shot('09-five-cycles-home');
  // Cancel an actual in-flight compilation and try again from the same destination.
  await direct('/skills');await click('.room-return-control button');await wait('!!document.querySelector(".room-return-loader")','cancel loader');await click('.room-loader-actions button:last-child');await sleep(2500);
  assert(await evaluate('location.pathname==="/skills"&&!document.querySelector(".room-return-loader")&&!document.querySelector(".room-surface canvas")'),'cancel removes attempt; late callbacks cannot navigate');
  await returnRoom('skills-after-cancel');
  // Fail the existing context-loss handler while initialization is covered, then retry.
  await direct('/skills');await click('.room-return-control button');await wait('document.querySelector(".room-experience")?.dataset.readiness==="compiling"','compile before simulated loss');
  await evaluate('document.querySelector(".room-surface canvas").dispatchEvent(new Event("webglcontextlost",{cancelable:true}))');await wait('document.querySelector(".experience-shell")?.dataset.roomStatus==="failed"','failure recovery');await shot('10-recoverable-failure');
  assert(await evaluate('document.querySelector(".room-loader-status").textContent.includes("context was lost")'),'failure explains actual failed condition');
  await click('.room-loader-actions button:first-child');await wait(ready,'retry context event');assert(true,'Retry remounts failed attempt and returns successfully');await scene();
  // Browser history initiates/cancels returns through the shared shell.
  await wait(`(()=>{const b=document.querySelector('.hotspot-indicator[data-target="monitor_right"]');if(!b)return false;const r=b.getBoundingClientRect(),v=__scene.camera.position.clone().set(0,.48,.04);__scene.scene.getObjectByName('screen_right_anchor').localToWorld(v);v.project(__scene.camera);return Math.hypot((v.x+1)*innerWidth/2-r.x-r.width/2,(1-v.y)*innerHeight/2-r.y-r.height/2)<1})()`,'history beacon settled');
  await click('.hotspot-indicator[data-target="monitor_right"]');await wait('location.pathname==="/skills"&&document.activeElement?.tagName==="H1"','history destination');await evaluate('history.back()');await wait(ready,'history back');await evaluate('history.forward()');await wait('location.pathname==="/skills"&&document.activeElement?.tagName==="H1"','history forward');assert(true,'Browser Back/Forward restores destination and room');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await sleep(300);await shot('11-mobile-skills');
  assert(await evaluate('document.documentElement.scrollWidth===innerWidth'),'mobile has no horizontal document overflow');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate('document.querySelector(".room-return-control button").focus()');
  assert(await evaluate('getComputedStyle(document.querySelector(".room-return-control button"),"::before").transitionDuration==="0s"'),'reduced motion disables shared sweep transition');
  const tap=await evaluate('(()=>{const r=document.querySelector(".room-return-control button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tap]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(ready,'touch return');assert(true,'touch activates shared return');
  const unexpected=errors.filter(e=>!JSON.stringify(e).includes('graphics context was lost'));
  assert(!unexpected.length,'no unexpected runtime errors or React root unmount errors');
  await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({base,results,errors,samples,captures},null,2));await send('Browser.close');
 }catch(error){try{samples.push({failureState:await inspectFailure('({url:location.href,shell:document.querySelector(".experience-shell")?.outerHTML.slice(0,1000)})')});await failureShot('failure');}catch{}await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify({results,errors,samples,captures,failure:String(error)},null,2));throw error;}
 finally{if(socket)socket.close();chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});

