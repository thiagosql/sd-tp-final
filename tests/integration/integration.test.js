/**
 * Testes de Integração
 * Verificam o fluxo completo: registrar → logar → criar sala → buscar histórico.
 * Requerem os serviços rodando (via docker compose up) em localhost.
 *
 * Executar com: node tests/integration/integration.test.js
 * (ou jest se o ambiente tiver os serviços disponíveis)
 */

const BASE_AUTH = "http://localhost/api/auth";
const BASE_CHAT = "http://localhost/api/chat";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function post(url, body, token) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, data: await res.json() };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`  ✓ ${message}`);
}

// ─── Dados de teste ───────────────────────────────────────────────────────────
const userA = {
  username: `user_a_${Date.now()}`,
  email: `usera_${Date.now()}@test.com`,
  password: "senha123",
};
const userB = {
  username: `user_b_${Date.now()}`,
  email: `userb_${Date.now()}@test.com`,
  password: "senha123",
};
let tokenA, tokenB, userAId, userBId;

// ─── Casos de teste ───────────────────────────────────────────────────────────
const tests = [
  {
    name: "TC-INT-01: Registrar usuário A",
    async run() {
      const { status, data } = await post(`${BASE_AUTH}/register`, userA);
      assert(status === 201, `status 201, recebeu ${status}`);
      assert(data.id, "retorna id do usuário");
      userAId = data.id;
    },
  },
  {
    name: "TC-INT-02: Registrar usuário B",
    async run() {
      const { status, data } = await post(`${BASE_AUTH}/register`, userB);
      assert(status === 201, `status 201, recebeu ${status}`);
      userBId = data.id;
    },
  },
  {
    name: "TC-INT-03: Login do usuário A gera token JWT válido",
    async run() {
      const { status, data } = await post(`${BASE_AUTH}/login`, {
        email: userA.email,
        password: userA.password,
      });
      assert(status === 200, `status 200, recebeu ${status}`);
      assert(typeof data.token === "string", "token é string");
      assert(data.token.split(".").length === 3, "token tem 3 partes (JWT)");
      tokenA = data.token;
    },
  },
  {
    name: "TC-INT-04: Login do usuário B gera token JWT válido",
    async run() {
      const { status, data } = await post(`${BASE_AUTH}/login`, {
        email: userB.email,
        password: userB.password,
      });
      assert(status === 200, `status 200, recebeu ${status}`);
      tokenB = data.token;
    },
  },
  {
    name: "TC-INT-05: Endpoint /validate aceita token válido",
    async run() {
      const { status, data } = await get(`${BASE_AUTH}/validate`, tokenA);
      assert(status === 200, `status 200, recebeu ${status}`);
      assert(data.valid === true, "valid === true");
    },
  },
  {
    name: "TC-INT-06: Endpoint /validate rejeita token inválido",
    async run() {
      const { status } = await get(`${BASE_AUTH}/validate`, "token.invalido.aqui");
      assert(status === 401, `status 401, recebeu ${status}`);
    },
  },
  {
    name: "TC-INT-07: Listar usuários autenticado retorna 200",
    async run() {
      const { status, data } = await get(`${BASE_AUTH}/users`, tokenA);
      assert(status === 200, `status 200, recebeu ${status}`);
      assert(Array.isArray(data), "retorna array");
      assert(data.length >= 2, "ao menos 2 usuários cadastrados");
    },
  },
  {
    name: "TC-INT-08: Histórico de mensagens privadas retorna 200 (lista vazia inicial)",
    async run() {
      const { status, data } = await get(
        `${BASE_CHAT}/messages/private/${userBId}`,
        tokenA
      );
      assert(status === 200, `status 200, recebeu ${status}`);
      assert(Array.isArray(data), "retorna array");
    },
  },
  {
    name: "TC-INT-09: Criar sala de grupo com usuário B como membro",
    async run() {
      const { status, data } = await post(
        `${BASE_CHAT}/rooms`,
        { name: `Sala Teste ${Date.now()}`, memberIds: [userBId] },
        tokenA
      );
      assert(status === 201, `status 201, recebeu ${status}`);
      assert(data._id, "sala tem _id");
      assert(data.members.includes(userAId), "criador está nos membros");
      assert(data.members.includes(userBId), "usuário B está nos membros");
      this._roomId = data._id;
    },
  },
  {
    name: "TC-INT-10: Listar salas do usuário A inclui sala criada",
    async run() {
      const { status, data } = await get(`${BASE_CHAT}/rooms`, tokenA);
      assert(status === 200, `status 200, recebeu ${status}`);
      assert(Array.isArray(data) && data.length >= 1, "ao menos 1 sala");
    },
  },
  {
    name: "TC-INT-11: Usuário sem token recebe 401 na rota protegida",
    async run() {
      const res = await fetch(`${BASE_CHAT}/rooms`);
      assert(res.status === 401, `status 401, recebeu ${res.status}`);
    },
  },
  {
    name: "TC-INT-12: Endpoint /health dos dois serviços retorna ok",
    async run() {
      const [r1, r2] = await Promise.all([
        fetch("http://localhost/api/auth/health"),
        fetch("http://localhost/api/chat/health"),
      ]);
      assert(r1.status === 200, `auth-service health 200, recebeu ${r1.status}`);
      assert(r2.status === 200, `chat-service health 200, recebeu ${r2.status}`);
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log(" Testes de Integração — Chat Distribuído CEFET-MG");
  console.log("═══════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`▶ ${test.name}`);
    try {
      await test.run();
      passed++;
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      failed++;
    }
    console.log();
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(` Resultado: ${passed} passaram, ${failed} falharam`);
  console.log("═══════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
})();
