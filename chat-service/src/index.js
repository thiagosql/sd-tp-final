require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const chatRoutes = require("./routes/chat");
const { buildWsServer } = require("./websocket");

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use("/", chatRoutes);
app.get("/health", (_, res) => res.json({ status: "ok", service: "chat-service" }));

const server = http.createServer(app);
buildWsServer(server);

async function start() {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Conectado ao MongoDB.");

  server.listen(PORT, () => {
    console.log(`Chat Service rodando na porta ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Falha ao iniciar chat-service:", err);
  process.exit(1);
});

module.exports = { app, server };
