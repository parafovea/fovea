---
title: Manual Setup
sidebar_position: 3
---

# Manual Setup

Set up FOVEA for local development without Docker. This guide targets developers who want to run services individually for development and debugging.

## Prerequisites

Install required software before proceeding.

### Node.js 22 LTS

```bash
# macOS (using Homebrew)
brew install node@22

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v22.x.x
npm --version
```

### Python 3.12

```bash
# macOS (using Homebrew)
brew install python@3.12

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install python3.12 python3.12-venv python3.12-dev

# Verify installation
python3.12 --version  # Should show Python 3.12.x
```

### PostgreSQL 16

```bash
# macOS (using Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update
sudo apt-get install postgresql-16

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
createdb fovea_dev

# Verify installation
psql --version  # Should show PostgreSQL 16.x
```

### Redis 7

```bash
# macOS (using Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify installation
redis-cli ping  # Should respond with PONG
```

### Git

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install git

# Verify installation
git --version
```

## Clone Repository

```bash
git clone https://github.com/parafovea/fovea.git
cd fovea
```

## Infrastructure Services Setup

### PostgreSQL Database

Create and configure the development database:

```bash
# Create database
createdb fovea_dev

# Verify database exists
psql -l | grep fovea_dev

# Optional: Create a dedicated user
psql postgres
CREATE USER fovea_dev WITH PASSWORD 'dev_password';
GRANT ALL PRIVILEGES ON DATABASE fovea_dev TO fovea_dev;
\q
```

### Redis Cache

Redis should already be running from the prerequisites step. Verify:

```bash
# Check Redis is running
redis-cli ping

# Should respond: PONG

# Check Redis info
redis-cli info server
```

### Optional: OpenTelemetry Stack

For observability during development, run these services in Docker:

```bash
docker compose up -d otel-collector prometheus grafana
```

Access points:
- Grafana: http://localhost:3002
- Prometheus: http://localhost:9090

## Backend Setup

Set up and run the Node.js backend server.

### Install Dependencies

```bash
cd server
npm install
```

### Environment Variables

Create `.env` file in `server/` directory:

```bash
# Database
DATABASE_URL="postgresql://localhost:5432/fovea_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# Model Service
MODEL_SERVICE_URL="http://localhost:8000"

# Data Directory
DATA_DIR="/absolute/path/to/fovea/data"

# Server Port
PORT=3001

# Optional: OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

### Database Migration

Run Prisma migrations to create database schema:

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Optional: Seed database with sample data
npx prisma db seed
```

### Start Backend

```bash
npm run dev
```

Backend runs on http://localhost:3001

Verify:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

## Frontend Setup

Set up and run the React frontend application.

### Install Dependencies

```bash
cd annotation-tool
npm install
```

### Environment Variables

Create `.env` file in `annotation-tool/` directory:

```bash
# Backend API URL
VITE_API_URL=http://localhost:3001

# Optional: Model Service URL (for direct calls)
VITE_MODEL_SERVICE_URL=http://localhost:8000
```

### Start Frontend

```bash
npm run dev
```

Frontend runs on http://localhost:5173

Open http://localhost:5173 in your browser to access the application.

## Model Service Setup

Set up and run the Python model service for AI inference.

### Create Virtual Environment

```bash
cd model-service
python3.12 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### Install Dependencies

```bash
# Base dependencies only (faster)
pip install -r requirements.txt

# Or install with development tools
pip install -e ".[dev]"
```

### Environment Variables

Create `.env` file in `model-service/` directory:

```bash
# Model Configuration
DEVICE=cpu  # Use "cuda" if you have a GPU

# Model Paths
MODEL_CACHE_DIR=/absolute/path/to/fovea/model-service/models

# Data Directory
DATA_DIR=/absolute/path/to/fovea/data

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Optional: OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Start Model Service

```bash
uvicorn src.main:app --reload --port 8000
```

Model service runs on http://localhost:8000

Verify:
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy"}
```

## Verification Steps

### Check All Services

```bash
# Backend
curl http://localhost:3001/health

# Frontend (should load in browser)
open http://localhost:5173

# Model Service
curl http://localhost:8000/health

# Redis
redis-cli ping

# PostgreSQL
psql fovea_dev -c "SELECT 1;"
```

### Check Logs

Each service should show startup logs:

**Backend:**
```
Server listening at http://localhost:3001
Database connection established
```

**Frontend:**
```
VITE ready in X ms
Local: http://localhost:5173/
```

**Model Service:**
```
INFO:     Uvicorn running on http://localhost:8000
INFO:     Application startup complete
```

### Test API Endpoints

```bash
# List personas
curl http://localhost:3001/api/personas

# List videos
curl http://localhost:3001/api/videos

# Health check all services
curl http://localhost:3001/health && \
curl http://localhost:8000/health
```

## Troubleshooting

### Port Conflicts

If ports are already in use:

```bash
# Find process using port
lsof -i :3001  # Backend
lsof -i :5173  # Frontend
lsof -i :8000  # Model Service

# Kill process
kill -9 <PID>

# Or change port in environment variables
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
psql "postgresql://localhost:5432/fovea_dev"

# Reset database (WARNING: deletes all data)
dropdb fovea_dev
createdb fovea_dev
cd server
npx prisma migrate dev
```

### Redis Connection Errors

```bash
# Check Redis is running
redis-cli ping

# Check Redis logs
# macOS
tail -f /usr/local/var/log/redis.log

# Ubuntu/Debian
sudo journalctl -u redis-server -f
```

### Python Version Mismatches

```bash
# Ensure using Python 3.12
python --version

# If multiple versions installed
python3.12 -m venv venv
source venv/bin/activate
python --version  # Should show 3.12.x
```

### Missing Dependencies

```bash
# Backend
cd server
rm -rf node_modules package-lock.json
npm install

# Frontend
cd annotation-tool
rm -rf node_modules package-lock.json
npm install

# Model Service
cd model-service
pip install --upgrade pip
pip install -e ".[dev]"
```

### Model Download Issues

Models are downloaded on first use. If downloads fail:

```bash
# Check internet connection
ping huggingface.co

# Set proxy if needed
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port

# Manually download models
cd model-service
python scripts/download_models.py
```

## Development Workflow

### Running Tests

```bash
# Backend tests
cd server
npm test

# Frontend tests
cd annotation-tool
npm test

# Model service tests
cd model-service
pytest
```

### Database Migrations

```bash
# Create new migration
cd server
npx prisma migrate dev --name describe_change

# Reset database
npx prisma migrate reset

# View database in Prisma Studio
npx prisma studio
```

### Hot Reload

All services support hot reload during development:
- Backend: Changes to `.ts` files trigger automatic restart
- Frontend: Changes to `.tsx` files trigger browser refresh
- Model Service: Changes to `.py` files trigger uvicorn reload

## Next Steps

- [Add your first video](./first-video.md)
- [Explore the architecture](../concepts/architecture.md)
- [Learn about personas](../concepts/personas.md)
- [Development guide](../development/backend-dev.md)
