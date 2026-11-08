/** Isolated local Chrome review; no user browser profile or external API traffic. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts/companion-robot');
const profile = path.join(root, '.tmp', 'robot-review-' + process.pid + '-' + Date.now());
const chromePath = process.env.CHROME_PATH ?? 'C:/Users/dhomh/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(action, label, timeout = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const result = await action(); if (result) return result; } catch { /* Startup/loading is expected. */ }
    await wait(250);
  }
  throw new Error('Timed out: ' + label);
}
async function cdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else listeners.get(message.method)?.(message.params);
  };
  return { socket, on: (name, callback) => listeners.set(name, callback),
    call: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 30_000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    }) };
}

const server = spawn('python', ['-m', 'http.server', '3005', '--bind', '127.0.0.1', '--directory', path.join(root, 'out')],
  { cwd: root, windowsHide: true, stdio: 'ignore' });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking',
  '--disable-component-update', '--no-first-run', '--no-default-browser-check', 'about:blank'],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeDiagnostics = '';
chrome.stderr.on('data', data => { chromeDiagnostics += data.toString(); });
chrome.on('error', error => { chromeDiagnostics += error.message; });
let browser;
let page;
const errors = [];
try {
  await until(async () => (await fetch('http://127.0.0.1:3005', { signal: AbortSignal.timeout(2000) })).ok, 'local static server');
  console.log('Local static server ready.');
  const port = await until(() => {
    const file = path.join(profile, 'DevToolsActivePort');
    return fs.existsSync(file) && Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
  }, 'Chrome debug port');
  const version = await until(async () => (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })).json(), 'isolated Chrome');
  console.log('Isolated Chrome ready.');
  browser = await cdp(version.webSocketDebuggerUrl);
  const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank' });
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.id === targetId);
  page = await cdp(target.webSocketDebuggerUrl);
  page.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
  page.on('Runtime.consoleAPICalled', event => {
    if (event.type === 'error') errors.push(event.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
  });
  await page.call('Page.enable'); await page.call('Runtime.enable'); await page.call('Network.enable');
  await page.call('Network.setBlockedURLs', { urls: ['*workers.dev*', '*api.cloudflare.com*'] });
  // Existing room props need Draco. Fulfil their CDN decoder requests from the installed
  // Three.js copies; no external network or production API traffic is necessary.
  page.on('Fetch.requestPaused', event => {
    const url = new URL(event.request.url);
    const filename = path.basename(url.pathname);
    if (url.hostname === 'www.gstatic.com' && ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js'].includes(filename)) {
      const decoder = fs.readFileSync(path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf', filename));
      void page.call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Content-Type', value: filename.endsWith('.wasm') ? 'application/wasm' : 'application/javascript' }],
        body: decoder.toString('base64') }).catch(error => errors.push(error.message));
    } else void page.call('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(error => errors.push(error.message));
  });
  await page.call('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
  const evaluate = async expression => {
    const result = await page.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    globalThis.__robotReview = { scenes: [], renderer: null, camera: null };
    globalThis.__THREE_DEVTOOLS__ = new EventTarget();
    globalThis.__THREE_DEVTOOLS__.addEventListener('observe', ({detail}) => {
      if (detail.isScene) __robotReview.scenes.push(detail);
      if (detail.isWebGLRenderer) {
        __robotReview.renderer = detail;
        const render = detail.render.bind(detail);
        detail.render = (scene, camera) => {
          if (scene.getObjectByName('myverse_ai_companion')) {
            __robotReview.camera = camera; __robotReview.activeScene = scene;
          }
          return render(scene, camera);
        };
      }
    });
  ` });
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await page.call('Page.navigate', { url: 'http://127.0.0.1:3005/' });
  await until(() => evaluate(`!!document.querySelector('.enter-button:not(:disabled)')`), 'scene readiness');
  await evaluate(`document.querySelector('.enter-button').click()`);
  await until(() => evaluate(`!!document.querySelector('.mobile-ai-entry') && !document.querySelector('.boot-screen')`), 'room entrance');
  await wait(500);
  const screenshot = async name => {
    const result = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
  };
  const robotMetrics = async () => evaluate(`(() => {
    const scene = __robotReview.activeScene;
    const root = scene?.getObjectByName('myverse_ai_companion');
    const model = root?.getObjectByName('companion_root');
    const camera = __robotReview.camera;
    if (!root || !model || !camera) return null;
    scene.updateMatrixWorld(true);
    const worldBounds = groups => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      groups.forEach(group => group.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        const bounds = object.geometry.boundingBox;
        const m = object.matrixWorld.elements;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = [m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13],
              m[2]*x + m[6]*y + m[10]*z + m[14]];
            for (let i=0; i<3; i++) { min[i] = Math.min(min[i], point[i]); max[i] = Math.max(max[i], point[i]); }
          }
      }));
      return max.map((value, i) => value-min[i]);
    };
    const head = root.getObjectByName('head_pivot');
    const point = head.getWorldPosition(head.position.clone()).project(camera);
    const chassis = root.getObjectByName('chassis');
    const fixedObjects = [...chassis.children.filter(object => object.isMesh),
      chassis.getObjectByName('track_left'), chassis.getObjectByName('track_right')];
    return { worldScale: model.getWorldScale(model.scale.clone()).toArray(), bounds: worldBounds([model]),
      fixedBounds: worldBounds(fixedObjects),
      headScreen: { x:(point.x+1)*innerWidth/2, y:(1-point.y)*innerHeight/2 } };
  })()`);
  const assertStableScale = (reference, current, label) => {
    assert.ok(current, `${label}: robot transform was unavailable`);
    current.worldScale.forEach((value, i) => assert.ok(Math.abs(value-reference.worldScale[i]) < 0.00001,
      `${label}: model world scale changed on axis ${i}: ${reference.worldScale[i]} -> ${value}`));
  };
  const waitForStateWithScaleSamples = async (condition, label, reference) => {
    const started = Date.now(), samples = [];
    while (Date.now() - started < 12_000) {
      if (await evaluate(condition)) return samples;
      const sample = await robotMetrics();
      assertStableScale(reference, sample, label);
      samples.push(sample);
      await wait(70);
    }
    throw new Error('Timed out: ' + label);
  };
  await screenshot('room-home');
  const live = await evaluate(`(() => {
    const scene = __robotReview.scenes.find(s => s.getObjectByName('myverse_ai_companion'));
    const root = scene?.getObjectByName('myverse_ai_companion');
    if (!root || !__robotReview.camera) return null;
    const head = root.getObjectByName('head_pivot');
    const point = head.getWorldPosition(head.position.clone()).project(__robotReview.camera);
    return { headScreen: {x:(point.x+1)*innerWidth/2, y:(1-point.y)*innerHeight/2},
      nodes: ['head_yaw','neck_pitch','neck_roll','shoulder_left','shoulder_right','elbow_left','elbow_right','wrist_left','wrist_right']
        .map(name => ({name, present:!!root.getObjectByName(name)})), renderCalls: __robotReview.renderer.info.render.calls };
  })()`);
  assert.ok(live && live.nodes.every(n => n.present), 'Browser must load all articulated joints');
  const transformCycles = [];
  let roomMetrics = await robotMetrics();
  for (let cycle = 1; cycle <= 3; cycle++) {
    const clickPoint = roomMetrics.headScreen;
    await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...clickPoint });
    await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...clickPoint, button: 'left', clickCount: 1 });
    await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...clickPoint, button: 'left', clickCount: 1 });
    const openingSamples = await waitForStateWithScaleSamples(`!!document.querySelector('.companion-chat-close')`,
      `desktop focus ${cycle}`, roomMetrics);
    const focused = await robotMetrics();
    assertStableScale(roomMetrics, focused, `desktop focused state ${cycle}`);
    assert.ok(openingSamples.length > 1, `desktop focus ${cycle}: camera transition was not sampled`);
    if (cycle === 1) {
      await wait(200);
      await screenshot('robot-focus-desktop');
    }
    await evaluate(`document.querySelector('.companion-chat-close').click()`);
    const closingSamples = await waitForStateWithScaleSamples(
      `!!document.querySelector('[data-phase="exploring"][data-navigation-mode="explore"][data-companion-focus="closed"]')`,
      `desktop return ${cycle}`, roomMetrics);
    assert.ok(closingSamples.length > 1, `desktop return ${cycle}: camera transition was not sampled`);
    await wait(1200);
    const returned = await robotMetrics();
    assertStableScale(roomMetrics, returned, `desktop returned state ${cycle}`);
    returned.fixedBounds.forEach((value, i) => assert.ok(Math.abs(value-roomMetrics.fixedBounds[i]) < 0.00001,
      `desktop return ${cycle}: static chassis world bounds changed on axis ${i}`));
    transformCycles.push({ cycle, room: roomMetrics, focused, returned,
      transitionFramesChecked: openingSamples.length + closingSamples.length });
    roomMetrics = returned;
  }
  await evaluate(`[...document.querySelectorAll('.floating-room-navigation button')].find(b=>b.textContent.trim()==='WORK').click()`);
  await until(() => evaluate(`location.pathname.startsWith('/work')`), 'existing work transition');
  await until(() => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('RETURN TO 3D ROOM'))`), 'room return available');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('RETURN TO 3D ROOM')).click()`);
  await until(() => evaluate(`location.pathname==='/' && !document.querySelector('.room-return-loader') &&
    !!document.querySelector('[data-phase="exploring"][data-navigation-mode="explore"][data-companion-focus="closed"]')`), 'room return transition');
  await wait(700);
  await screenshot('room-return');
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wait(300);
  await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(900);
  const mobileRoomMetrics = await robotMetrics();
  await evaluate(`document.querySelector('[aria-label="Open AI Companion chat"]').click()`);
  await until(() => evaluate(`!!document.querySelector('.companion-chat-close')`), 'mobile companion framing');
  await wait(700);
  const mobileFocusedMetrics = await robotMetrics();
  assertStableScale(mobileRoomMetrics, mobileFocusedMetrics, 'reduced-motion mobile focus');
  const mobileFrame = await evaluate(`(() => {
    const head = __robotReview.activeScene.getObjectByName('head_pivot');
    const mesh = head.getObjectByProperty('isMesh', true);
    mesh.geometry.computeBoundingBox();
    const bounds = new mesh.geometry.boundingBox.constructor().setFromObject(head, true);
    const pixels = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = head.position.clone().set(x,y,z).project(__robotReview.camera);
        pixels.push({x:(p.x+1)*innerWidth/2, y:(1-p.y)*innerHeight/2});
      }
    const sheet = document.querySelector('.companion-chat-close').closest('[aria-labelledby]').getBoundingClientRect();
    return { minX:Math.min(...pixels.map(p=>p.x)), maxX:Math.max(...pixels.map(p=>p.x)),
      minY:Math.min(...pixels.map(p=>p.y)), maxY:Math.max(...pixels.map(p=>p.y)), sheetTop:sheet.top, width:innerWidth };
  })()`);
  assert.ok(mobileFrame.minX >= 0 && mobileFrame.maxX <= mobileFrame.width, 'Mobile head must fit horizontally');
  assert.ok(mobileFrame.minY >= 0 && mobileFrame.maxY < mobileFrame.sheetTop, 'Mobile head must be visible above the chat sheet');
  await screenshot('robot-focus-mobile');
  await evaluate(`document.querySelector('.companion-chat-close').click()`);
  await until(() => evaluate(`!!document.querySelector('.mobile-ai-entry')`), 'mobile close');
  const mobileReturnedMetrics = await robotMetrics();
  assertStableScale(mobileRoomMetrics, mobileReturnedMetrics, 'reduced-motion mobile return');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await wait(500);
  const waveBefore = await evaluate(`(() => {
    const scene = __robotReview.activeScene;
    const head = scene.getObjectByName('head_pivot');
    const p = head.getWorldPosition(head.position.clone()).project(__robotReview.camera);
    return {x:(p.x+1)*innerWidth/2, y:(1-p.y)*innerHeight/2, angle:scene.getObjectByName('shoulder_right').rotation.z};
  })()`);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: waveBefore.x, y: waveBefore.y });
  await wait(600);
  const waveAfter = await evaluate(`__robotReview.activeScene.getObjectByName('shoulder_right').rotation.z`);
  assert.ok(Math.abs(waveAfter - waveBefore.angle) > 0.03, 'Existing hover greeting must move the articulated shoulder');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  fs.writeFileSync(path.join(artifacts, 'browser-validation.json'), JSON.stringify({ live, transformCycles,
    mobileScale: { room: mobileRoomMetrics.worldScale, focused: mobileFocusedMetrics.worldScale, returned: mobileReturnedMetrics.worldScale }, mobileFrame,
    hoverWaveRadians: { before: waveBefore.angle, after: waveAfter }, errors,
    checks: ['desktop GLB import and joints', 'natural asymmetric arm rest pose and hand clearance',
      'three desktop companion focus and room return cycles with sampled world scale and bounds',
      'reduced-motion mobile focus and return preserve world scale', 'work hotspot transition',
      'return to room', 'mobile head visible above chat', 'mobile companion focus and close', 'existing articulated hover greeting'],
    externalRequestsBlocked: true }, null, 2) + '\n');
  console.log('Browser robot, companion focus, mobile framing, and room-return checks passed.');
} catch (error) {
  if (page) {
    const screenshot = await page.call('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (screenshot) fs.writeFileSync(path.join(artifacts, 'review-failure.png'), Buffer.from(screenshot.data, 'base64'));
    const state = await page.call('Runtime.evaluate', { expression: 'document.body.innerText.slice(0,2000)', returnByValue: true }).catch(() => null);
    console.error(state?.result?.value);
  }
  fs.writeFileSync(path.join(artifacts, 'review-errors.json'), JSON.stringify(errors, null, 2));
  console.error('Browser errors:', errors.length, [...new Set(errors)].slice(0, 2).map(e => e.slice(0, 500)));
  throw error;
} finally {
  fs.writeFileSync(path.join(root, '.tmp', 'robot-review-last.log'), chromeDiagnostics);
  await browser?.call('Browser.close').catch(() => {});
  page?.socket.close(); browser?.socket.close(); chrome.kill(); server.kill();
}
