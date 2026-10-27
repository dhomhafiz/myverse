/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node validation harness. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const results=[];function pass(name){results.push(name);console.log('PASS',name)}
function load(file,mocks,extras={}) {const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id]},console,process:{env:{NODE_ENV:'production'}},...extras});return exports;}
function sceneHarness(file){
 let cursor=0;const refs=[],effects=[];let queued=[];let useFrame;const after=new Set(),rafs=new Map();let rafID=0;let progress={active:false,loaded:1,total:1,errors:[]};const compiles=[];let invalidates=0;
 const gl={info:{render:{frame:0}},domElement:{addEventListener(){},removeEventListener(){}},getContext:()=>({isContextLost:()=>false}),compileAsync:()=>new Promise(resolve=>compiles.push(resolve))};
 const state={gl,scene:{getObjectByName:()=>({})},camera:{position:{toArray:()=>[.3,1.35,-.6]},quaternion:{toArray:()=>[0,0,0,1]},projectionMatrix:{elements:[1,0,0,1]}},invalidate:()=>invalidates++};
 const React={useRef:value=>{const i=cursor++;return refs[i]??(refs[i]={current:value})},useEffect:(fn,deps)=>{const i=cursor++;const old=effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))queued.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};
 const stages=[],gates=[];const props={onReadiness:s=>stages.push(s),onGate:g=>gates.push(g),onFailure:e=>{throw e},onProgress(){}};
 const Component=load(file,{'react':React,'@react-three/fiber':{useThree:()=>state,useFrame:fn=>{useFrame=fn},addAfterEffect:fn=>{after.add(fn);return ()=>after.delete(fn)}},'@react-three/drei':{useProgress:selector=>selector(progress)}},{requestAnimationFrame:fn=>{rafs.set(++rafID,fn);return rafID},cancelAnimationFrame:id=>rafs.delete(id)}).default;
 function render(active){progress={...progress,active};cursor=0;queued=[];Component(props);queued.forEach(fn=>fn())}
 return {render,stages,gates,gl,rafs,after,frame:()=>useFrame(),compile:async()=>{compiles.splice(0).forEach(resolve=>resolve());await Promise.resolve();await Promise.resolve()},invalidates:()=>invalidates,cleanup:()=>effects.forEach(e=>e?.cleanup?.())};
}
(async()=>{
 // Baseline source is supplied only when investigating; the shipping regression test needs no baseline file.
 if(fs.existsSync('artifacts/phase3d1/SceneReadiness.baseline.txt')){
  const old=sceneHarness('artifacts/phase3d1/SceneReadiness.baseline.txt');old.render(false);await old.compile();old.frame();assert.equal(old.rafs.size,1);old.render(true);assert.equal(old.rafs.size,0);old.render(false);await old.compile();old.frame();assert.equal(old.rafs.size,0);assert(!old.stages.includes('ready'));old.cleanup();pass('Baseline reproduction: a loading lifecycle change cancels the ready RAF and the sent latch prevents recovery');
 }
 const h=sceneHarness('components/canvas/SceneReadiness.tsx');h.render(false);await h.compile();h.frame();h.render(true);h.render(false);await h.compile();h.frame();h.after.forEach(fn=>fn());assert(!h.stages.includes('ready'));h.gl.info.render.frame++;h.after.forEach(fn=>fn());assert.equal(h.stages.filter(s=>s==='ready').length,1);h.after.forEach(fn=>fn());assert.equal(h.stages.filter(s=>s==='ready').length,1);assert(h.invalidates()>0);h.cleanup();assert.equal(h.after.size,0);pass('Fixed pipeline resumes after loading changes; readiness requires a completed draw, is idempotent and cleans up');
 const links=[];const p=load('lib/room-preparation.ts',{}, {document:{createElement:()=>({}),head:{appendChild:link=>links.push(link)}}});const r=p.roomPreparation;
 r.startPreloading();r.beginReturn();r.initialize(0);r.reportAssets(1,1,false,0);r.markSceneReady(0);assert.notEqual(r.getSnapshot().status,'sceneReady');assert.equal(r.beginTransition(),false);pass('Asset completion alone cannot authorize scene readiness or a transition');
 for(const gate of p.readinessGates)r.signal(gate,0);r.markSceneReady(0);assert.equal(r.getSnapshot().status,'sceneReady');links.forEach(link=>link.onload());assert.equal(r.getSnapshot().status,'sceneReady');assert(r.beginTransition());links.forEach(link=>link.onload());assert.equal(r.getSnapshot().status,'transitioning');pass('Late prefetch completions cannot regress ready/transitioning lifecycle state');
 const attempt=r.getSnapshot().attempt;r.cancelReturn();r.beginReturn();r.markSceneReady(attempt);r.fail(new Error('stale'),attempt);assert.notEqual(r.getSnapshot().status,'failed');assert.equal(r.markTransitionComplete(),false);pass('Cancelled attempts cannot publish readiness/failure or complete a later navigation');
 r.fail(new Error('recoverable'));const failed=r.getSnapshot().attempt;r.beginReturn();assert.equal(r.getSnapshot().attempt,failed+1);r.fail(new Error('old'),failed);assert.notEqual(r.getSnapshot().status,'failed');r.beginReturn();assert.equal(r.getSnapshot().attempt,failed+1);pass('Retry invalidates failed callbacks; repeated return requests do not create new attempts');
 fs.writeFileSync('artifacts/phase3d1/pipeline-regression-report.json',JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
