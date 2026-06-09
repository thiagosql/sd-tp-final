/**
 * Testes unitários — Auth Service
 * Cobrem: validação de credenciais, hashing de senha, geração/verificação de token.
 * Não dependem de banco de dados (mocks via jest.mock).
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ─── Configuração de ambiente para testes ────────────────────────────────────
process.env.JWT_SECRET = "test_secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";

// ─── Mock do Sequelize / modelos ──────────────────────────────────────────────
const mockUser = {
  id: "uuid-123",
  username: "thiago",
  email: "thiago@cefet.mg",
  password_hash: bcrypt.hashSync("senha123", 10),
};

jest.mock("../src/models", () => ({
  getModels: () => ({
    User: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
    },
    sequelize: { authenticate: jest.fn(), sync: jest.fn() },
  }),
}));

const { getModels } = require("../src/models");
const supertest = require("supertest");

// ─── Testes de lógica de negócio ──────────────────────────────────────────────

describe("Lógica de senha", () => {
  test("bcrypt.hash gera hash diferente do plaintext", async () => {
    const hash = await bcrypt.hash("minha_senha", 10);
    expect(hash).not.toBe("minha_senha");
  });

  test("bcrypt.compare valida senha correta", async () => {
    const hash = await bcrypt.hash("senha_correta", 10);
    const result = await bcrypt.compare("senha_correta", hash);
    expect(result).toBe(true);
  });

  test("bcrypt.compare rejeita senha incorreta", async () => {
    const hash = await bcrypt.hash("senha_correta", 10);
    const result = await bcrypt.compare("senha_errada", hash);
    expect(result).toBe(false);
  });
});

describe("Geração e verificação de JWT", () => {
  test("jwt.sign gera token válido", () => {
    const payload = { id: "uuid-1", username: "pedro" };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  test("jwt.verify decodifica payload corretamente", () => {
    const payload = { id: "uuid-1", username: "pedro", email: "pedro@cefet.mg" };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toBe("uuid-1");
    expect(decoded.username).toBe("pedro");
  });

  test("jwt.verify lança erro com segredo errado", () => {
    const token = jwt.sign({ id: "x" }, process.env.JWT_SECRET);
    expect(() => jwt.verify(token, "segredo_errado")).toThrow();
  });

  test("jwt.verify lança erro com token expirado", async () => {
    const token = jwt.sign({ id: "x" }, process.env.JWT_SECRET, { expiresIn: "1ms" });
    await new Promise((r) => setTimeout(r, 10));
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow(/expired/i);
  });
});

describe("Validação de campos de registro", () => {
  function validateRegisterInput({ username, email, password }) {
    if (!username || !email || !password) return "campos obrigatórios";
    if (password.length < 6) return "senha muito curta";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email inválido";
    return null;
  }

  test("retorna erro quando faltam campos", () => {
    expect(validateRegisterInput({ username: "", email: "a@b.com", password: "123456" }))
      .toMatch(/obrigatórios/);
  });

  test("retorna erro para senha menor que 6 caracteres", () => {
    expect(validateRegisterInput({ username: "thiago", email: "t@c.com", password: "123" }))
      .toMatch(/curta/);
  });

  test("retorna erro para email inválido", () => {
    expect(validateRegisterInput({ username: "thiago", email: "nao-eh-email", password: "123456" }))
      .toMatch(/inválido/);
  });

  test("retorna null para entrada válida", () => {
    expect(validateRegisterInput({ username: "thiago", email: "t@cefet.mg", password: "senha123" }))
      .toBeNull();
  });
});

// ─── Testes de rotas HTTP (supertest com mock de DB) ──────────────────────────

describe("POST /register (rota HTTP)", () => {
  let request;

  beforeAll(() => {
    // Importa o app DEPOIS dos mocks estarem configurados
    const app = require("../src/index");
    request = supertest(app);
  });

  beforeEach(() => {
    const { User } = getModels();
    User.findOne.mockReset();
    User.create.mockReset();
  });

  test("retorna 400 se faltar campo obrigatório", async () => {
    const res = await request.post("/register").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigatórios/);
  });

  test("retorna 409 se e-mail já existe", async () => {
    const { User } = getModels();
    User.findOne.mockResolvedValueOnce(mockUser);

    const res = await request
      .post("/register")
      .send({ username: "x", email: "thiago@cefet.mg", password: "senha123" });
    expect(res.status).toBe(409);
  });

  test("retorna 201 ao criar usuário com sucesso", async () => {
    const { User } = getModels();
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockResolvedValueOnce({ id: "uuid-new", username: "novo", email: "novo@c.mg" });

    const res = await request
      .post("/register")
      .send({ username: "novo", email: "novo@c.mg", password: "senha123" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });
});

describe("POST /login (rota HTTP)", () => {
  let request;

  beforeAll(() => {
    const app = require("../src/index");
    request = supertest(app);
  });

  beforeEach(() => {
    const { User } = getModels();
    User.findOne.mockReset();
  });

  test("retorna 400 se faltar campo", async () => {
    const res = await request.post("/login").send({ email: "x@y.com" });
    expect(res.status).toBe(400);
  });

  test("retorna 401 para usuário inexistente", async () => {
    const { User } = getModels();
    User.findOne.mockResolvedValueOnce(null);
    const res = await request.post("/login").send({ email: "x@y.com", password: "123456" });
    expect(res.status).toBe(401);
  });

  test("retorna 401 para senha errada", async () => {
    const { User } = getModels();
    User.findOne.mockResolvedValueOnce(mockUser);
    const res = await request.post("/login").send({ email: "thiago@cefet.mg", password: "errada" });
    expect(res.status).toBe(401);
  });

  test("retorna 200 com token para credenciais corretas", async () => {
    const { User } = getModels();
    User.findOne.mockResolvedValueOnce(mockUser);
    const res = await request
      .post("/login")
      .send({ email: "thiago@cefet.mg", password: "senha123" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.username).toBe("thiago");
  });
});
