const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getModels } = require("../models");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email e password são obrigatórios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });
  }

  try {
    const { User } = getModels();
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password_hash });

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Username ou e-mail já em uso." });
    }
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({ error: err.errors[0].message });
    }
    console.error("register error:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// POST /login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email e password são obrigatórios." });
  }

  try {
    const { User } = getModels();
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// GET /validate  — usado internamente pelo Chat Service
router.get("/validate", authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// GET /me — retorna dados do usuário autenticado
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "username", "email", "created_at"],
    });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    return res.json(user);
  } catch (err) {
    console.error("me error:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// GET /users — lista todos os usuários (para montar lista de conversas)
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const users = await User.findAll({
      attributes: ["id", "username", "email"],
      order: [["username", "ASC"]],
    });
    return res.json(users);
  } catch (err) {
    console.error("users error:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

module.exports = router;
