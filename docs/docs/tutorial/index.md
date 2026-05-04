# Tutorial

This tutorial is a single thread that takes a fresh Fovea install
from `docker compose up` to a fully annotated video with a generated
summary, extracted claims, and an export that round-trips through
import. The five chapters cover:

1. [Install](01-install.md): bringing the stack up, signing in,
   confirming the three services are healthy.
2. [First persona](02-first-persona.md): creating a persona named
   "Soccer Match Analyst", giving it an information need, and
   seeding its ontology with entity, event, role, and relation types.
3. [Annotate a video](03-annotate-a-video.md): uploading a video,
   drawing keyframe bounding boxes, linking object annotations to
   world entities, and using interpolation between keyframes.
4. [Summary and claims](04-summary-and-claims.md): generating a VLM
   summary against the persona, extracting hierarchical claims with
   gloss items, and adding a typed claim relation.
5. [Export and import](05-export-import.md): exporting the persona,
   ontology, world, summary, and claims to JSONL, then importing
   the file into a second user account on the same instance.

The tutorial assumes Docker, Docker Compose v2, and a machine with
at least 16 GB of RAM. GPU is optional. By the end the reader has
a working persona, a real annotation set, a generated summary with
claims, and a round-tripped export. After that the
[Guides](../guide/index.md) and [Concepts](../concepts/index.md)
sections answer specific questions in isolation.
