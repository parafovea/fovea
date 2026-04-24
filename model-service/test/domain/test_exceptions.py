"""Tests for the domain exception hierarchy.

Exercises every exception class in :mod:`src.domain.exceptions`: the
stored attribute payload, the formatted message, the parent chain, and
for the branch-heavy subclasses (``ModelNotLoadedError``,
``InvalidTaskTypeError``, ``ExternalAPIError``) each optional parameter
path.
"""

from __future__ import annotations

import pytest

from src.domain.exceptions import (
    AudioProcessingError,
    ClaimExtractionError,
    ClaimSynthesisError,
    ConfigurationError,
    DomainError,
    ExternalAPIError,
    InferenceError,
    InsufficientMemoryError,
    InvalidTaskTypeError,
    ModelLoadError,
    ModelNotLoadedError,
    OntologyAugmentationError,
    VideoNotFoundError,
    VideoProcessingError,
)


class TestDomainError:
    """The base class stores ``message`` and is catchable as ``Exception``."""

    def test_stores_message(self) -> None:
        err = DomainError("boom")
        assert err.message == "boom"
        assert str(err) == "boom"

    def test_catchable_as_exception(self) -> None:
        with pytest.raises(Exception, match="boom"):
            raise DomainError("boom")


class TestVideoNotFoundError:
    def test_formats_video_id_into_message(self) -> None:
        err = VideoNotFoundError("abc123")
        assert err.video_id == "abc123"
        assert "Video not found: abc123" in str(err)

    def test_inherits_from_domain_error(self) -> None:
        err = VideoNotFoundError("abc")
        assert isinstance(err, DomainError)


class TestVideoProcessingError:
    def test_formats_video_and_reason(self) -> None:
        err = VideoProcessingError("abc", "codec unsupported")
        assert err.video_id == "abc"
        assert err.reason == "codec unsupported"
        assert "Failed to process video abc: codec unsupported" in str(err)


class TestModelNotLoadedError:
    """Covers the optional ``model_id`` branch in the message."""

    def test_without_model_id(self) -> None:
        err = ModelNotLoadedError("object_detection")
        assert err.task_type == "object_detection"
        assert err.model_id is None
        assert str(err) == "Model not loaded for task: object_detection"

    def test_with_model_id(self) -> None:
        err = ModelNotLoadedError("object_detection", "yolov11")
        assert err.model_id == "yolov11"
        assert "(model_id: yolov11)" in str(err)


class TestModelLoadError:
    def test_formats_model_and_reason(self) -> None:
        err = ModelLoadError("yolov11", "weights download failed")
        assert err.model_id == "yolov11"
        assert err.reason == "weights download failed"
        assert "Failed to load model yolov11: weights download failed" in str(err)


class TestInsufficientMemoryError:
    def test_formats_memory_deficit(self) -> None:
        err = InsufficientMemoryError("llama", 48.0, 24.5)
        assert err.model_id == "llama"
        assert err.required_gb == 48.0
        assert err.available_gb == 24.5
        assert "requires 48.0GB" in str(err)
        assert "available 24.5GB" in str(err)


class TestInferenceError:
    def test_formats_task_and_reason(self) -> None:
        err = InferenceError("object_detection", "CUDA OOM")
        assert err.task_type == "object_detection"
        assert err.reason == "CUDA OOM"
        assert "Inference failed for object_detection: CUDA OOM" in str(err)


class TestConfigurationError:
    def test_formats_config_key_and_reason(self) -> None:
        err = ConfigurationError("model_config_path", "file missing")
        assert err.config_key == "model_config_path"
        assert err.reason == "file missing"
        assert "Invalid configuration 'model_config_path': file missing" in str(err)


class TestInvalidTaskTypeError:
    """Covers the optional ``valid_types`` list branch."""

    def test_without_valid_types(self) -> None:
        err = InvalidTaskTypeError("foo")
        assert err.task_type == "foo"
        assert err.valid_types is None
        assert str(err) == "Invalid task type: foo"

    def test_with_valid_types_lists_options(self) -> None:
        err = InvalidTaskTypeError("foo", ["detection", "tracking"])
        assert err.valid_types == ["detection", "tracking"]
        assert "Valid types: detection, tracking" in str(err)

    def test_empty_valid_types_list_omits_suffix(self) -> None:
        err = InvalidTaskTypeError("foo", [])
        # Empty list is falsy — should behave like the None case.
        assert str(err) == "Invalid task type: foo"


class TestExternalAPIError:
    """Covers the optional ``status_code`` branch."""

    def test_without_status_code(self) -> None:
        err = ExternalAPIError("anthropic", "rate limited")
        assert err.provider == "anthropic"
        assert err.status_code is None
        assert str(err) == "External API error (anthropic): rate limited"

    def test_with_status_code(self) -> None:
        err = ExternalAPIError("anthropic", "rate limited", status_code=429)
        assert err.status_code == 429
        assert "(status: 429)" in str(err)

    def test_status_code_zero_suppressed(self) -> None:
        # ``if status_code`` collapses 0 as well, matching the "not provided"
        # branch — this documents that intentional behavior.
        err = ExternalAPIError("anthropic", "unknown", status_code=0)
        assert "status" not in str(err).lower()


class TestAudioProcessingError:
    def test_formats_path_and_reason(self) -> None:
        err = AudioProcessingError("/videos/a.wav", "ffmpeg segfault")
        assert err.audio_path == "/videos/a.wav"
        assert err.reason == "ffmpeg segfault"
        assert "Failed to process audio /videos/a.wav: ffmpeg segfault" in str(err)


class TestOntologyAugmentationError:
    def test_formats_category_and_reason(self) -> None:
        err = OntologyAugmentationError("entity", "LLM timeout")
        assert err.category == "entity"
        assert err.reason == "LLM timeout"
        assert "Ontology augmentation failed for entity: LLM timeout" in str(err)


class TestClaimExtractionError:
    def test_formats_summary_id_and_reason(self) -> None:
        err = ClaimExtractionError("sum-1", "json parse failed")
        assert err.summary_id == "sum-1"
        assert err.reason == "json parse failed"
        assert "Claim extraction failed for summary sum-1: json parse failed" in str(err)


class TestClaimSynthesisError:
    def test_formats_summary_id_and_reason(self) -> None:
        err = ClaimSynthesisError("sum-2", "empty response")
        assert err.summary_id == "sum-2"
        assert err.reason == "empty response"
        assert "Claim synthesis failed for summary sum-2: empty response" in str(err)


class TestHierarchy:
    """Every subclass is catchable via ``DomainError``."""

    @pytest.mark.parametrize(
        "factory",
        [
            lambda: VideoNotFoundError("v"),
            lambda: VideoProcessingError("v", "r"),
            lambda: ModelNotLoadedError("t"),
            lambda: ModelLoadError("m", "r"),
            lambda: InsufficientMemoryError("m", 1.0, 0.5),
            lambda: InferenceError("t", "r"),
            lambda: ConfigurationError("k", "r"),
            lambda: InvalidTaskTypeError("t"),
            lambda: ExternalAPIError("p", "r"),
            lambda: AudioProcessingError("a", "r"),
            lambda: OntologyAugmentationError("c", "r"),
            lambda: ClaimExtractionError("s", "r"),
            lambda: ClaimSynthesisError("s", "r"),
        ],
    )
    def test_all_subclasses_are_domain_errors(self, factory: object) -> None:
        assert isinstance(factory(), DomainError)  # type: ignore[operator]
