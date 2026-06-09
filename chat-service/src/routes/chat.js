const express = require("express");
const Message = require("../models/Message");
const Room = require("../models/Room");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// ─── Utilitário: gera roomId estável para conversas 1:1 ──────────────────────
function privateRoomId(idA, idB) {
  return [idA, idB].sort().join("_");
}

// ─── Histórico de mensagens de uma conversa privada ──────────────────────────
// GET /messages/private/:targetUserId?limit=50&before=<ISO>
router.get("/messages/private/:targetUserId", authMiddleware, async (req, res) => {
  const roomId = privateRoomId(req.user.id, req.params.targetUserId);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const filter = { roomId };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  try {
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar mensagens." });
  }
});

// ─── Histórico de mensagens de uma sala de grupo ─────────────────────────────
// GET /messages/room/:roomId?limit=50&before=<ISO>
router.get("/messages/room/:roomId", authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const filter = { roomId: req.params.roomId };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };

  try {
    // Verifica se o usuário é membro
    const room = await Room.findById(req.params.roomId).lean();
    if (!room) return res.status(404).json({ error: "Sala não encontrada." });
    if (!room.members.includes(req.user.id)) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar mensagens." });
  }
});

// ─── Salas de grupo ───────────────────────────────────────────────────────────

// POST /rooms — cria uma sala de grupo
router.post("/rooms", authMiddleware, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: "name é obrigatório." });

  const members = Array.from(new Set([req.user.id, ...(memberIds || [])]));
  try {
    const room = await Room.create({ name, createdBy: req.user.id, members });
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar sala." });
  }
});

// GET /rooms — lista salas do usuário autenticado
router.get("/rooms", authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user.id }).lean();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar salas." });
  }
});

// GET /rooms/:roomId — detalhes de uma sala
router.get("/rooms/:roomId", authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId).lean();
    if (!room) return res.status(404).json({ error: "Sala não encontrada." });
    if (!room.members.includes(req.user.id)) {
      return res.status(403).json({ error: "Acesso negado." });
    }
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar sala." });
  }
});

module.exports = router;
module.exports.privateRoomId = privateRoomId;
