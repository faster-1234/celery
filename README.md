# FE-172 — WebSocket POC Write-up
**Epic:** FE-172  
**Developer:** Het Rathod  
**Company:** Multiicon  
**Date:** June 2026  
**Estimated Hours:** 36h | **Actual Hours:** ~40h

---

## 1. Objective

Build an end-to-end proof-of-concept demonstrating:

> **React frontend receives a real-time Celery task result via WebSocket, running entirely in Docker Compose.**

The POC covers: WebSocket lifecycle, Django Channels, Celery background tasks, Redis as both message broker and channel layer, PostgreSQL as the database, and a React + TypeScript frontend — all wired together in a multi-service Docker Compose stack.

---

## 2. Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Compose                       │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐    ┌─────────────┐   │
│  │    React     │     │   Django +   │    │    Celery   │   │
│  │  (Vite/TS)  │────▶│   Channels   │───▶│    Worker   │    │
│  │  port 5173  │ WS  │   Daphne     │    │             │    │
│  └──────────────┘     │  port 8000  │    └──────┬──────┘    │
│                        └──────┬──────┘           │          │
│                               │                  │          │
│                        ┌──────▼──────────────────▼──────┐   │
│                        │            Redis                │  │
│                        │  • Celery broker (queue)        │  │
│                        │  • Channel layer (pub/sub)      │  │
│                        │  port 6379                      │  │
│                        └─────────────────────────────────┘  │
│                                                             │
│                        ┌─────────────────────────────────┐  │
│                        │          PostgreSQL              │ │
│                        │  port 5432                      │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Message Flow

```
1. User types message in React → clicks Send
2. React sends via WebSocket → ws://localhost:8000/ws/chat/room1/
3. Django Channels consumer receives it → calls test_task.delay(message)
4. Celery picks up task from Redis queue → runs background job (5s)
5. Task finishes → calls channel_layer.group_send("chat_room1", {...})
6. Django Channels broadcasts to ALL clients in the room
7. Both browser tabs receive the response in real-time — no refresh
```

---

## 3. Tech Stack

| Component | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript + Vite | React 18 |
| Backend | Django + Daphne (ASGI) | Django 6.0.6 |
| WebSocket | Django Channels | 4.3.2 |
| Task Queue | Celery | 5.6.3 |
| Message Broker | Redis | 8.8.0 |
| Channel Layer | channels-redis (PubSub) | 4.3.0 |
| Database | PostgreSQL | 16 (Alpine) |
| Containerisation | Docker + Docker Compose | — |
| Python | CPython | 3.14-slim |

---

## 4. Project Structure

```
websocket-poc/
├── docker-compose.yml
├── frontend/
│   ├── src/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── config/
    │   ├── settings.py
    │   ├── asgi.py
    │   └── urls.py
    └── chat/
        ├── consumers.py
        ├── tasks.py
        └── routing.py
```

---

## 5. Key Implementation Details

### 5.1 Django Channels Consumer (`consumers.py`)

The consumer handles the full WebSocket lifecycle:

```python
class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        # Room name comes from the URL — dynamic rooms
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        # Fire Celery task — non-blocking
        await sync_to_async(test_task.delay)(data["message"], self.room_group_name)

    async def send_message(self, event):
        # Called by channel layer when task pushes group_send
        await self.send(text_data=json.dumps({"response": event["message"]}))
```

Key design decisions:
- `sync_to_async(test_task.delay)` — wraps the synchronous Celery call so it doesn't block the async event loop
- Dynamic room names from URL (`/ws/chat/<room_name>/`) so multiple isolated rooms can exist
- `group_add` / `group_discard` ensures clean join/leave from the Redis pub/sub channel

### 5.2 Celery Task (`tasks.py`)

```python
@shared_task
def test_task(message, room_group_name):
    time.sleep(5)  # simulates background work

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        room_group_name,
        {
            "type": "send_message",
            "message": f"Task done! You sent: {message}",
        }
    )
    return "Task completed successfully"
```

Key design decisions:
- `@shared_task` — works with `CELERY_BROKER_URL` from Django settings, no tight coupling
- `async_to_sync` — Celery workers run in sync context, so we wrap the async channel layer call
- `room_group_name` passed as parameter — task knows which room to broadcast back to

### 5.3 Channel Layer Config (`settings.py`)

```python
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.pubsub.RedisPubSubChannelLayer",
        "CONFIG": {
            "hosts": [{"host": "websocket-redis", "port": 6379}],
        },
    }
}
```

Uses `RedisPubSubChannelLayer` (not the older `RedisChannelLayer`) — reasons explained in Section 7.

### 5.4 React Frontend (`App.tsx`)

Key patterns implemented:

**Connection lifecycle:**
```tsx
useEffect(() => {
  let ws: WebSocket;

  function connect() {
    ws = new WebSocket("ws://localhost:8000/ws/chat/room1/");
    ws.onopen = () => console.log("connected");
    ws.onmessage = (event) => setServer(event.data);
    ws.onclose = (event) => console.log("closed", event.code);
    ws.onerror = (err) => console.error("ws error", err);
  }

  connect();

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
}, []);
```

**Throttling — max 1 message per second:**
```tsx
const lastSent = useRef<number>(0);

function sendMessage() {
  const now = Date.now();
  if (now - lastSent.current < 1000) {
    setThrottled(true);
    return;
  }
  socket.current.send(JSON.stringify({ message }));
  lastSent.current = now;
}
```

`useRef` is used instead of `useState` for `lastSent` because updating it should not trigger a re-render.

### 5.5 Multi-Stage Dockerfile

```dockerfile
# Stage 1 — builder: install dependencies with build tools
FROM python:3.14-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2 — final: clean image, no build tools
FROM python:3.14-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
CMD ["daphne", "config.asgi:application", "-b", "0.0.0.0", "-p", "8000"]
```

Build tools (`gcc`) are only present in stage 1. The final image copies only the installed Python packages — keeping the image lean.

### 5.6 Docker Compose

```yaml
websocket-backend:
  command: >
    sh -c "python manage.py migrate &&
           daphne config.asgi:application -b 0.0.0.0 -p 8000"
  depends_on:
    websocket-postgres:
      condition: service_healthy  # waits for DB to be ready
```

`condition: service_healthy` with a `pg_isready` healthcheck on the Postgres container prevents the race condition where Django tries to connect before Postgres is fully up.

---

## 6. Problems Hit and How They Were Fixed

This section documents the real debugging journey — each problem encountered, root cause, and fix.

---

### Problem 1 — WebSocket closes immediately on page load

**Symptom:**
```
connected
received {"message": "Joined room successfully"}
closed
socket not open 3
```

**Root cause:** React Strict Mode (default in Vite + React) double-invokes `useEffect` in development — mount → unmount → remount. The cleanup function `ws.close()` fired on the first unmount, killing the connection before the user could do anything.

**Fix:** Restructured the `useEffect` to use a `connect()` function with a `readyState` guard on cleanup:
```tsx
return () => {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
};
```

---

### Problem 2 — `redis.exceptions.TimeoutError` after sending a message

**Symptom:**
```
redis.exceptions.TimeoutError: Timeout reading from websocket-redis:6379
```
WebSocket connection dropped every time a message was sent.

**Root cause:** `redis-py 8.0.0` defaults to RESP3 protocol. `channels-redis 4.3.0` (using `RedisChannelLayer`) uses long-lived async connections for pub/sub. The RESP3 async connection pooling behavior in redis-py 8.x changed in a way that caused idle connections to time out after ~30 seconds, crashing the consumer.

**Fix 1 (failed):** Downgrading to `redis==5.0.8` — broke other packages (`celery 5.6.3`, `channels-redis 4.3.0`) which were built expecting redis-py 8.x APIs.

**Fix 2 (failed):** Adding `connection_class_kwargs: {protocol: 2}` to `CHANNEL_LAYERS` config — `RedisChannelLayer.__init__()` does not accept that parameter, got `TypeError`.

**Fix 3 (failed):** Adding `protocol: 2` inside host dict — still timed out with `redis/_parsers/resp2.py`.

**Fix 4 (worked):** Switched from `RedisChannelLayer` to `RedisPubSubChannelLayer`:
```python
"BACKEND": "channels_redis.pubsub.RedisPubSubChannelLayer"
```
`RedisPubSubChannelLayer` uses Redis's native Pub/Sub mechanism which is designed for long-lived subscriptions and handles reconnections internally — fully compatible with redis-py 8.x.

---

### Problem 3 — `psycopg2-binary` fails to build on Python 3.14

**Symptom:**
```
Error: pg_config executable not found.
psycopg2-binary==2.9.9 has no pre-built wheel for Python 3.14
```

**Root cause:** `psycopg2-binary 2.9.9` had no pre-compiled wheel for Python 3.14, so pip tried to build from source — which requires `pg_config` (PostgreSQL dev headers) not present in the slim image.

**Fix:** Switched to `psycopg[binary]==3.2.10` (psycopg3), which has Python 3.14 wheels and works with Django's `django.db.backends.postgresql` engine.

---

### Problem 4 — Migrations never ran, Postgres tables empty

**Symptom:** `\dt` in psql showed no tables despite Django starting successfully.

**Root cause:** The `docker-compose.yml` `command` was just `daphne ...` — no `migrate` step. Also, even after adding `migrate`, there was a race condition: the backend container started before Postgres was ready to accept connections, so `migrate` failed silently.

**Fix:** Two changes:
1. Added `python manage.py migrate &&` before daphne in the command
2. Added a `healthcheck` to the Postgres service with `pg_isready`, and changed `depends_on` to use `condition: service_healthy` so the backend only starts after Postgres passes the health check

---

## 7. What I Learned

**Django Channels architecture** — Understanding the difference between the ASGI server (Daphne), the channel layer (Redis pub/sub), and the consumer (Python class handling each connection) — and how they fit together.

**async/sync boundaries** — Celery workers run in sync context. Django Channels consumers run in async context. Crossing that boundary requires `sync_to_async` and `async_to_sync` from `asgiref`. Getting this wrong causes either blocking or runtime errors.

**Redis protocol versions** — RESP2 vs RESP3 is a real compatibility concern. redis-py 8.x defaulting to RESP3 is a breaking change for libraries that haven't caught up. Knowing to switch to `RedisPubSubChannelLayer` instead of fighting the protocol version is a useful lesson.

**Docker Compose service health** — `depends_on` with just a service name only waits for the container to start, not for the service inside it to be ready. `condition: service_healthy` with a proper healthcheck is the correct pattern for databases.

**Multi-stage Docker builds** — Separating build-time dependencies (gcc, compilers) from runtime keeps the final image clean and smaller.

---

## 8. Known Limitations of this POC

| Limitation | Production Fix |
|---|---|
| Celery running as root | Add `--uid` flag or create non-root user in Dockerfile |
| Redis has no authentication | Add `requirepass` in Redis config and update `CELERY_BROKER_URL` |
| Hardcoded `room1` in frontend | Make room name dynamic from UI input or URL params |
| No message persistence | Add `ChatRoom` and `Message` models, save on receive |
| No authentication | JWT token verification in WebSocket `connect()` |
| `SECRET_KEY` hardcoded | Move all secrets to `.env` file with `python-decouple` |
| SQLite replaced but no chat models | Next step after POC |

---

## 9. How to Run

```bash
# Clone the repo
git clone https://github.com/faster-1234/celery
cd celery

# Start all services
docker compose up --build

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in two browser tabs. Type a message in one tab and click Send — after 5 seconds both tabs receive the Celery task result in real-time.

---

## 10. Deliverable Checklist

| Item | Status |
|---|---|
| WebSocket connection lifecycle | ✅ |
| Dynamic rooms via URL | ✅ |
| Reconnection pattern | ✅ |
| Real-time React state updates | ✅ |
| Throttling (1 message/sec) | ✅ |
| Dockerfile with multi-stage build | ✅ |
| Docker Compose — Django + Postgres + Redis + Celery | ✅ |
| Celery `delay` and `apply_async` | ✅ |
| Background job pushes result via WebSocket | ✅ |
| POC write-up | ✅ |
