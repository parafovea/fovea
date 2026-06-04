"""Tests for the speaker diarization route.

Uses FastAPI's ``TestClient`` with ``dependency_overrides`` to swap in a
fake model manager. The route logic under test owns: file existence
check, task-config lookup, model loading, model.diarize invocation,
DiarizationResult unpacking, speaker first-appearance deduping, and
HTTPException translation for missing files, missing tasks, load
failures, and diarize failures.

Per-request speaker-count hints (num_speakers / min_speakers /
max_speakers) are accepted on the request body for forward
compatibility but the current diarization adapter does not honour
per-call overrides — the route logs a warning and otherwise drops
them.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from src.infrastructure.adapters.inbound.fastapi.dependencies import get_model_manager
from src.infrastructure.adapters.inbound.fastapi.routes import diarize as diarize_route
from src.infrastructure.adapters.outbound.models.audio.loader import (
    DiarizationResult,
    SpeakerSegment,
)
from src.main import app

if TYPE_CHECKING:
    from collections.abc import Generator


@pytest.fixture(autouse=True)
def _widen_audio_path_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    """Widen the sanitizer prefix so NamedTemporaryFile paths are accepted.

    The production diarize.py constrains audio_path to be under
    VIDEO_DATA_ROOT or AUDIO_OUTPUT_ROOT (CodeQL-recognized
    StartswithCall sanitizer). Tests place fixtures under the system
    temp dir, so we monkeypatch the prefix to point at that dir for
    the duration of each test.
    """
    tempdir = os.path.realpath(tempfile.gettempdir()) + os.sep
    monkeypatch.setattr(diarize_route, "_VIDEO_DATA_PREFIX", tempdir)
    monkeypatch.setattr(diarize_route, "_AUDIO_OUTPUT_PREFIX", tempdir)


class FakeDiarizationModel:
    """Records calls to ``diarize`` and returns canned segments."""

    def __init__(
        self,
        segments: list[SpeakerSegment] | None = None,
        raises: Exception | None = None,
    ) -> None:
        self._segments = segments if segments is not None else []
        self._raises = raises
        self.last_audio_path: str | None = None
        self.call_count = 0

    def diarize(self, audio_path: str) -> DiarizationResult:
        self.call_count += 1
        self.last_audio_path = audio_path
        if self._raises is not None:
            raise self._raises
        unique_speakers = sorted({seg.speaker for seg in self._segments})
        return DiarizationResult(
            segments=self._segments,
            num_speakers=len(unique_speakers),
            speakers=unique_speakers,
        )


class FakeSelectedConfig:
    """Stand-in for the resolved model option."""

    def __init__(self, model_id: str) -> None:
        self.model_id = model_id


class FakeTaskConfig:
    """Stand-in for a task entry in ``ModelManager.tasks``."""

    def __init__(self, model_id: str) -> None:
        self._selected = FakeSelectedConfig(model_id)

    def get_selected_config(self) -> FakeSelectedConfig:
        return self._selected


class FakeModelManager:
    """In-memory ``ModelManager`` substitute the route can depend on."""

    def __init__(
        self,
        *,
        model: FakeDiarizationModel | None = None,
        include_task: bool = True,
        model_id: str = "pyannote/speaker-diarization-3.1",
        load_raises: Exception | None = None,
    ) -> None:
        self.tasks: dict[str, FakeTaskConfig] = {}
        if include_task:
            self.tasks["speaker_diarization"] = FakeTaskConfig(model_id)
        self._model = model
        self._load_raises = load_raises
        self.load_calls: list[str] = []

    async def load_model(self, task_name: str) -> FakeDiarizationModel:
        self.load_calls.append(task_name)
        if self._load_raises is not None:
            raise self._load_raises
        assert self._model is not None
        return self._model


@pytest.fixture
def audio_file() -> Generator[str, None, None]:
    """Yield a path to a temp audio file that actually exists on disk."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(b"RIFF\x00\x00\x00\x00WAVEfmt ")
        path = tmp.name
    try:
        yield path
    finally:
        Path(path).unlink(missing_ok=True)


def _client_with(manager: FakeModelManager) -> TestClient:
    """Build a TestClient with the model-manager dependency overridden."""
    app.dependency_overrides[get_model_manager] = lambda: manager
    return TestClient(app, base_url="http://testserver")


@pytest.fixture(autouse=True)
def _clear_overrides() -> Generator[None, None, None]:
    """Ensure dependency overrides do not leak between tests."""
    yield
    app.dependency_overrides.clear()


class TestHappyPath:
    """Successful diarization request produces ordered, deduped speakers."""

    def test_returns_segments_and_first_appearance_speaker_order(self, audio_file: str) -> None:
        segments = [
            SpeakerSegment(speaker="SPEAKER_00", start=0.0, end=1.5),
            SpeakerSegment(speaker="SPEAKER_01", start=1.5, end=3.0),
            SpeakerSegment(speaker="SPEAKER_00", start=3.0, end=4.2),
        ]
        model = FakeDiarizationModel(segments=segments)
        manager = FakeModelManager(model=model)
        client = _client_with(manager)

        response = client.post("/api/diarize", json={"audio_path": audio_file})

        assert response.status_code == 200
        body = response.json()
        assert body["segments"] == [
            {"speaker": "SPEAKER_00", "start": 0.0, "end": 1.5},
            {"speaker": "SPEAKER_01", "start": 1.5, "end": 3.0},
            {"speaker": "SPEAKER_00", "start": 3.0, "end": 4.2},
        ]
        assert body["speakers"] == ["SPEAKER_00", "SPEAKER_01"]
        assert body["processing_time"] >= 0
        assert body["model_used"] == "pyannote/speaker-diarization-3.1"


class TestErrorPaths:
    """404 / 500 translation for the four failure branches."""

    def test_missing_audio_file_returns_404(self) -> None:
        manager = FakeModelManager(model=FakeDiarizationModel())
        client = _client_with(manager)

        # Path under the sanitizer-accepted root (tempdir per the autouse
        # fixture) but pointing at a file that does not exist on disk.
        missing_path = os.path.join(tempfile.gettempdir(), "nonexistent-audio.wav")
        response = client.post("/api/diarize", json={"audio_path": missing_path})

        assert response.status_code == 404
        assert missing_path in response.json()["detail"]

    def test_missing_task_returns_500(self, audio_file: str) -> None:
        manager = FakeModelManager(include_task=False)
        client = _client_with(manager)

        response = client.post("/api/diarize", json={"audio_path": audio_file})

        assert response.status_code == 500
        assert "speaker_diarization" in response.json()["detail"]

    def test_load_model_failure_returns_500(self, audio_file: str) -> None:
        manager = FakeModelManager(load_raises=RuntimeError("checkpoint missing"))
        client = _client_with(manager)

        response = client.post("/api/diarize", json={"audio_path": audio_file})

        assert response.status_code == 500
        assert "checkpoint missing" in response.json()["detail"]

    def test_diarize_failure_returns_500(self, audio_file: str) -> None:
        model = FakeDiarizationModel(raises=RuntimeError("cuda oom"))
        manager = FakeModelManager(model=model)
        client = _client_with(manager)

        response = client.post("/api/diarize", json={"audio_path": audio_file})

        assert response.status_code == 500
        assert "cuda oom" in response.json()["detail"]


class TestSpeakerCountForwarding:
    """Per-request speaker-count hints reach the loader as a warning, not kwargs."""

    def test_speaker_count_hints_log_a_warning_but_diarize_signature_stays_clean(
        self, audio_file: str, caplog: pytest.LogCaptureFixture
    ) -> None:
        model = FakeDiarizationModel(segments=[])
        manager = FakeModelManager(model=model)
        client = _client_with(manager)

        with caplog.at_level(
            logging.WARNING,
            logger="src.infrastructure.adapters.inbound.fastapi.routes.diarize",
        ):
            response = client.post(
                "/api/diarize",
                json={
                    "audio_path": audio_file,
                    "num_speakers": 3,
                    "min_speakers": 2,
                    "max_speakers": 5,
                },
            )

        assert response.status_code == 200
        assert model.call_count == 1
        # The route resolves audio_path through os.path.realpath as part of the
        # path-traversal sanitizer, so compare realpaths rather than raw strings
        # (on macOS /tmp resolves to /private/tmp).
        assert model.last_audio_path == os.path.realpath(audio_file)
        # The warning text carries all three hint values so a deployer
        # debugging "why isn't num_speakers honoured?" sees them.
        warning_text = "\n".join(r.message for r in caplog.records)
        assert "num=3" in warning_text
        assert "min=2" in warning_text
        assert "max=5" in warning_text

    def test_omitted_hints_produce_no_warning(
        self, audio_file: str, caplog: pytest.LogCaptureFixture
    ) -> None:
        model = FakeDiarizationModel(segments=[])
        manager = FakeModelManager(model=model)
        client = _client_with(manager)

        with caplog.at_level(
            logging.WARNING,
            logger="src.infrastructure.adapters.inbound.fastapi.routes.diarize",
        ):
            response = client.post("/api/diarize", json={"audio_path": audio_file})

        assert response.status_code == 200
        assert all("per-request speaker-count hints" not in r.message for r in caplog.records)
