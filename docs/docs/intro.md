---
title: Welcome to Fovea
sidebar_position: 1
---

# Welcome to Fovea

Fovea (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool that enables tactically-oriented analysts to develop annotation ontologies using a persona-based approach.

## Key Features

- **Persona-based Ontology System**: Different analysts can assign different types to the same real-world objects through their own interpretive frameworks
- **Video Annotation**: Draw bounding boxes, create temporal annotations, and link annotations to world objects
- **Automation-Assisted Analysis**: Integrate with models for video summarization, object detection, and tracking
- **Flexible Data Model**: Separate types (ontology definitions) from instances (world objects)
- **Import/Export**: Full data portability with JSON Lines format

## Getting Started

Ready to start annotating? Check out our [Quick Start Guide](/docs/getting-started/quick-start) to annotate your first video in 5 minutes.

## Architecture

Fovea consists of three main services:
- **Frontend**: React-based annotation interface
- **Backend**: Node.js API server with PostgreSQL database
- **Model Service**: Python-based inference service

Learn more about the [architecture](/docs/concepts/architecture).
