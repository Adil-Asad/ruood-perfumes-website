/**
 * A very small Chrome DevTools Protocol client, shared by the three tools
 * that need a real browser: make-icons.mjs, measure.mjs and shots.mjs.
 *
 * Chrome's old `--headless --screenshot --window-size=…` does not apply
 * mobile emulation, so a phone-width capture comes back laid out for a wider
 * viewport and cropped — which reads exactly like a horizontal-overflow bug
 * that is not there. `Emulation.setDeviceMetricsOverride` over the protocol
 * is the authoritative path, so everything here goes through it.
 *
 * No dependencies: Node's global WebSocket talks to Chrome directly.
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The two places a Windows Chrome install puts itself. */
const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome() {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    console.error('Chrome was not found. Looked in:\n  ' + CANDIDATES.join('\n  '));
    process.exit(1);
  }
  return found;
}

/** Launch headless Chrome and open one protocol connection to it. */
export async function launch(port = 9333) {
  const profile = join(tmpdir(), 'ruood-cdp-' + Date.now());
  const chrome = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank',
  ], { stdio: 'ignore' });

  let endpoint = null;
  for (let attempt = 0; attempt < 80 && !endpoint; attempt++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      endpoint = info.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!endpoint) {
    chrome.kill();
    throw new Error('Chrome never opened its debugging port');
  }

  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Could not connect to Chrome'));
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    // An event: Log.entryAdded, Runtime.exceptionThrown, and so on.
    if (message.method) {
      for (const listener of listeners) listener(message.method, message.params || {});
    }
  };

  /** Listen to every protocol event; the handler filters by method name. */
  function on(handler) { listeners.push(handler); }

  /** Send one protocol command, optionally to a page session. */
  function send(method, params = {}, sessionId) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  /** Open a tab and attach to it; returns a session-bound `send`. */
  async function page() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    return { call, targetId, close: () => send('Target.closeTarget', { targetId }) };
  }

  function close() {
    try { ws.close(); } catch { /* already gone */ }
    chrome.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may hold it */ }
  }

  return { send, page, on, close };
}

/** Navigate and wait for the load event plus a settling frame or two. */
export async function goto(call, url, settle = 450) {
  const loaded = new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(async () => {
      const { result } = await call('Runtime.evaluate', {
        expression: 'document.readyState', returnByValue: true,
      });
      if (result.value === 'complete' || Date.now() - started > 15000) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
  await call('Page.navigate', { url });
  await loaded;
  await new Promise((r) => setTimeout(r, settle));
}
