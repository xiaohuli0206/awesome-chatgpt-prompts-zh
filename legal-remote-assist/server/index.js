const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8443);
const CERT_PATH = process.env.TLS_CERT_PATH || path.resolve(__dirname, '../certs/server.crt');
const KEY_PATH = process.env.TLS_KEY_PATH || path.resolve(__dirname, '../certs/server.key');
const ALLOW_PUBLIC = (process.env.ALLOW_PUBLIC || 'false').toLowerCase() === 'true';
const LOG_PATH = path.resolve(__dirname, '../logs/connections.log');

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  throw new Error('Missing TLS cert or key. Read README for certificate setup.');
}

const app = express();
app.use(express.static(path.resolve(__dirname, '../public')));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = https.createServer(
  {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
  },
  app
);

const wss = new WebSocketServer({ server });

const sessions = new Map();
const peers = new Map();

function isPrivateIPv4(ip) {
  const normalized = ip.replace('::ffff:', '');
  return (
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized) ||
    normalized === '127.0.0.1'
  );
}

function logConnection(event) {
  const line = `${new Date().toISOString()}\t${event.type}\t${event.ip}\t${event.device}\t${event.success}\n`;
  fs.appendFileSync(LOG_PATH, line, 'utf8');
}

function send(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function genPairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';

  if (!ALLOW_PUBLIC && !isPrivateIPv4(ip)) {
    send(ws, { type: 'error', message: 'Only LAN connections are allowed by policy.' });
    ws.close();
    return;
  }

  const peerId = uuidv4();
  peers.set(peerId, { ws, role: null, device: 'unknown', ip, sessionId: null });

  send(ws, { type: 'welcome', peerId, policy: { allowPublic: ALLOW_PUBLIC } });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON.' });
      return;
    }

    const peer = peers.get(peerId);
    if (!peer) return;

    if (msg.type === 'register_host') {
      peer.role = 'host';
      peer.device = String(msg.deviceName || 'host-device');
      const pairCode = genPairCode();
      const sessionId = uuidv4();
      sessions.set(sessionId, {
        sessionId,
        pairCode,
        createdAt: Date.now(),
        hostId: peerId,
        hostApproved: false,
        controllerId: null,
      });
      peer.sessionId = sessionId;
      send(ws, { type: 'host_registered', sessionId, pairCode });
      return;
    }

    if (msg.type === 'join_request') {
      peer.role = 'controller';
      peer.device = String(msg.deviceName || 'controller-device');
      const target = Array.from(sessions.values()).find((s) => s.pairCode === String(msg.pairCode || ''));

      if (!target) {
        logConnection({ type: 'join', ip, device: peer.device, success: 'false' });
        send(ws, { type: 'join_result', ok: false, reason: 'Pair code invalid' });
        return;
      }

      target.controllerId = peerId;
      peer.sessionId = target.sessionId;
      const host = peers.get(target.hostId);
      if (host) {
        send(host.ws, {
          type: 'approval_needed',
          fromPeerId: peerId,
          controllerDevice: peer.device,
          controllerIp: ip,
          sessionId: target.sessionId,
        });
      }
      return;
    }

    if (msg.type === 'host_approval') {
      const session = sessions.get(msg.sessionId);
      if (!session || session.hostId !== peerId) return;
      session.hostApproved = !!msg.allow;
      const controller = peers.get(session.controllerId);
      if (controller) {
        send(controller.ws, { type: 'join_result', ok: session.hostApproved, sessionId: session.sessionId });
      }
      logConnection({
        type: 'join',
        ip: controller?.ip || 'unknown',
        device: controller?.device || 'unknown',
        success: session.hostApproved ? 'true' : 'false',
      });
      return;
    }

    if (msg.type === 'signal') {
      const session = sessions.get(msg.sessionId);
      if (!session || !session.hostApproved) return;
      const toHost = msg.to === 'host';
      const targetPeer = peers.get(toHost ? session.hostId : session.controllerId);
      if (targetPeer) {
        send(targetPeer.ws, { type: 'signal', data: msg.data });
      }
      return;
    }

    if (msg.type === 'remote_input_event') {
      const session = sessions.get(msg.sessionId);
      if (!session || !session.hostApproved || session.controllerId !== peerId) return;
      const host = peers.get(session.hostId);
      if (host) {
        send(host.ws, { type: 'remote_input_event', event: msg.event });
      }
      return;
    }

    if (msg.type === 'disconnect_session') {
      const session = sessions.get(msg.sessionId);
      if (!session) return;
      const host = peers.get(session.hostId);
      const controller = peers.get(session.controllerId);
      if (host) send(host.ws, { type: 'session_ended' });
      if (controller) send(controller.ws, { type: 'session_ended' });
      sessions.delete(session.sessionId);
      return;
    }
  });

  ws.on('close', () => {
    const peer = peers.get(peerId);
    if (!peer) return;
    if (peer.sessionId && sessions.has(peer.sessionId)) {
      const session = sessions.get(peer.sessionId);
      const otherId = session.hostId === peerId ? session.controllerId : session.hostId;
      const other = peers.get(otherId);
      if (other) send(other.ws, { type: 'session_ended' });
      sessions.delete(peer.sessionId);
    }
    peers.delete(peerId);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Secure remote assist server running at https://${HOST}:${PORT}`);
});
