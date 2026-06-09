/**
 * Teste de Concorrência/Carga
 * Simula N usuários (padrão: 12) fazendo login e trocando mensagens via WebSocket
 * simultaneamente, verificando escalabilidade horizontal.
 *
 * Pré-requisito: docker compose up --scale chat-service=3
 * Executar com: node tests/load/load-test.js [num_usuarios]
 */

const WebSocket = require("ws");

const BASE_AUTH = "http://localhost/api/auth";
const NUM_USERS = parseInt(process.argv[2]) || 12;
const MESSAGES_PER_USER = 5;
const WS_URL = "ws://localhost/ws";

// ─── Utilitários ─────────────────────────────────────────────────────────────
async function httpPost(url, body, token) {
  const { default: fetch } = await import("node-fetch");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Métricas ─────────────────────────────────────────────────────────────────
const metrics = {
  registros: { sucesso: 0, falha: 0 },
  logins: { sucesso: 0, falha: 0 },
  conexoesWs: { sucesso: 0, falha: 0 },
  mensagensEnviadas: 0,
  mensagensRecebidas: 0,
  latencias: [],
};

// ─── Simula um usuário ────────────────────────────────────────────────────────
async function simulateUser(index) {
  const ts = Date.now();
  const email = `loaduser${index}_${ts}@test.com`;
  const username = `loaduser${index}_${ts}`;
  const password = "teste123";

  // 1. Registro
  let token;
  try {
    const regData = await httpPost(`${BASE_AUTH}/register`, { username, email, password });
    if (!regData.id) throw new Error("registro falhou");
    metrics.registros.sucesso++;
  } catch (err) {
    metrics.registros.falha++;
    console.error(`  [User ${index}] Registro falhou: ${err.message}`);
    return;
  }

  // 2. Login
  try {
    const loginData = await httpPost(`${BASE_AUTH}/login`, { email, password });
    if (!loginData.token) throw new Error("login falhou");
    token = loginData.token;
    metrics.logins.sucesso++;
  } catch (err) {
    metrics.logins.falha++;
    console.error(`  [User ${index}] Login falhou: ${err.message}`);
    return;
  }

  // 3. Conexão WebSocket
  await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    let connected = false;
    let msgRecv = 0;

    ws.on("open", () => {
      connected = true;
      metrics.conexoesWs.sucesso++;
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "new_message") {
          metrics.mensagensRecebidas++;
          msgRecv++;
        }
      } catch {}
    });

    ws.on("error", (err) => {
      if (!connected) {
        metrics.conexoesWs.falha++;
        console.error(`  [User ${index}] WS erro: ${err.message}`);
        resolve();
      }
    });

    ws.on("close", () => resolve());

    ws.on("open", async () => {
      await sleep(Math.random() * 500); // escalonar envios

      // 4. Envia mensagens para o "usuário 0" (broadcast de carga)
      for (let m = 0; m < MESSAGES_PER_USER; m++) {
        const t0 = Date.now();
        ws.send(
          JSON.stringify({
            type: "private_message",
            targetUserId: `broadcast-target-${index % 3}`, // qualquer id (pode não ter receptor ativo)
            content: `Mensagem ${m + 1} do usuário ${index} — timestamp ${Date.now()}`,
          })
        );
        metrics.mensagensEnviadas++;
        metrics.latencias.push(Date.now() - t0);
        await sleep(200);
      }

      await sleep(1000); // aguarda mensagens chegarem
      ws.close();
    });
  });
}

// ─── Runner principal ─────────────────────────────────────────────────────────
(async () => {
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║  Teste de Carga — Chat Distribuído CEFET-MG       ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`\n Usuários simultâneos : ${NUM_USERS}`);
  console.log(` Mensagens por usuário: ${MESSAGES_PER_USER}`);
  console.log(` Total esperado        : ${NUM_USERS * MESSAGES_PER_USER} mensagens\n`);

  const startTime = Date.now();

  // Dispara todos os usuários em paralelo
  await Promise.all(
    Array.from({ length: NUM_USERS }, (_, i) => simulateUser(i))
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  const latencias = metrics.latencias;
  const avgLat = latencias.length
    ? (latencias.reduce((a, b) => a + b, 0) / latencias.length).toFixed(1)
    : "n/a";
  const maxLat = latencias.length ? Math.max(...latencias) : "n/a";

  console.log("═══════════════════════════════════════════════════");
  console.log(" RESULTADOS");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Registros      : ${metrics.registros.sucesso} ok / ${metrics.registros.falha} falha`);
  console.log(`  Logins         : ${metrics.logins.sucesso} ok / ${metrics.logins.falha} falha`);
  console.log(`  Conexões WS    : ${metrics.conexoesWs.sucesso} ok / ${metrics.conexoesWs.falha} falha`);
  console.log(`  Msgs enviadas  : ${metrics.mensagensEnviadas}`);
  console.log(`  Msgs recebidas : ${metrics.mensagensRecebidas}`);
  console.log(`  Latência média : ${avgLat} ms`);
  console.log(`  Latência máx.  : ${maxLat} ms`);
  console.log(`  Tempo total    : ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════");

  const allOk =
    metrics.registros.falha === 0 &&
    metrics.logins.falha === 0 &&
    metrics.conexoesWs.sucesso === NUM_USERS;

  console.log(`\n ${allOk ? "✅ Todos os usuários conectaram com sucesso." : "⚠️  Houve falhas — verifique o output acima."}\n`);
  process.exit(allOk ? 0 : 1);
})();
