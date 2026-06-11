# ── Stage 1: builder ──────────────────────────────────
FROM python:3.14-slim AS builder

WORKDIR /app

# Install build dependencies needed to compile packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install packages into a specific directory
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: final ────────────────────────────────────
FROM python:3.14-slim

WORKDIR /app

# Copy only the installed packages from builder stage
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

CMD ["daphne", "config.asgi:application", "-b", "0.0.0.0", "-p", "8000"]