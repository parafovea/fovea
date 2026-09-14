"""Tests for the default task factories exposed by ``infrastructure.config``.

Each factory constructs a concrete loader, configures it, and calls
``.load()``. The real loaders depend on heavy ML packages, so these tests
patch the loader classes at the import site and assert on the arguments
the factory threads through.
"""

from __future__ import annotations

import pytest

pytest.importorskip("torch")  # requires the ML backend; skipped in the torch-free venv

from unittest.mock import MagicMock, patch

import pytest

from src.domain.entities import ModelConfig
from src.domain.entities.architectures import Whisper
from src.infrastructure.config.task_factories import (
    _device,
    build_default_task_factories,
)


def _make_model_config(**overrides: object) -> ModelConfig:
    """Build a ``ModelConfig`` with sensible defaults for factory tests.

    Every ``ModelConfig`` carries an architecture; per-task tests pass
    the architecture that matches the task under test by overriding
    ``architecture=``. The default below pins Whisper because the
    factory tests that use the default-overridden config are audio
    tasks (speaker_diarization, voice_activity_detection); detection,
    tracking, audio-transcription, llm, and vlm tests pass concrete
    architectures via ``overrides``.
    """
    defaults: dict[str, object] = {
        "model_id": "vendor/model",
        "framework": "whisper",
        "architecture": Whisper(),
        "vram_gb": 0,
        "cpu_memory_gb": 0.0,
        "cpu_compatible": True,
        "speed": "fast",
        "description": "",
    }
    defaults.update(overrides)
    return ModelConfig(**defaults)  # type: ignore[arg-type]


class TestDeviceDispatch:
    """``_device`` picks CUDA when available, CPU otherwise."""

    def test_cuda_available_returns_cuda(self) -> None:
        with patch("torch.cuda.is_available", return_value=True):
            assert _device() == "cuda"

    def test_cuda_unavailable_returns_cpu(self) -> None:
        with patch("torch.cuda.is_available", return_value=False):
            assert _device() == "cpu"


class TestRegistry:
    """``build_default_task_factories`` exposes the expected task set."""

    def test_registry_keys_match_expected_tasks(self) -> None:
        registry = build_default_task_factories()
        assert set(registry.keys()) == {
            "audio_transcription",
            "speaker_diarization",
            "voice_activity_detection",
            "object_detection",
            "object_tracking",
        }

    def test_registry_values_are_callables(self) -> None:
        registry = build_default_task_factories()
        for task_name, factory in registry.items():
            assert callable(factory), f"{task_name} factory is not callable"


class TestAudioTranscriptionFactory:
    """Framework-map lookup + TranscriptionConfig wiring."""

    @pytest.mark.parametrize(
        "framework_hint,expected_enum_name",
        [
            ("whisper", "WHISPER"),
            ("faster_whisper", "FASTER_WHISPER"),
            ("transformers", "TRANSFORMERS"),
            ("nemo_canary", "NEMO_CANARY"),
            ("nemo_parakeet", "NEMO_PARAKEET"),
            ("whisperx", "WHISPERX"),
            ("unknown_framework", "WHISPER"),  # falls through to default
        ],
    )
    def test_maps_framework_hint_to_enum(
        self, framework_hint: str, expected_enum_name: str
    ) -> None:
        loader = MagicMock()
        config_cls = MagicMock()
        framework_enum = MagicMock(spec=[])
        # Each enum name becomes an attribute on the mocked ``AudioFramework``.
        for name in [
            "WHISPER",
            "FASTER_WHISPER",
            "TRANSFORMERS",
            "NEMO_CANARY",
            "NEMO_PARAKEET",
            "WHISPERX",
        ]:
            setattr(framework_enum, name, name)

        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.audio.loader": MagicMock(
                    AudioFramework=framework_enum,
                    TranscriptionConfig=config_cls,
                    create_audio_loader=MagicMock(return_value=loader),
                )
            },
        ):
            registry = build_default_task_factories()
            factory = registry["audio_transcription"]
            returned = factory(_make_model_config(framework=framework_hint, architecture=Whisper()))

        assert returned is loader
        loader.load.assert_called_once()
        config_call_kwargs = config_cls.call_args.kwargs
        assert config_call_kwargs["framework"] == expected_enum_name
        assert config_call_kwargs["model_id"] == "vendor/model"

    def test_compute_type_matches_device(self) -> None:
        loader = MagicMock()
        config_cls = MagicMock()

        framework_enum = MagicMock()
        for name in [
            "WHISPER",
            "FASTER_WHISPER",
            "TRANSFORMERS",
            "NEMO_CANARY",
            "NEMO_PARAKEET",
            "WHISPERX",
        ]:
            setattr(framework_enum, name, name)

        loader_module = MagicMock(
            AudioFramework=framework_enum,
            TranscriptionConfig=config_cls,
            create_audio_loader=MagicMock(return_value=loader),
        )
        with patch.dict(
            "sys.modules",
            {"src.infrastructure.adapters.outbound.models.audio.loader": loader_module},
        ):
            registry = build_default_task_factories()

            with patch("torch.cuda.is_available", return_value=True):
                registry["audio_transcription"](_make_model_config(architecture=Whisper()))
            assert config_cls.call_args.kwargs["compute_type"] == "float16"

            config_cls.reset_mock()
            with patch("torch.cuda.is_available", return_value=False):
                registry["audio_transcription"](_make_model_config(architecture=Whisper()))
            assert config_cls.call_args.kwargs["compute_type"] == "int8"


class TestSpeakerDiarizationFactory:
    """PyannoteLoader is constructed with a DiarizationConfig."""

    def test_constructs_pyannote_loader(self) -> None:
        loader = MagicMock()
        pyannote_cls = MagicMock(return_value=loader)
        config_cls = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.audio.loader": MagicMock(
                    DiarizationConfig=config_cls,
                    PyannoteLoader=pyannote_cls,
                )
            },
        ):
            registry = build_default_task_factories()
            returned = registry["speaker_diarization"](
                _make_model_config(model_id="pyannote/speaker-diarization-3.1")
            )

        assert returned is loader
        pyannote_cls.assert_called_once()
        loader.load.assert_called_once()
        assert config_cls.call_args.kwargs["model_id"] == "pyannote/speaker-diarization-3.1"


class TestVADFactory:
    """SileroVADLoader is constructed with a VADConfig."""

    def test_constructs_silero_loader(self) -> None:
        loader = MagicMock()
        silero_cls = MagicMock(return_value=loader)
        config_cls = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.audio.loader": MagicMock(
                    SileroVADLoader=silero_cls,
                    VADConfig=config_cls,
                )
            },
        ):
            registry = build_default_task_factories()
            returned = registry["voice_activity_detection"](
                _make_model_config(model_id="snakers4/silero-vad")
            )

        assert returned is loader
        silero_cls.assert_called_once()
        loader.load.assert_called_once()
        assert config_cls.call_args.kwargs["model_id"] == "snakers4/silero-vad"


class TestObjectDetectionFactory:
    """Framework-map lookup + DetectionConfig wiring."""

    @pytest.mark.parametrize(
        "framework_hint,expected_enum_name",
        [
            ("pytorch", "PYTORCH"),
            ("ultralytics", "ULTRALYTICS"),
            ("transformers", "TRANSFORMERS"),
            ("onnx", "ONNX"),
            ("unknown_framework", "PYTORCH"),
        ],
    )
    def test_maps_framework_hint_to_enum(
        self, framework_hint: str, expected_enum_name: str
    ) -> None:
        loader = MagicMock()
        config_cls = MagicMock()
        framework_enum = MagicMock(spec=[])
        for name in ["PYTORCH", "ULTRALYTICS", "TRANSFORMERS", "ONNX"]:
            setattr(framework_enum, name, name)

        from src.domain.entities.architectures import YOLOWorld

        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.detection.loader": MagicMock(
                    DetectionConfig=config_cls,
                    DetectionFramework=framework_enum,
                    create_detection_loader=MagicMock(return_value=loader),
                )
            },
        ):
            registry = build_default_task_factories()
            registry["object_detection"](
                _make_model_config(
                    framework=framework_hint,
                    model_id="model",
                    architecture=YOLOWorld(),
                )
            )

        assert config_cls.call_args.kwargs["framework"] == expected_enum_name
        loader.load.assert_called_once()

    def test_wrong_family_architecture_raises(self) -> None:
        """A ModelConfig whose architecture belongs to another family must
        fail loudly: Whisper (audio) is not a DetectionArchitecture and
        the detection registry raises UnknownArchitectureError naming the
        registered detection architectures."""
        from src.infrastructure.adapters.outbound.models.registry import (
            UnknownArchitectureError,
        )

        registry = build_default_task_factories()
        with pytest.raises(UnknownArchitectureError) as exc_info:
            registry["object_detection"](_make_model_config(framework="pytorch", model_id="model"))
        assert exc_info.value.family.startswith("detection")
        assert "Whisper" in str(exc_info.value)


class TestObjectTrackingFactory:
    """Tracking factory dispatches between SAM3 and the generic tracker."""

    def test_sam3_path_returns_adapter(self) -> None:
        sam3_loader = MagicMock()
        sam3_cls = MagicMock(return_value=sam3_loader)
        adapter = MagicMock()
        adapter_cls = MagicMock(return_value=adapter)
        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.sam3": MagicMock(
                    SAM3Loader=sam3_cls,
                    SAM3TrackingAdapter=adapter_cls,
                )
            },
        ):
            registry = build_default_task_factories()
            returned = registry["object_tracking"](
                _make_model_config(framework="sam3", model_id="facebook/sam-3.1")
            )

        assert returned is adapter
        sam3_cls.assert_called_once()
        adapter_cls.assert_called_once_with(sam3_loader)
        sam3_loader.load.assert_called_once()

    def test_generic_tracking_path_uses_create_tracking_loader(self) -> None:
        from src.domain.entities.architectures import SAM2

        loader = MagicMock()
        config_cls = MagicMock()
        create_fn = MagicMock(return_value=loader)
        with patch.dict(
            "sys.modules",
            {
                "src.infrastructure.adapters.outbound.models.tracking.loader": MagicMock(
                    TrackingConfig=config_cls,
                    create_tracking_loader=create_fn,
                )
            },
        ):
            registry = build_default_task_factories()
            architecture = SAM2()
            returned = registry["object_tracking"](
                _make_model_config(
                    framework="pytorch",
                    model_id="sam2",
                    architecture=architecture,
                )
            )

        assert returned is loader
        loader.load.assert_called_once()
        assert config_cls.call_args.kwargs["model_id"] == "sam2"
        # The factory must thread the parsed architecture through to the
        # registry-backed create_tracking_loader; never inspect model_id.
        assert create_fn.call_args.args[0] is architecture

    def test_generic_tracking_path_wrong_family_architecture_raises(self) -> None:
        """A tracking ModelConfig that carries an architecture from another family
        must be rejected before reaching the registry. Whisper (audio) is not a
        TrackingArchitecture."""
        registry = build_default_task_factories()
        with pytest.raises(ValueError, match="not a tracking architecture"):
            registry["object_tracking"](
                _make_model_config(framework="pytorch", model_id="sam2"),
            )

    def test_generic_tracking_path_rejects_non_tracking_architecture(self) -> None:
        """An architecture from another family fails before reaching the registry."""
        from src.domain.entities.architectures import QwenLLM

        registry = build_default_task_factories()
        with pytest.raises(ValueError, match="not a tracking architecture"):
            registry["object_tracking"](
                _make_model_config(
                    framework="pytorch",
                    model_id="sam2",
                    architecture=QwenLLM(),
                ),
            )
