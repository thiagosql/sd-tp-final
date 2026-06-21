# Sistema de Chat Distribuído

**Trabalho Final — Sistemas Distribuídos — CEFET-MG 2026/1**  
**Dupla:** Thiago Leonardo Oliveira Bertolino e Pedro Henrique Ferreira Santos  
**Professora:** Michelle Hanne

---

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend  │────▶│    Nginx     │────▶│  Auth Service    │
│  (HTML/JS)  │     │ (API Gateway │     │  Express + JWT   │
│             │     │  / Balancer) │     │  PostgreSQL      │
└─────────────┘     └──────────────┘     └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  Chat Service    │
                    │  Express + WS    │
                    │  MongoDB         │
                    └──────────────────┘
```

- **Auth Service** — cadastro, login e validação de tokens JWT. Persiste usuários em PostgreSQL.
- **Chat Service** — salas, mensagens 1:1 e 1:N via WebSocket. Persiste mensagens em MongoDB.
- **Nginx** — API Gateway e balanceador de carga (múltiplas réplicas do Chat Service via round-robin).
- **Frontend** — interface responsiva em HTML/CSS/JS puro, sem framework.

---

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) >= 24 (com integração WSL ativada, se Linux)
- Docker Compose >= 2.20 (incluso no Docker Desktop)
- Node.js >= 18 (apenas para rodar os testes fora do Docker)

---

## Como rodar

```bash
# 1. Clone o repositório
git clone https://github.com/thiagosql/sd-tp-final.git
cd sd-tp-final

# 2. Suba toda a stack
docker compose up --build

# 3. Acesse no navegador
# http://localhost
```

Para escalar o Chat Service (teste de carga):

```bash
docker compose up --build --scale chat-service=3
```

---

## Estrutura de diretórios

```
.
├── auth-service/       # Microsserviço de autenticação (Express + PostgreSQL)
├── chat-service/       # Microsserviço de chat (Express + WebSocket + MongoDB)
├── frontend/           # Interface do usuário (HTML/CSS/JS)
├── nginx/              # Configuração do API Gateway e balanceador
├── tests/
│   ├── unit/           # Testes unitários (Jest + mocks)
│   ├── integration/    # Testes de integração (fluxo E2E)
│   └── load/           # Teste de carga (12+ usuários simultâneos)
└── docker-compose.yml
```

---

## Executando os Testes

### 1. Testes Unitários

Não requerem o Docker rodando. Testam a lógica do Auth Service com mocks.

```bash
cd auth-service
npm install
npm test
```

Resultado esperado: **18/18 testes passando**.

---

### 2. Testes de Integração

Requerem a stack em execução (`docker compose up --build`).

```bash
# Na raiz do projeto
node tests/integration/integration.test.js
```

Resultado esperado: **12/12 testes passando**.

---

### 3. Teste de Carga

Requer a stack em execução. Simula N usuários simultâneos (padrão: 12).

```bash
cd tests/load
npm install
node load-test.js 12
```

Resultado esperado: 12 registros, 12 logins, 12 conexões WebSocket e 60 mensagens enviadas/recebidas com sucesso.

---

## Variáveis de ambiente

Cada serviço possui um arquivo `.env.example`. Para rodar fora do Docker, copie para `.env` e ajuste os valores.
