# websocket-poc

A proof-of-concept WebSocket application built with Django, Channels, Celery, Redis, and a React + Vite frontend.

## Overview

This repository contains a full-stack project demonstrating:
- Django backend with ASGI support
- Django Channels for WebSocket communication
- Celery for background task processing
- Redis as the message broker and channel layer backend
- React + TypeScript frontend served by Vite

## Structure

- `backend/` — Django project, WebSocket consumers, Celery configuration, and backend dependencies
- `frontend/` — React + TypeScript client powered by Vite
- `docker-compose.yml` — Docker Compose setup for the backend and Redis

## Requirements

- Docker & Docker Compose
- Python 3.11+ (if running backend locally)
- Node.js 18+ and npm (if running frontend locally)

## Setup with Docker

This is the easiest way to run the full stack.

```bash
cd websocket-poc
docker compose up --build
```

Then open the frontend and backend in your browser / API client as needed.

## Local Development

### Backend

Install dependencies and run the Django application locally:

```bash
cd websocket-poc/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

If you want to run Celery workers locally, start Redis first and then:

```bash
cd websocket-poc/backend
source .venv/bin/activate
celery -A config worker --loglevel=info
```

### Frontend

Install dependencies and launch the Vite development server:

```bash
cd websocket-poc/frontend
npm install
npm run dev
```

By default, Vite serves the frontend at `http://localhost:5173`.

## Notes

- Redis is required for Channels and Celery when running the app locally.
- The backend uses a SQLite database located at `backend/db.sqlite3`.

## Recommended Improvements

For a production-ready version, consider adding:
- a root `.gitignore`
- environment variable support for Django and Celery settings
- separate Docker service for the frontend
- production build support for the React app

## License

This project does not include a license file. Add one if you want to open source the repository.
