# Messaging System

A production-grade real-time messaging system built with **Express**, **Socket.IO**, and **SQLite**. Follows system design best practices including layered architecture, dependency injection, cursor-based pagination, and graceful shutdown.

## Features

- **REST API** — Versioned (`/api/v1`) with Joi validation and consistent error responses
- **Real-time WebSocket** — Socket.IO with JWT authentication, typing indicators, read receipts, and presence tracking
- **Authentication** — JWT access + refresh tokens with bcrypt password hashing
- **Database** — SQLite via `better-sqlite3` with WAL mode, foreign keys, and migration-safe schema
- **Infrastructure** — LRU cache with TTL, in-process message queue with DLQ, structured Winston logging, event bus
- **Rate Limiting** — Token bucket algorithm with per-IP and per-user limits
- **Health Checks** — `/health` endpoint with database, cache, and queue diagnostics

## Architecture

```
server.js                     ← Entry point, bootstrap, graceful shutdown
src/
├── config/                   ← Centralized config + database singleton
│   ├── index.js
│   └── database.js
├── routes/                   ← HTTP route definitions
│   ├── health.js
│   └── v1/
│       ├── index.js          ← Composition root (DI wiring)
│       ├── auth.js
│       ├── users.js
│       ├── messages.js
│       └── conversations.js
├── controllers/              ← Thin HTTP handlers
├── services/                 ← Core business logic
├── repositories/             ← Data access layer (SQL)
├── models/                   ← DTOs with serialization helpers
├── middleware/               ← Auth, validation, rate limiting, error handling
├── infrastructure/           ← Cache, event bus, logger, message queue
└── websocket/                ← Socket.IO handler + event constants
```

## Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd messaging-system

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Edit .env — at minimum, set a strong JWT_SECRET for production

# 4. Start the server
npm run dev        # Development (auto-restart on changes)
npm start          # Production
```

The server will start at `http://localhost:3000`.

## API Reference

All API responses follow a consistent format:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register a new user |
| POST | `/api/v1/auth/login` | Login, receive JWT tokens |
| POST | `/api/v1/auth/refresh` | Refresh an expired access token |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/me` | Get current user profile |
| PATCH | `/api/v1/users/profile` | Update display name / avatar |
| GET | `/api/v1/users/search?q=...` | Search users by name |
| GET | `/api/v1/users/online` | List online users |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/conversations` | Create direct or group conversation |
| GET | `/api/v1/conversations` | List user's conversations |
| GET | `/api/v1/conversations/:id` | Get conversation details |
| POST | `/api/v1/conversations/:id/participants` | Add participant to group |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/messages` | Send a message |
| GET | `/api/v1/messages/:conversationId` | Get messages (cursor-paginated) |
| PATCH | `/api/v1/messages/:id` | Edit a message |
| PATCH | `/api/v1/messages/:id/read` | Mark message as read |
| DELETE | `/api/v1/messages/:id` | Soft-delete a message |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System health check |

## WebSocket Events

Connect with a JWT token:

```js
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});
```

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `conversation:join` | `{ conversationId }` | Join a conversation room |
| `conversation:leave` | `{ conversationId }` | Leave a conversation room |
| `message:send` | `{ conversationId, content, type?, parentMessageId? }` | Send a message |
| `message:read` | `{ conversationId, messageId }` | Mark message as read |
| `typing:start` | `{ conversationId }` | Start typing indicator |
| `typing:stop` | `{ conversationId }` | Stop typing indicator |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, username }` | Connection confirmed |
| `message:new` | `{ message, conversationId }` | New message received |
| `message:delivered` | `{ message }` | Message delivery confirmed |
| `message:read` | `{ conversationId, readerId, messageId }` | Read receipt |
| `typing:start` | `{ conversationId, userId }` | User started typing |
| `typing:stop` | `{ conversationId, userId }` | User stopped typing |
| `presence:update` | `{ userId, status }` | User online/offline |

## Environment Variables

See [.env.example](.env.example) for all available configuration options with defaults.

## License

MIT
