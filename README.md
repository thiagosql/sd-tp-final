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
│             │     │  / Balancer) │     │  PostgreSQL       │
└─────────────┘     └──────────────┘     └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  Chat Service    │
                    │  Express + WS    │
                    │  MongoDB         │
                    └──────────────────┘
```

- **Auth Service** — gerencia cadastro, login e validação de tokens JWT. Persiste usuários em PostgreSQL.
- **Chat Service** — gerencia salas, mensagens 1:1 e 1:N via WebSocket. Persiste mensagens em MongoDB.
- **Nginx** — atua como API Gateway e balanceador de carga (múltiplas réplicas do Chat Service).
- **Frontend** — interface responsiva em HTML/CSS/JS puro, sem framework.

## Pré-requisitos

- Docker >= 24
- Docker Compose >= 2.20

## Como rodar

```bash
# Subir todo o ambiente
docker compose up --build

# Escalar o chat-service para 3 réplicas (teste de carga)
docker compose up --build --scale chat-service=3
```

Acesse: http://localhost

## Estrutura de diretórios

```
.
├── auth-service/       # Microsserviço de autenticação
├── chat-service/       # Microsserviço de chat/mensagens
├── frontend/           # Interface do usuário
├── nginx/              # Configuração do balanceador
├── tests/
│   ├── unit/           # Testes unitários (Jest)
│   ├── integration/    # Testes de integração
│   └── load/           # Teste de carga (10+ usuários)
└── docker-compose.yml
```

## Variáveis de ambiente

Cada serviço possui um arquivo `.env.example`. Copie para `.env` antes de rodar fora do Docker.

## Testes

```bash
# Unitários e integração
cd auth-service && npm test
cd chat-service && npm test

# Carga (requer o ambiente rodando)
cd tests/load && npm install && node load-test.js
```
