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

# Copy application source
COPY . .

# Install project
RUN uv sync --frozen --no-dev

EXPOSE 8000

# Run migrations, import OSDR Inspiration4 data and start uvicorn
CMD ["sh", "-c", "uv run alembic upgrade head && uv run python -m spaceapp_logar.services.osdr_import && uv run uvicorn spaceapp_logar.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
