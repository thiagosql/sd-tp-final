require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getModels } = require("./models");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rotas
app.use("/", authRoutes);

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", service: "auth-service" }));

// Inicializa banco e sobe servidor
async function start() {
  const { sequelize } = getModels();
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log("Conectado ao PostgreSQL.");

  app.listen(PORT, () => {
    console.log(`Auth Service rodando na porta ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Falha ao iniciar auth-service:", err);
  process.exit(1);
});

module.exports = app; // exportado para testes
