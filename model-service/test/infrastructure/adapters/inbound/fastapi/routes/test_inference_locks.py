"""Tests for the per-task inference serialization locks."""

import asyncio

import pytest

from src.infrastructure.adapters.inbound.fastapi.routes.inference_locks import inference_lock


def test_same_task_shares_one_lock() -> None:
    """Repeated calls for a task return the same lock instance."""
    assert inference_lock("audio_transcription") is inference_lock("audio_transcription")


def test_different_tasks_have_distinct_locks() -> None:
    """Different task types get distinct locks so they run in parallel."""
    assert inference_lock("audio_transcription") is not inference_lock("speaker_diarization")


@pytest.mark.asyncio
async def test_inference_is_serialized_per_task() -> None:
    """Two coroutines holding the same task lock never overlap.

    Without the lock the interleaving would be a-start, b-start, a-end, b-end;
    the lock forces each critical section to complete before the next begins.
    """
    order: list[str] = []
    lock = inference_lock("test_task_serialization")

    async def worker(name: str) -> None:
        async with lock:
            order.append(f"{name}-start")
            await asyncio.sleep(0.01)
            order.append(f"{name}-end")

    await asyncio.gather(worker("a"), worker("b"))

    assert order in (
        ["a-start", "a-end", "b-start", "b-end"],
        ["b-start", "b-end", "a-start", "a-end"],
    )
