// Fake Zen BiDi endpoint: one active session at a time, like Zen. A session ends on session.end or when its socket closes.
// usage: node test/fake-zen.mjs <port>
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2]);
let owner = null; // the socket that holds the one session
const wss = new WebSocketServer({ port, path: '/session' });
wss.on('connection', (ws) => {
  ws.on('close', () => {
    if (owner === ws) owner = null;
  });
  ws.on('message', (raw) => {
    const { id, method } = JSON.parse(raw);
    const ok = (result) => ws.send(JSON.stringify({ type: 'success', id, result }));
    if (method === 'session.new') {
      if (owner && owner !== ws)
        return ws.send(
          JSON.stringify({ type: 'error', id, error: 'session not created', message: 'Maximum number of active sessions' }),
        );
      owner = ws;
      return ok({ sessionId: 's' + Date.now() });
    }
    if (method === 'session.end') {
      if (owner === ws) owner = null;
      return ok({});
    }
    if (method === 'browsingContext.getTree')
      return ok({ contexts: [{ context: 'tab-1', url: 'about:blank', children: [] }, { context: 'tab-2', url: 'https://x', children: [] }] });
    ok({});
  });
});
console.error('fake zen on', port);
