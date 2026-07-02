"""Per-task inference serialization locks.

The transcribe and diarize routes fetch the single model instance cached in the
`ModelManager` and run its native inference (faster-whisper / pyannote / torch)
inside ``asyncio.to_thread``. Offloading to a worker thread removed the implicit
serialization that running synchronously on the event loop provided, so two
concurrent requests for the same task would now call the SAME model object's
inference method from two threads at once — which those native objects are not
safe for (garbled/interleaved output, or a crash inside CTranslate2/torch).

These locks serialize inference PER TASK TYPE: only one inference runs at a time
on a given shared model, while different tasks (transcription vs diarization,
which hold distinct model instances) still run in parallel. The service runs on
a single event loop, so a plain per-key :class:`asyncio.Lock` is sufficient; the
locks are created lazily on first use within a running loop.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict

_inference_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def inference_lock(task_type: str) -> asyncio.Lock:
    """Return the process-wide inference lock for ``task_type``."""
    return _inference_locks[task_type]
