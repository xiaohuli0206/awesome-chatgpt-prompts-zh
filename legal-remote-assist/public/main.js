const ws = new WebSocket(`wss://${location.host}`);
let myPeerId = null;
let currentSessionId = null;
let pendingSessionId = null;
let role = null;
let pc = null;
let hostStream = null;

const pairCodeEl = document.getElementById('pairCode');
const approvalBannerEl = document.getElementById('approvalBanner');
const localLogEl = document.getElementById('localLog');
const inputFeedEl = document.getElementById('inputFeed');
const remoteViewEl = document.getElementById('remoteView');
const hostPreviewEl = document.getElementById('hostPreview');
const ctrlStatusEl = document.getElementById('ctrlStatus');

const btnHostStart = document.getElementById('btnHostStart');
const btnApprove = document.getElementById('btnApprove');
const btnReject = document.getElementById('btnReject');
const btnHostShare = document.getElementById('btnHostShare');
const btnJoin = document.getElementById('btnJoin');
const btnHostDisconnect = document.getElementById('btnHostDisconnect');
const btnCtrlDisconnect = document.getElementById('btnCtrlDisconnect');

const hostDeviceEl = document.getElementById('hostDevice');
const ctrlDeviceEl = document.getElementById('ctrlDevice');
const pairInputEl = document.getElementById('pairInput');

function log(msg) {
  localLogEl.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  localLogEl.scrollTop = localLogEl.scrollHeight;
}

function send(payload) {
  ws.send(JSON.stringify(payload));
}

function createPeerConnection(forHost) {
  pc = new RTCPeerConnection();
  pc.onicecandidate = (e) => {
    if (e.candidate && currentSessionId) {
      send({ type: 'signal', sessionId: currentSessionId, to: forHost ? 'controller' : 'host', data: { candidate: e.candidate } });
    }
  };

  if (!forHost) {
    pc.ontrack = (e) => {
      remoteViewEl.srcObject = e.streams[0];
    };
  }
}

async function hostStartShare() {
  hostStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  hostPreviewEl.srcObject = hostStream;

  createPeerConnection(true);
  hostStream.getTracks().forEach((t) => pc.addTrack(t, hostStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ type: 'signal', sessionId: currentSessionId, to: 'controller', data: { sdp: pc.localDescription } });
  log('已开始共享屏幕。');
}

async function controllerJoinFlow() {
  createPeerConnection(false);
  ctrlStatusEl.textContent = '状态：等待被控端授权';
  send({
    type: 'join_request',
    pairCode: pairInputEl.value.trim(),
    deviceName: ctrlDeviceEl.value.trim() || 'controller',
  });
}

btnHostStart.onclick = () => {
  role = 'host';
  send({ type: 'register_host', deviceName: hostDeviceEl.value.trim() || 'host' });
};

btnApprove.onclick = () => {
  send({ type: 'host_approval', sessionId: pendingSessionId, allow: true });
  currentSessionId = pendingSessionId;
  btnHostShare.disabled = false;
  btnHostDisconnect.disabled = false;
  btnApprove.disabled = true;
  btnReject.disabled = true;
  approvalBannerEl.textContent = '你已允许本次连接。';
};

btnReject.onclick = () => {
  send({ type: 'host_approval', sessionId: pendingSessionId, allow: false });
  btnApprove.disabled = true;
  btnReject.disabled = true;
  approvalBannerEl.textContent = '你已拒绝本次连接。';
};

btnHostShare.onclick = async () => {
  try {
    await hostStartShare();
  } catch (e) {
    log(`共享失败: ${e.message}`);
  }
};

btnJoin.onclick = controllerJoinFlow;

btnHostDisconnect.onclick = () => {
  if (currentSessionId) send({ type: 'disconnect_session', sessionId: currentSessionId });
};

btnCtrlDisconnect.onclick = () => {
  if (currentSessionId) send({ type: 'disconnect_session', sessionId: currentSessionId });
};

remoteViewEl.addEventListener('mousemove', (e) => {
  if (!currentSessionId || role !== 'controller') return;
  send({ type: 'remote_input_event', sessionId: currentSessionId, event: { type: 'mousemove', x: e.offsetX, y: e.offsetY } });
});
remoteViewEl.addEventListener('click', (e) => {
  if (!currentSessionId || role !== 'controller') return;
  send({ type: 'remote_input_event', sessionId: currentSessionId, event: { type: 'click', x: e.offsetX, y: e.offsetY, button: e.button } });
});
window.addEventListener('keydown', (e) => {
  if (!currentSessionId || role !== 'controller') return;
  send({ type: 'remote_input_event', sessionId: currentSessionId, event: { type: 'keydown', key: e.key } });
});

ws.onmessage = async (evt) => {
  const msg = JSON.parse(evt.data);

  if (msg.type === 'welcome') {
    myPeerId = msg.peerId;
    log(`连接到安全信令服务，PeerId=${myPeerId}`);
  }

  if (msg.type === 'host_registered') {
    pairCodeEl.textContent = msg.pairCode;
    currentSessionId = msg.sessionId;
    btnHostDisconnect.disabled = false;
    log('被控端已启动，请把配对码发给控制端。');
  }

  if (msg.type === 'approval_needed') {
    pendingSessionId = msg.sessionId;
    approvalBannerEl.textContent = `来自 ${msg.controllerDevice} (${msg.controllerIp}) 的连接请求`;
    btnApprove.disabled = false;
    btnReject.disabled = false;
    log('收到连接申请，等待你点击允许/拒绝。');
  }

  if (msg.type === 'join_result') {
    if (!msg.ok) {
      ctrlStatusEl.textContent = `状态：连接失败（${msg.reason || '被拒绝'}）`;
      log('控制端连接失败。');
      return;
    }
    currentSessionId = msg.sessionId;
    role = 'controller';
    ctrlStatusEl.textContent = '状态：已授权，等待被控端开始共享屏幕';
    btnCtrlDisconnect.disabled = false;
    log('控制端连接成功。');
  }

  if (msg.type === 'signal') {
    const data = msg.data;
    if (data.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: 'signal', sessionId: currentSessionId, to: 'host', data: { sdp: pc.localDescription } });
      }
    }
    if (data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  if (msg.type === 'remote_input_event') {
    inputFeedEl.textContent += `${JSON.stringify(msg.event)}\n`;
    inputFeedEl.scrollTop = inputFeedEl.scrollHeight;
  }

  if (msg.type === 'session_ended') {
    ctrlStatusEl.textContent = '状态：会话已断开';
    approvalBannerEl.textContent = '会话已断开';
    btnCtrlDisconnect.disabled = true;
    btnHostDisconnect.disabled = true;
    btnHostShare.disabled = true;
    currentSessionId = null;
    if (pc) pc.close();
    pc = null;
    if (hostStream) {
      hostStream.getTracks().forEach((t) => t.stop());
      hostStream = null;
    }
    remoteViewEl.srcObject = null;
    hostPreviewEl.srcObject = null;
    log('会话已结束。');
  }

  if (msg.type === 'error') {
    log(`错误: ${msg.message}`);
  }
};
