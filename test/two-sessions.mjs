// Two zen-mcp processes against one fake Zen (test/fake-zen.mjs). usage: npm run test:idle
// Before the idle release, step 1 failed with "session not created".
// 1. A calls, goes idle; after IDLE+1 s, B calls (today: B fails while idle A holds Zen)
// 2. B just called (holds it); A calls at once: should wait for B's idle release, not fail
// 3. reconnect cost: A's call after its own idle release, ms
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const server = here('../server.mjs'), port = '9333';
const fake = spawn('node', [here('fake-zen.mjs'), port], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 500));
let failed = 0;
const check = (label, r) => { console.log(label, r); if (!r.ok) failed++; };
const IDLE = 2000;
setTimeout(() => (console.log('TIMEOUT'), process.exit(2)), 60000).unref();

function client(name) {
  const p = spawn('node', [server], { env: { ...process.env, ZEN_DEBUG_PORT: port, ZEN_IDLE_MS: String(IDLE) } });
  let buf = '', id = 0;
  const waits = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const m = JSON.parse(line);
      waits.get(m.id)?.(m);
    }
  });
  const rpc = (method, params) =>
    new Promise((r) => {
      waits.set(++id, r);
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  return {
    p,
    init: () => rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name, version: '0' } }),
    call: async () => {
      const t = Date.now();
      const m = await rpc('tools/call', { name: 'zen_list_pages', arguments: {} });
      const ok = !m.result?.isError;
      return { ok, ms: Date.now() - t, text: ok ? '' : m.result.content[0].text.split('\n')[0] };
    },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = client('A'), B = client('B');
try {
  await A.init();
  await B.init();
  check('1 A call     ', await A.call());
  await sleep(IDLE + 1000);
  check('1 B after idle', await B.call());
  check('2 A while B holds', await A.call());
  await sleep(IDLE + 1000);
  check('3 A after own idle', await A.call());
} finally {
  A.p.kill('SIGTERM');
  B.p.kill('SIGTERM');
  fake.kill();
}
process.exit(failed ? 1 : 0);
