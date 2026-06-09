const { WebSocketServer } = require("ws");
const { verifyToken } = require("../middleware/auth");
const Message = require("../models/Message");

// Map: userId -> Set<WebSocket>  (um user pode ter múltiplas abas)
const clients = new Map();

function buildWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Token enviado como query param: /ws?token=<jwt>
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get("token");

    let user;
    try {
      user = verifyToken(token);
    } catch {
      ws.close(1008, "Token inválido.");
      return;
    }

    // Registra conexão
    if (!clients.has(user.id)) clients.set(user.id, new Set());
    clients.get(user.id).add(ws);
    console.log(`[WS] Conectado: ${user.username} (${user.id})`);

    ws.on("message", async (rawData) => {
      let msg;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "JSON inválido." }));
        return;
      }

      if (msg.type === "private_message") {
        await handlePrivateMessage(ws, user, msg);
      } else if (msg.type === "group_message") {
        await handleGroupMessage(ws, user, msg);
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    });

    ws.on("close", () => {
      clients.get(user.id)?.delete(ws);
      if (clients.get(user.id)?.size === 0) clients.delete(user.id);
      console.log(`[WS] Desconectado: ${user.username}`);
    });

    ws.on("error", (err) => console.error("[WS] Erro:", err.message));

    ws.send(JSON.stringify({ type: "connected", userId: user.id, username: user.username }));
  });

  return wss;
}

// ─── Mensagem privada (1:1) ───────────────────────────────────────────────────
async function handlePrivateMessage(ws, sender, msg) {
  const { targetUserId, content } = msg;
  if (!targetUserId || !content?.trim()) {
    ws.send(JSON.stringify({ type: "error", error: "targetUserId e content são obrigatórios." }));
    return;
  }

  const roomId = [sender.id, targetUserId].sort().join("_");
  let saved;
  try {
    saved = await Message.create({
      roomId,
      senderId: sender.id,
      senderUsername: sender.username,
      type: "private",
      content: content.trim(),
    });
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", error: "Erro ao salvar mensagem." }));
    return;
  }

  const payload = JSON.stringify({
    type: "new_message",
    message: {
      _id: saved._id,
      roomId,
      senderId: sender.id,
      senderUsername: sender.username,
      type: "private",
      content: saved.content,
      createdAt: saved.createdAt,
    },
  });

  // Entrega ao destinatário
  deliverTo(targetUserId, payload);
  // Ecoa de volta ao remetente (em outras abas abertas)
  deliverTo(sender.id, payload);
}

// ─── Mensagem de grupo (1:N) ──────────────────────────────────────────────────
async function handleGroupMessage(ws, sender, msg) {
  const { roomId, content } = msg;
  if (!roomId || !content?.trim()) {
    ws.send(JSON.stringify({ type: "error", error: "roomId e content são obrigatórios." }));
    return;
  }

  // Importação tardia para evitar circular dependency
  const Room = require("../models/Room");
  let room;
  try {
    room = await Room.findById(roomId).lean();
  } catch {
    ws.send(JSON.stringify({ type: "error", error: "Sala inválida." }));
    return;
  }
  if (!room || !room.members.includes(sender.id)) {
    ws.send(JSON.stringify({ type: "error", error: "Sala não encontrada ou acesso negado." }));
    return;
  }

  let saved;
  try {
    saved = await Message.create({
      roomId,
      senderId: sender.id,
      senderUsername: sender.username,
      type: "group",
      content: content.trim(),
    });
  } catch {
    ws.send(JSON.stringify({ type: "error", error: "Erro ao salvar mensagem." }));
    return;
  }

  const payload = JSON.stringify({
    type: "new_message",
    message: {
      _id: saved._id,
      roomId,
      senderId: sender.id,
      senderUsername: sender.username,
      type: "group",
      content: saved.content,
      createdAt: saved.createdAt,
    },
  });

  room.members.forEach((memberId) => deliverTo(memberId, payload));
}

// ─── Entrega mensagem a todos os sockets de um usuário ───────────────────────
function deliverTo(userId, payload) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  sockets.forEach((sock) => {
    if (sock.readyState === 1 /* OPEN */) sock.send(payload);
  });
}

module.exports = { buildWsServer };
