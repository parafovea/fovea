---
title: Docker Profiles
sidebar_position: 3
---

# Docker Profiles

Fovea uses Docker Compose profiles to handle different deployment scenarios. The default profile runs on CPU, while the GPU profile enables hardware-accelerated model inference.

## CPU Mode

Running `docker compose up` starts Fovea in CPU mode. This mode excludes GPU-dependent services and works on any system. It's intended for development and testing.

## GPU Mode

The GPU profile requires an NVIDIA GPU with CUDA support. Start it with `docker compose --profile gpu up`. This mode enables the full model service with hardware acceleration for video summarization, object detection, and tracking.

## When to Use Each Profile

CPU mode works for development, testing, and deployments where model inference isn't needed. GPU mode is for production systems that need the model service running at full capacity.
