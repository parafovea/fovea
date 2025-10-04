---
title: Manual Setup
sidebar_position: 3
---

# Manual Setup

Set up Fovea for local development without Docker.

## Prerequisites

- Node.js 22 LTS
- Python 3.12
- PostgreSQL 16
- Redis 7

## Frontend Setup

```bash
cd annotation-tool
npm install
npm run dev
```

## Backend Setup

```bash
cd server
npm install
npx prisma migrate dev
npm run dev
```

## Model Service Setup

```bash
cd model-service
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

## Next Steps

See the [Development Guide](../development/frontend-dev.md) for detailed development instructions.
