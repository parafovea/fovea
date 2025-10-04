---
title: Data Flow
sidebar_position: 7
---

# Data Flow

Overview of how data flows through the Fovea system.

## Frontend State Management

Redux manages client-side state for ontologies, world objects, and annotations. TanStack Query handles server state synchronization.

## Backend Persistence

The backend API persists data to PostgreSQL via Prisma ORM.

## Model Service Processing

Background tasks use BullMQ with Redis. The model service processes queued jobs and returns results via Redis.

## Export Flow

Export generates JSON Lines format files containing ontologies, world objects, and annotations.
