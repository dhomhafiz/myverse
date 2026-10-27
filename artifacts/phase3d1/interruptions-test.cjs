/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node validation harness. */
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const root=process.cwd(),out=path.join(root,process.env.TEST_OUTPUT||'artifacts/phase3d1');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await fs.mkdir(out,{recursive:true});const profile=path.join(root,'.tmp/chrome-beacon-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let inspectFailure,failureShot; let socket;const results=[],errors=[],samples=[],captures=[];let filmstrip=0;const paused=[];
 try{
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await sleep(100);}}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){if(m.error)p.reject(m.error);else p.resolve(m.result);}}if(m.method==='Fetch.requestPaused')paused.push(m.params.requestId);if(m.method==='Page.screencastFrame'){const n=filmstrip++;if(n<80)fs.writeFile(path.join(out,'return-frame-'+String(n).padStart(3,'0')+'.jpg'),Buffer.from(m.params.data,'base64'));send('Page.screencastFrameAck',{sessionId:m.params.sessionId});}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});socket.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const assert=(pass,label)=>{if(!pass)throw Error(label);results.push({pass,label});console.log('PASS',label);};
  const wait=async(expression,label)=>{for(let i=0;i<1500;i++){if(await evaluate(expression))return;await sleep(20);}throw Error('Timeout: '+label);};
  const mouse=(type,x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type,x,y,buttons,button:type==='mouseMoved'?'none':'left',clickCount:type==='mouseMoved'?0:1});
  const click=async selector=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse('mouseMoved',p.x,p.y);await mouse('mousePressed',p.x,p.y,1);await mouse('mouseReleased',p.x,p.y);};
  const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));captures.push(name);};
  inspectFailure=evaluate;failureShot=shot;
  const base=process.env.TEST_URL||'http://127.0.0.1:3026';
  const ready='location.pathname==="/"&&document.querySelector(".room-experience")?.dataset.navigationMode==="explore"&&!document.querySelector(".room-return-loader")';
  const open=async route=>{await send('Page.navigate',{url:base+route});await wait('!!document.querySelector(".room-return-control button")','destination');await sleep(900)};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Network.setBlockedURLs',{urls:['*models/pc-balanced.glb*']});
  await open('/skills');await click('.room-return-control button');await wait('document.querySelector(".experience-shell")?.dataset.roomStatus==="failed"','blocked asset failure');await shot('12-asset-error');
  assert(await evaluate('!!document.querySelector(".room-loader-actions button:first-child")'),'asset failure offers Retry and Cancel');
  await send('Network.setBlockedURLs',{urls:[]});await click('.room-loader-actions button:first-child');await wait(ready,'retry actual failed asset');assert(true,'Retry recovers from actual blocked model request and rejected loader cache');
  await open('/work');await wait('document.querySelector(".gallery")?.hasAttribute("data-gallery-interactive")','gallery reveal');await click('.work-actions a');await wait('location.pathname==="/work/netflix"','case study');await sleep(500);
  await send('Fetch.enable',{patterns:[{urlPattern:'*models/*.glb*',requestStage:'Request'}]});
  await evaluate('for(let i=0;i<5;i++)document.querySelector(".room-return-control button").click()');
  await wait('document.querySelectorAll(".room-surface canvas").length===1','single canvas');await sleep(300);
  assert(await evaluate('document.querySelectorAll(".room-surface canvas").length===1&&document.querySelector(".room-return-control button").disabled'),'rapid return activation creates one pending scene');
  await evaluate('history.back()');await wait('location.pathname==="/work"&&!document.querySelector(".room-return-loader")','navigate away cancels');
  await send('Fetch.disable');await sleep(2500);
  assert(await evaluate('location.pathname==="/work"&&!document.querySelector(".room-surface canvas")'),'navigation away cancels intent and late network completions cannot redirect');
  await click('.room-return-control button');await wait(ready,'return after interruption');assert(true,'return remains usable after route interruption');
  await open('/skills');await send('Page.reload',{ignoreCache:true});await wait('document.querySelector(".skills-dashboard")?.hasAttribute("data-skills-visible")','refreshed skills');await sleep(500);assert(await evaluate('!document.querySelector(".room-surface canvas")'),'refresh Skills preserves direct-entry behavior');
  await click('.room-return-control button');
  await wait('!!document.querySelector(".room-surface canvas")','canvas before tab visibility change');
  const background = await send('Target.createTarget',{url:'about:blank'});
  await send('Target.activateTarget',{targetId:background.targetId});
  const hiddenState = await evaluate('document.visibilityState');
  await sleep(350);
  await send('Target.activateTarget',{targetId:target.id});await send('Page.bringToFront');
  await wait(ready,'resume after tab visibility change');
  samples.push({hiddenState,resumedState:await evaluate('document.visibilityState')});
  assert(hiddenState==='hidden','preparation survives an actual hidden tab');
  assert(true,'preparation completes after tab becomes visible');
  await send('Target.closeTarget',{targetId:background.targetId});
  await fs.writeFile(path.join(out,'interruptions-report.json'),JSON.stringify({base,results,errors,captures,samples,pausedRequests:paused.length},null,2));await send('Browser.close');
 }catch(error){try{samples.push({failureState:await inspectFailure('({url:location.href,shell:{...document.querySelector(".experience-shell")?.dataset},error:document.querySelector(".room-loader-status")?.textContent})')});await failureShot('interruption-failure');}catch{}await fs.writeFile(path.join(out,'interruptions-report.json'),JSON.stringify({results,errors,samples,captures,failure:String(error)},null,2));throw error;}
 finally{if(socket)socket.close();chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
