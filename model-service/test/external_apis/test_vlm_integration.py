"""Tests for VLM external API integration in video summarization."""

import io
from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest
from PIL import Image

from src.application.dto.external_api import ExternalAPIConfigDTO
from src.application.dto.reasoning import ReasonedText
from src.application.dto.summarization import SummarizeRequestDTO
from src.application.ports.outbound.frame_sampler import VideoMetadataDTO
from src.application.use_cases.summarize_video import (
    SummarizationError,
    SummarizeVideoUseCase,
    calculate_frame_sample_count,
    convert_image_to_base64,
    get_external_api_prompt,
)


class TestFrameSampling:
    """Tests for frame sampling logic."""

    def test_calculate_frame_sample_count_respects_anthropic_limit(self) -> None:
        """Test that Anthropic provider limit of 20 frames is respected."""
        assert (
            calculate_frame_sample_count(total_frames=1000, provider="anthropic", max_frames=50)
            == 20
        )

    def test_calculate_frame_sample_count_respects_openai_limit(self) -> None:
        """Test that OpenAI provider limit of 10 frames is respected."""
        assert (
            calculate_frame_sample_count(total_frames=1000, provider="openai", max_frames=50) == 10
        )

    def test_calculate_frame_sample_count_respects_google_limit(self) -> None:
        """Test that Google provider limit of 50 frames is respected."""
        assert (
            calculate_frame_sample_count(total_frames=1000, provider="google", max_frames=100) == 50
        )

    def test_calculate_frame_sample_count_respects_total_frames(self) -> None:
        """Test that total frames is respected when below provider limit."""
        assert (
            calculate_frame_sample_count(total_frames=5, provider="anthropic", max_frames=20) == 5
        )

    def test_calculate_frame_sample_count_respects_user_max(self) -> None:
        """Test that user-requested max is respected when below provider limit."""
        assert (
            calculate_frame_sample_count(total_frames=1000, provider="anthropic", max_frames=15)
            == 15
        )

    def test_calculate_frame_sample_count_unknown_provider_defaults_to_10(self) -> None:
        """Test that unknown provider defaults to 10 frames."""
        assert (
            calculate_frame_sample_count(
                total_frames=1000, provider="unknown_provider", max_frames=50
            )
            == 10
        )


class TestImageConversion:
    """Tests for image conversion to base64."""

    def test_convert_image_to_base64_preserves_small_images(self) -> None:
        """Test that small images are not resized."""
        image = Image.new("RGB", (512, 512), color="red")
        result = convert_image_to_base64(image, format="JPEG", max_dimension=1024)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_convert_image_to_base64_resizes_large_images(self) -> None:
        """Test that large images are resized to max_dimension."""
        image = Image.new("RGB", (2048, 2048), color="blue")
        result = convert_image_to_base64(image, format="JPEG", max_dimension=1024)
        result_image = Image.open(io.BytesIO(result))
        assert max(result_image.size) <= 1024

    def test_convert_image_to_base64_maintains_aspect_ratio(self) -> None:
        """Test that aspect ratio is maintained during resize."""
        image = Image.new("RGB", (2000, 1000), color="green")
        result = convert_image_to_base64(image, format="JPEG", max_dimension=1024)
        result_image = Image.open(io.BytesIO(result))
        original_ratio = 2000 / 1000
        result_ratio = result_image.width / result_image.height
        assert abs(original_ratio - result_ratio) < 0.01

    def test_convert_image_to_base64_supports_png(self) -> None:
        """Test that PNG format is supported."""
        image = Image.new("RGB", (512, 512), color="yellow")
        result = convert_image_to_base64(image, format="PNG", max_dimension=1024)
        result_image = Image.open(io.BytesIO(result))
        assert result_image.format == "PNG"


class TestPromptGeneration:
    """Tests for external API prompt generation."""

    def test_get_external_api_prompt_includes_frame_count(self) -> None:
        """Test that prompt includes frame count."""
        prompt = get_external_api_prompt(
            frame_count=10,
            duration=30.0,
            timestamps=[0.0, 3.0, 6.0, 9.0, 12.0, 15.0, 18.0, 21.0, 24.0, 27.0],
        )
        assert "10 frames" in prompt

    def test_get_external_api_prompt_includes_duration(self) -> None:
        """Test that prompt includes video duration."""
        prompt = get_external_api_prompt(
            frame_count=5,
            duration=42.5,
            timestamps=[0.0, 10.0, 20.0, 30.0, 40.0],
        )
        assert "42.5 seconds" in prompt

    def test_get_external_api_prompt_includes_timestamps(self) -> None:
        """Test that prompt includes frame timestamps."""
        prompt = get_external_api_prompt(frame_count=3, duration=15.0, timestamps=[0.0, 5.5, 11.0])
        assert "0.0s" in prompt
        assert "5.5s" in prompt
        assert "11.0s" in prompt

    def test_get_external_api_prompt_includes_instructions(self) -> None:
        """Test that prompt includes analysis instructions."""
        prompt = get_external_api_prompt(
            frame_count=5,
            duration=20.0,
            timestamps=[0.0, 5.0, 10.0, 15.0, 20.0],
        )
        assert "What is happening in the video" in prompt
        assert "Key objects, people, and actions" in prompt
        assert "Scene changes" in prompt


def _make_frame_sampler(metadata: VideoMetadataDTO, frames: list[tuple[int, np.ndarray]]) -> Mock:
    """Build a frame sampler mock with canned metadata and frames."""
    sampler = Mock()
    sampler.get_video_metadata.return_value = metadata
    sampler.extract_frames_uniform.return_value = frames
    return sampler


class TestExternalAPISummarization:
    """Tests for external API video summarization."""

    @pytest.mark.asyncio
    async def test_summarize_video_with_external_api_success(self) -> None:
        """Test successful video summarization with external API."""
        request = SummarizeRequestDTO(
            video_id="test_video",
            persona_id="test_persona",
            max_frames=10,
        )
        api_config = ExternalAPIConfigDTO(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
            provider="anthropic",
        )

        metadata = VideoMetadataDTO(frame_count=300, fps=30.0, duration=10.0)
        frames = [
            (0, np.zeros((100, 100, 3), dtype=np.uint8)),
            (150, np.zeros((100, 100, 3), dtype=np.uint8)),
            (299, np.zeros((100, 100, 3), dtype=np.uint8)),
        ]
        sampler = _make_frame_sampler(metadata, frames)

        router = Mock()
        router.generate_from_images = AsyncMock(
            return_value={
                "text": "Summary: This video shows a person walking. "
                "Visual Analysis: The person is wearing blue clothes.",
                "usage": {"total_tokens": 150},
                "model": "test-model",
            }
        )
        router.generate_reasoned_from_images = AsyncMock(
            return_value=ReasonedText(
                text="Summary: This video shows a person walking. "
                "Visual Analysis: The person is wearing blue clothes.",
                thinking=None,
                tokens_used=150,
            )
        )
        router.close = AsyncMock()

        use_case = SummarizeVideoUseCase(frame_sampler=sampler, external_router=router)
        response = await use_case.execute_with_external_api(
            request=request,
            video_path="/videos/test_video.mp4",
            api_config=api_config,
            provider="anthropic",
        )

        assert response.video_id == "test_video"
        assert response.persona_id == "test_persona"
        assert "person walking" in response.summary.lower()
        assert len(response.key_frames) > 0
        assert response.confidence > 0
        router.generate_reasoned_from_images.assert_called_once()
        router.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_summarize_video_respects_provider_frame_limits(self) -> None:
        """Test that frame sampling respects provider limits."""
        request = SummarizeRequestDTO(
            video_id="test_video", persona_id="test_persona", max_frames=50
        )
        api_config = ExternalAPIConfigDTO(
            api_key="test_key",
            api_endpoint="https://api.openai.com",
            model_id="gpt-4o",
            provider="openai",
        )

        metadata = VideoMetadataDTO(frame_count=1000, fps=30.0, duration=33.3)
        frames = [(i * 100, np.zeros((100, 100, 3), dtype=np.uint8)) for i in range(10)]
        sampler = _make_frame_sampler(metadata, frames)

        router = Mock()
        router.generate_from_images = AsyncMock(
            return_value={
                "text": "Summary: Video content.",
                "usage": {"total_tokens": 100},
                "model": "gpt-4o",
            }
        )
        router.generate_reasoned_from_images = AsyncMock(
            return_value=ReasonedText(
                text="Summary: Video content.",
                thinking=None,
                tokens_used=100,
            )
        )
        router.close = AsyncMock()

        use_case = SummarizeVideoUseCase(frame_sampler=sampler, external_router=router)
        await use_case.execute_with_external_api(
            request=request,
            video_path="/videos/test_video.mp4",
            api_config=api_config,
            provider="openai",
        )
        call_kwargs = sampler.extract_frames_uniform.call_args.kwargs
        assert call_kwargs["num_frames"] == 10

    @pytest.mark.asyncio
    async def test_summarize_video_handles_api_errors(self) -> None:
        """Test that API errors are properly handled."""
        request = SummarizeRequestDTO(
            video_id="test_video", persona_id="test_persona", max_frames=10
        )
        api_config = ExternalAPIConfigDTO(
            api_key="invalid_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
            provider="anthropic",
        )

        metadata = VideoMetadataDTO(frame_count=300, fps=30.0, duration=10.0)
        frames = [(0, np.zeros((100, 100, 3), dtype=np.uint8))]
        sampler = _make_frame_sampler(metadata, frames)

        router = Mock()
        router.generate_from_images = AsyncMock(side_effect=Exception("API authentication failed"))
        router.generate_reasoned_from_images = AsyncMock(
            side_effect=Exception("API authentication failed")
        )
        router.close = AsyncMock()

        use_case = SummarizeVideoUseCase(frame_sampler=sampler, external_router=router)
        with pytest.raises(SummarizationError, match="External API summarization failed"):
            await use_case.execute_with_external_api(
                request=request,
                video_path="/videos/test_video.mp4",
                api_config=api_config,
                provider="anthropic",
            )
        router.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_summarize_video_handles_no_frames_extracted(self) -> None:
        """Test error handling when no frames can be extracted."""
        request = SummarizeRequestDTO(
            video_id="test_video", persona_id="test_persona", max_frames=10
        )
        api_config = ExternalAPIConfigDTO(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
            provider="anthropic",
        )

        metadata = VideoMetadataDTO(frame_count=300, fps=30.0, duration=10.0)
        sampler = _make_frame_sampler(metadata, [])

        router = Mock()
        router.close = AsyncMock()

        use_case = SummarizeVideoUseCase(frame_sampler=sampler, external_router=router)
        with pytest.raises(SummarizationError, match="No frames could be extracted"):
            await use_case.execute_with_external_api(
                request=request,
                video_path="/videos/test_video.mp4",
                api_config=api_config,
                provider="anthropic",
            )
