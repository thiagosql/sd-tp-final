/* ─── Configuração de endpoints ─────────────────────────────────────────── */
const AUTH_API = "/api/auth";
const CHAT_API = "/api/chat";
const WS_URL   = `ws://${location.host}/ws`;

/* ─── Estado global ─────────────────────────────────────────────────────── */
let token = localStorage.getItem("chatsd_token") || null;
let currentUser = null;
let ws = null;
let wsReconnectTimer = null;

// Conversa ativa: { type: "private"|"group", id, name }
let activeConv = null;

// Cache: lista de todos os usuários
let allUsers = [];

/* ─── Inicialização ─────────────────────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", async () => {
  if (token) {
    try {
      await loadCurrentUser();
      showChatScreen();
    } catch {
      token = null;
      localStorage.removeItem("chatsd_token");
    }
  }
});

/* ─── Auth ──────────────────────────────────────────────────────────────── */
function showTab(tab) {
  document.getElementById("form-login").hidden   = tab !== "login";
  document.getElementById("form-register").hidden = tab !== "register";
  document.getElementById("tab-login").classList.toggle("active",    tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.hidden = false;
}

function hideAuthError() {
  document.getElementById("auth-error").hidden = true;
}

async function doLogin() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) return showAuthError("Preencha todos os campos.");

  try {
    const res = await fetch(`${AUTH_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || "Erro ao fazer login.");

    token = data.token;
    localStorage.setItem("chatsd_token", token);
    currentUser = data.user;
    showChatScreen();
  } catch {
    showAuthError("Não foi possível conectar ao servidor.");
  }
}

async function doRegister() {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  if (!username || !email || !password) return showAuthError("Preencha todos os campos.");

  try {
    const res = await fetch(`${AUTH_API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || "Erro ao criar conta.");

    // Faz login automático após cadastro
    document.getElementById("login-email").value = email;
    document.getElementById("login-password").value = password;
    showTab("login");
    await doLogin();
  } catch {
    showAuthError("Não foi possível conectar ao servidor.");
  }
}

function doLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("chatsd_token");
  if (ws) ws.close();
  document.getElementById("chat-screen").hidden = true;
  document.getElementById("auth-screen").hidden = false;
}

/* ─── Tela de chat ──────────────────────────────────────────────────────── */
async function loadCurrentUser() {
  const res = await apiFetch(`${AUTH_API}/me`);
  currentUser = await res.json();
}

async function showChatScreen() {
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("chat-screen").hidden = false;
  document.getElementById("sidebar-username").textContent = `👤 ${currentUser.username}`;

  await refreshUserList();
  await refreshRoomList();
  connectWebSocket();
}

/* ─── Lista de usuários ─────────────────────────────────────────────────── */
async function refreshUserList() {
  const res = await apiFetch(`${AUTH_API}/users`);
  allUsers = await res.json();
  renderUserList(allUsers.filter(u => u.id !== currentUser.id));
}

function renderUserList(users) {
  const ul = document.getElementById("user-list");
  ul.innerHTML = "";
  users.forEach(u => {
    const li = document.createElement("li");
    li.className = "conv-item";
    li.dataset.userId = u.id;
    li.innerHTML = `
      <div class="conv-avatar">${u.username[0].toUpperCase()}</div>
      <span class="conv-name">${escHtml(u.username)}</span>
    `;
    li.addEventListener("click", () => openPrivateChat(u));
    if (activeConv?.type === "private" && activeConv.id === u.id) li.classList.add("active");
    ul.appendChild(li);
  });
}

function filterUsers() {
  const q = document.getElementById("user-search").value.toLowerCase();
  const filtered = allUsers.filter(u => u.id !== currentUser.id && u.username.toLowerCase().includes(q));
  renderUserList(filtered);
}

/* ─── Lista de salas de grupo ───────────────────────────────────────────── */
async function refreshRoomList() {
  const res = await apiFetch(`${CHAT_API}/rooms`);
  const rooms = await res.json();
  const ul = document.getElementById("room-list");
  ul.innerHTML = "";
  rooms.forEach(r => {
    const li = document.createElement("li");
    li.className = "conv-item";
    li.innerHTML = `
      <div class="conv-avatar" style="background:#4caf7d;">#</div>
      <span class="conv-name">${escHtml(r.name)}</span>
    `;
    li.addEventListener("click", () => openGroupChat(r));
    if (activeConv?.type === "group" && activeConv.id === r._id) li.classList.add("active");
    ul.appendChild(li);
  });
}

/* ─── Abrir conversa ────────────────────────────────────────────────────── */
async function openPrivateChat(user) {
  activeConv = { type: "private", id: user.id, name: user.username };
  document.getElementById("chat-title").textContent = `💬 ${user.username}`;
  setActiveConvItem("user", user.id);
  showChatArea();

  const res = await apiFetch(`${CHAT_API}/messages/private/${user.id}`);
  const msgs = await res.json();
  renderMessages(msgs);
}

async function openGroupChat(room) {
  activeConv = { type: "group", id: room._id, name: room.name };
  document.getElementById("chat-title").textContent = `# ${room.name}`;
  setActiveConvItem("room", room._id);
  showChatArea();

  const res = await apiFetch(`${CHAT_API}/messages/room/${room._id}`);
  const msgs = await res.json();
  renderMessages(msgs);
}

function showChatArea() {
  document.getElementById("chat-placeholder").hidden = true;
  document.getElementById("chat-area").hidden = false;
  document.getElementById("messages").innerHTML = "";
}

function setActiveConvItem(type, id) {
  document.querySelectorAll(".conv-item.active").forEach(el => el.classList.remove("active"));
  const selector = type === "user"
    ? `[data-user-id="${id}"]`
    : `[data-room-id="${id}"]`;
  // Fallback: marca pelo onclick — simplesmente procuramos o item ativo por texto
  // já que data-attrs são setados logo abaixo para items de sala
}

/* ─── Renderização de mensagens ─────────────────────────────────────────── */
function renderMessages(msgs) {
  const area = document.getElementById("messages");
  area.innerHTML = "";
  msgs.forEach(m => appendMessage(m, false));
  area.scrollTop = area.scrollHeight;
}

function appendMessage(msg, scroll = true) {
  const area = document.getElementById("messages");
  const isSelf = msg.senderId === currentUser.id;

  const div = document.createElement("div");
  div.className = `msg-bubble ${isSelf ? "self" : "other"}`;

  const time = new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `
    ${!isSelf ? `<div class="msg-meta">${escHtml(msg.senderUsername)}</div>` : ""}
    <div>${escHtml(msg.content)}</div>
    <div class="msg-meta" style="text-align:right;margin-top:4px;">${time}</div>
  `;

  area.appendChild(div);
  if (scroll) area.scrollTop = area.scrollHeight;
}

/* ─── Enviar mensagem ───────────────────────────────────────────────────── */
function sendMessage() {
  if (!activeConv || !ws || ws.readyState !== WebSocket.OPEN) return;

  const input = document.getElementById("msg-input");
  const content = input.value.trim();
  if (!content) return;

  let payload;
  if (activeConv.type === "private") {
    payload = { type: "private_message", targetUserId: activeConv.id, content };
  } else {
    payload = { type: "group_message", roomId: activeConv.id, content };
  }

  ws.send(JSON.stringify(payload));
  input.value = "";
  input.style.height = "auto";
}

function handleMsgKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/* ─── WebSocket ─────────────────────────────────────────────────────────── */
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`${WS_URL}?token=${token}`);

  ws.addEventListener("open", () => {
    setWsStatus(true);
    clearTimeout(wsReconnectTimer);
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "new_message") {
      const m = msg.message;
      // Só exibe se for da conversa ativa
      if (activeConv) {
        if (activeConv.type === "private") {
          const roomId = [currentUser.id, activeConv.id].sort().join("_");
          if (m.roomId === roomId) appendMessage(m);
        } else if (activeConv.type === "group" && m.roomId === activeConv.id) {
          appendMessage(m);
        }
      }
    }
  });

  ws.addEventListener("close", () => {
    setWsStatus(false);
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  });

  ws.addEventListener("error", () => ws.close());
}

function setWsStatus(online) {
  const badge = document.getElementById("ws-status");
  if (!badge) return;
  badge.className = `ws-badge ${online ? "online" : "offline"}`;
  badge.title = online ? "Conectado" : "Reconectando…";
}

/* ─── Modal novo grupo ──────────────────────────────────────────────────── */
function openNewGroupModal() {
  document.getElementById("group-name").value = "";
  document.getElementById("group-error").hidden = true;

  const ul = document.getElementById("member-select-list");
  ul.innerHTML = "";
  allUsers.filter(u => u.id !== currentUser.id).forEach(u => {
    const li = document.createElement("li");
    li.className = "member-item";
    li.innerHTML = `
      <input type="checkbox" id="m_${u.id}" value="${u.id}" />
      <label for="m_${u.id}">${escHtml(u.username)}</label>
    `;
    ul.appendChild(li);
  });

  document.getElementById("modal-group").hidden = false;
}

function closeNewGroupModal() {
  document.getElementById("modal-group").hidden = true;
}

async function createGroup() {
  const name = document.getElementById("group-name").value.trim();
  if (!name) {
    showGroupError("Informe o nome do grupo.");
    return;
  }

  const memberIds = [...document.querySelectorAll("#member-select-list input:checked")]
    .map(el => el.value);

  try {
    const res = await apiFetch(`${CHAT_API}/rooms`, {
      method: "POST",
      body: JSON.stringify({ name, memberIds }),
    });
    const data = await res.json();
    if (!res.ok) return showGroupError(data.error || "Erro ao criar grupo.");

    closeNewGroupModal();
    await refreshRoomList();
    openGroupChat(data);
  } catch {
    showGroupError("Erro ao conectar.");
  }
}

function showGroupError(msg) {
  const el = document.getElementById("group-error");
  el.textContent = msg;
  el.hidden = false;
}

/* ─── Utilitários ───────────────────────────────────────────────────────── */
function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
