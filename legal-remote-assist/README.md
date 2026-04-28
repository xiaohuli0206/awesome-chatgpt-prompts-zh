# 合法授权远程协助程序（Node.js / WSS）

> ⚠️ 本项目是**合法授权演示**，强调“可见、可控、可断开、可审计”。
> 
> 为避免被滥用为木马/RAT，本演示**不实现系统级静默输入注入**（不会控制操作系统鼠标键盘），仅在浏览器内展示远程输入事件，供你接入你自己的合规驱动层。

---

## 1) 项目架构

```text
legal-remote-assist/
├─ package.json
├─ .env.example
├─ certs/                 # 你自行放置 TLS 证书
├─ logs/
│  └─ connections.log     # 连接日志（时间/IP/设备/成功与否）
├─ server/
│  └─ index.js            # HTTPS + WSS 信令服务 + 授权与配对逻辑
└─ public/
   ├─ index.html          # Host/Controller 双界面
   ├─ main.js             # WebSocket 协议、WebRTC 屏幕流、会话授权
   └─ styles.css
```

### 数据流（安全优先）
1. 被控端主动打开网页并点击“启动被控端”。
2. 服务端生成一次性 6 位配对码。
3. 控制端输入配对码发起连接。
4. 被控端界面弹出请求，**必须手动点击“允许连接”**。
5. 允许后，被控端手动点击“开始共享屏幕”（浏览器会再次弹窗授权）。
6. 屏幕画面通过 WebRTC 传输，信令走 WSS。
7. 任意一方点击“断开会话”可立即中止。
8. 服务端写入连接日志。

---

## 2) 功能覆盖说明

- ✅ 被控端必须主动启动并显示窗口。
- ✅ 每次连接需被控端手动允许。
- ✅ 一次性配对码。
- ✅ 远程查看屏幕（WebRTC）。
- ⚠️ 鼠标/键盘事件：当前仅在 Host 页面展示事件日志，**默认不做系统注入**。
- ✅ 断开连接按钮。
- ✅ 连接日志（时间、IP、设备名、成功/失败）。
- ✅ TLS / WSS。
- ✅ 默认局域网连接，公网需改 `ALLOW_PUBLIC=true`。
- ✅ 不保存密码、不自动重连、不隐藏后台运行。

---

## 3) 安装与运行

### 3.1 安装依赖

```bash
cd legal-remote-assist
npm install
```

### 3.2 生成本地 TLS 证书（开发环境）

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout certs/server.key -out certs/server.crt \
  -subj "/CN=localhost"
```

### 3.3 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

默认配置：
- `HOST=0.0.0.0`
- `PORT=8443`
- `ALLOW_PUBLIC=false`

### 3.4 启动

```bash
npm start
```

浏览器访问：

```text
https://<你的局域网IP>:8443
```


### 3.5 桌面双击启动（Linux）

已提供桌面启动文件：
- `desktop/LegalRemoteAssist.desktop`
- `start-local.sh`

使用方式：

```bash
cd legal-remote-assist
chmod +x start-local.sh install-desktop-entry.sh
./install-desktop-entry.sh
```

之后可从桌面双击 `LegalRemoteAssist.desktop` 启动：
- 自动检查依赖（缺失时执行 `npm install`）
- 自动生成本地开发证书（缺失时）
- 自动打开浏览器到 `https://127.0.0.1:8443`

---

## 4) 安全说明

1. 本程序不提供隐藏运行、静默安装、持久化、提权、绕杀软、键盘记录。
2. 会话必须双重显式授权（连接授权 + 屏幕共享授权）。
3. 默认拒绝公网来源（非私网 IP 自动拒绝）。
4. 不保存账号密码；会话结束后状态即失效。
5. 推荐在生产环境使用有效 CA 证书、访问控制、反向代理限流和审计归档。

---

## 5) 合规扩展建议（如你确需“系统级输入控制”）

若你在**自有设备**做受控测试，可在 Host 本机加“输入适配器插件”，并同时满足：
- 每次会话内二次确认；
- 明显前台提示“远程控制中”；
- 会话 token 失效即不可输入；
- 全量审计鼠标/键盘动作；
- 物理热键一键断开。

