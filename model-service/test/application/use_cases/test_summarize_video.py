"""Tests for SummarizeVideoUseCase."""

from __future__ import annotations

import numpy as np
import pytest

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.dto.summarization import SummarizeRequestDTO
from src.application.ports.outbound.frame_sampler import VideoMetadataDTO
from src.application.ports.outbound.transcriber import TranscriptionResultDTO, TranscriptSegmentDTO
from src.application.use_cases.summarize_video import (
    SummarizationError,
    SummarizeVideoUseCase,
    calculate_frame_sample_count,
    get_default_prompt_template,
    get_persona_prompt,
    identify_key_frames,
    parse_vlm_response,
)
from test.application.fakes import (
    FakeExternalAPIRouter,
    FakeFrameSampler,
    FakeTranscriber,
    FakeVisionLanguageModel,
)


def _request(enable_audio: bool = False) -> SummarizeRequestDTO:
    return SummarizeRequestDTO(
        video_id="v1",
        persona_id="p1",
        max_frames=3,
        enable_audio=enable_audio,
        fusion_strategy="sequential",
    )


def _sampler_with_frames(num: int = 3) -> FakeFrameSampler:
    return FakeFrameSampler(
        metadata=VideoMetadataDTO(frame_count=90, fps=30.0, duration=3.0),
        frames=[(i * 30, np.zeros((32, 32, 3), dtype=np.uint8)) for i in range(num)],
    )


@pytest.mark.asyncio
async def test_execute_with_vlm_happy_path() -> None:
    vlm = FakeVisionLanguageModel(
        canned_text="1. Summary: A short summary.\n2. Visual Analysis: Objects observed."
    )
    sampler = _sampler_with_frames(3)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)

    response = await use_case.execute_with_vlm(
        request=_request(),
        video_path="/fake.mp4",
        model_name="fake-vlm",
        persona_role="Analyst",
        information_need="Understand content",
    )

    assert response.video_id == "v1"
    assert response.persona_id == "p1"
    assert response.summary
    assert response.visual_model_used == "fake-vlm"
    assert response.key_frames
    assert not vlm.is_loaded


@pytest.mark.asyncio
async def test_execute_with_vlm_raises_without_vlm_port() -> None:
    sampler = _sampler_with_frames(1)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler)
    with pytest.raises(RuntimeError, match="Vision-language model"):
        await use_case.execute_with_vlm(
            request=_request(), video_path="/fake.mp4", model_name="m"
        )


@pytest.mark.asyncio
async def test_execute_with_vlm_no_frames_raises() -> None:
    vlm = FakeVisionLanguageModel()
    sampler = FakeFrameSampler(
        metadata=VideoMetadataDTO(frame_count=0, fps=30.0, duration=0.0),
        frames=[],
    )
    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)
    with pytest.raises(SummarizationError, match="No frames"):
        await use_case.execute_with_vlm(
            request=_request(), video_path="/fake.mp4", model_name="m"
        )


@pytest.mark.asyncio
async def test_execute_with_vlm_propagates_generation_error() -> None:
    vlm = FakeVisionLanguageModel(raise_on_generate=RuntimeError("vlm failed"))
    sampler = _sampler_with_frames(2)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)
    with pytest.raises(SummarizationError, match="Summarization failed"):
        await use_case.execute_with_vlm(
            request=_request(), video_path="/fake.mp4", model_name="m"
        )
    assert not vlm.is_loaded


@pytest.mark.asyncio
async def test_execute_with_vlm_audio_enabled_requires_transcriber() -> None:
    vlm = FakeVisionLanguageModel()
    sampler = _sampler_with_frames(2)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)
    with pytest.raises(SummarizationError, match="transcriber"):
        await use_case.execute_with_vlm(
            request=_request(enable_audio=True),
            video_path="/fake.mp4",
            model_name="m",
        )


@pytest.mark.asyncio
async def test_execute_with_vlm_audio_enabled_full_pipeline() -> None:
    vlm = FakeVisionLanguageModel(
        canned_text="1. Summary: short.\n2. Visual Analysis: stuff."
    )
    sampler = _sampler_with_frames(2)
    transcriber = FakeTranscriber(
        result=TranscriptionResultDTO(
            text="spoken content",
            segments=[
                TranscriptSegmentDTO(start=0.0, end=1.0, text="spoken content", confidence=0.9)
            ],
            language="en",
            speaker_count=1,
            processing_time=0.1,
        )
    )
    use_case = SummarizeVideoUseCase(
        frame_sampler=sampler,
        vision_language_model=vlm,
        transcriber=transcriber,
    )
    response = await use_case.execute_with_vlm(
        request=_request(enable_audio=True),
        video_path="/fake.mp4",
        model_name="fake-vlm",
    )
    assert response.audio_transcript == "spoken content"
    assert response.audio_language == "en"
    assert response.speaker_count == 1
    assert response.fusion_strategy == "sequential"


@pytest.mark.asyncio
async def test_execute_with_external_api_happy_path() -> None:
    router = FakeExternalAPIRouter(
        images_response="1. Summary: short.\n2. Visual Analysis: stuff."
    )
    sampler = _sampler_with_frames(3)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler, external_router=router)
    config = ExternalAPIConfigDTO(
        api_key="k", api_endpoint="http://x", model_id="m", provider="anthropic"
    )

    response = await use_case.execute_with_external_api(
        request=_request(),
        video_path="/fake.mp4",
        api_config=config,
        provider="anthropic",
    )
    assert response.visual_model_used == "anthropic"
    assert router.closed


@pytest.mark.asyncio
async def test_execute_with_external_api_requires_router() -> None:
    sampler = _sampler_with_frames(1)
    use_case = SummarizeVideoUseCase(frame_sampler=sampler)
    config = ExternalAPIConfigDTO(
        api_key="k", api_endpoint="http://x", model_id="m", provider="anthropic"
    )
    with pytest.raises(RuntimeError, match="External API router"):
        await use_case.execute_with_external_api(
            request=_request(),
            video_path="/fake.mp4",
            api_config=config,
            provider="anthropic",
        )


def test_parse_vlm_response_with_markers() -> None:
    text = "1. A summary. 2. Visual Analysis: detail."
    summary, analysis = parse_vlm_response(text)
    assert "summary" in summary.lower()
    assert analysis is not None


def test_parse_vlm_response_no_markers() -> None:
    summary, analysis = parse_vlm_response("just text")
    assert summary == "just text"
    assert analysis is None


def test_identify_key_frames_limits() -> None:
    frames = [(i, np.zeros((2, 2, 3), dtype=np.uint8)) for i in range(10)]
    key_frames = identify_key_frames(frames, video_fps=30.0, num_key_frames=3)
    assert len(key_frames) == 3


def test_identify_key_frames_few_frames() -> None:
    frames = [(0, np.zeros((2, 2, 3), dtype=np.uint8))]
    key_frames = identify_key_frames(frames, video_fps=30.0, num_key_frames=5)
    assert len(key_frames) == 1


def test_calculate_frame_sample_count_respects_provider() -> None:
    assert calculate_frame_sample_count(total_frames=100, provider="openai", max_frames=50) == 10
    assert (
        calculate_frame_sample_count(total_frames=100, provider="anthropic", max_frames=50) == 20
    )
    assert (
        calculate_frame_sample_count(total_frames=5, provider="google", max_frames=50) == 5
    )


def test_get_persona_prompt_defaults() -> None:
    prompt = get_persona_prompt()
    assert "Analyst" in prompt


def test_get_default_prompt_template_non_empty() -> None:
    assert "persona" in get_default_prompt_template().lower()
