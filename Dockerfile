# --- Stage 1: build the React dashboard (frontend/dist) ---
FROM node:22-alpine AS frontend

WORKDIR /frontend

# Install dependencies first (layer caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python API, serves the dashboard at /ui/ ---
FROM python:3.12-slim

# Install uv from official Astral image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Enable bytecode compilation and copy link mode
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies first (layer caching)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Copy application source (frontend sources/node_modules are excluded by
# .dockerignore; only the built dashboard is copied from stage 1)
COPY . .
COPY --from=frontend /frontend/dist ./frontend/dist

# Install project
RUN uv sync --frozen --no-dev

EXPOSE 8000

# Run migrations, import OSDR Inspiration4 data, optionally seed the demo
# scenarios (SPACEAPP_SEED_DEMO=true) and start uvicorn
CMD ["sh", "-c", "uv run alembic upgrade head && uv run python -m spaceapp_logar.services.osdr_import && if [ \"$SPACEAPP_SEED_DEMO\" = \"true\" ]; then uv run python -m spaceapp_logar.seed_demo || echo seed failed, continuing; fi && uv run uvicorn spaceapp_logar.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
