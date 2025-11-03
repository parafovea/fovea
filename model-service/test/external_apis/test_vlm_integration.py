"""Tests for VLM external API integration in video summarization."""

import io
from unittest.mock import AsyncMock, Mock, patch

import pytest
from PIL import Image

from src.external_apis.base import ExternalAPIConfig
from src.models import SummarizeRequest
from src.summarization import (
    calculate_frame_sample_count,
    convert_image_to_base64,
    get_external_api_prompt,
    summarize_video_with_external_api,
)


class TestFrameSampling:
    """Tests for frame sampling logic."""

    def test_calculate_frame_sample_count_respects_anthropic_limit(self) -> None:
        """Test that Anthropic provider limit of 20 frames is respected."""
        result = calculate_frame_sample_count(
            total_frames=1000,
            provider="anthropic",
            max_frames=50,
        )
        assert result == 20

    def test_calculate_frame_sample_count_respects_openai_limit(self) -> None:
        """Test that OpenAI provider limit of 10 frames is respected."""
        result = calculate_frame_sample_count(
            total_frames=1000,
            provider="openai",
            max_frames=50,
        )
        assert result == 10

    def test_calculate_frame_sample_count_respects_google_limit(self) -> None:
        """Test that Google provider limit of 50 frames is respected."""
        result = calculate_frame_sample_count(
            total_frames=1000,
            provider="google",
            max_frames=100,
        )
        assert result == 50

    def test_calculate_frame_sample_count_respects_total_frames(self) -> None:
        """Test that total frames is respected when below provider limit."""
        result = calculate_frame_sample_count(
            total_frames=5,
            provider="anthropic",
            max_frames=20,
        )
        assert result == 5

    def test_calculate_frame_sample_count_respects_user_max(self) -> None:
        """Test that user-requested max is respected when below provider limit."""
        result = calculate_frame_sample_count(
            total_frames=1000,
            provider="anthropic",
            max_frames=15,
        )
        assert result == 15

    def test_calculate_frame_sample_count_unknown_provider_defaults_to_10(self) -> None:
        """Test that unknown provider defaults to 10 frames."""
        result = calculate_frame_sample_count(
            total_frames=1000,
            provider="unknown_provider",
            max_frames=50,
        )
        assert result == 10


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
        timestamps = [0.0, 5.5, 11.0]
        prompt = get_external_api_prompt(
            frame_count=3,
            duration=15.0,
            timestamps=timestamps,
        )

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


class TestExternalAPISummarization:
    """Tests for external API video summarization."""

    @pytest.mark.asyncio
    async def test_summarize_video_with_external_api_success(self) -> None:
        """Test successful video summarization with external API."""
        request = SummarizeRequest(
            video_id="test_video",
            persona_id="test_persona",
            max_frames=10,
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        mock_router_result = {
            "text": "Summary: This video shows a person walking. Visual Analysis: The person is wearing blue clothes.",
            "usage": {"total_tokens": 150},
            "model": "test-model",
        }

        with (
            patch("src.summarization.get_video_info") as mock_video_info,
            patch("src.summarization.extract_frames_uniform") as mock_extract,
            patch("src.summarization.ExternalModelRouter") as mock_router_class,
        ):
            mock_video_info.return_value = Mock(
                frame_count=300,
                duration=10.0,
                fps=30.0,
            )

            import numpy as np

            mock_extract.return_value = [
                (0, np.zeros((100, 100, 3), dtype=np.uint8)),
                (150, np.zeros((100, 100, 3), dtype=np.uint8)),
                (299, np.zeros((100, 100, 3), dtype=np.uint8)),
            ]

            mock_router = Mock()
            mock_router.generate_from_images = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            response = await summarize_video_with_external_api(
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

            mock_router.generate_from_images.assert_called_once()
            mock_router.close_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_summarize_video_respects_provider_frame_limits(self) -> None:
        """Test that frame sampling respects provider limits."""
        request = SummarizeRequest(
            video_id="test_video",
            persona_id="test_persona",
            max_frames=50,
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.openai.com",
            model_id="gpt-4o",
        )

        mock_router_result = {
            "text": "Summary: Video content.",
            "usage": {"total_tokens": 100},
            "model": "gpt-4o",
        }

        with (
            patch("src.summarization.get_video_info") as mock_video_info,
            patch("src.summarization.extract_frames_uniform") as mock_extract,
            patch("src.summarization.ExternalModelRouter") as mock_router_class,
        ):
            mock_video_info.return_value = Mock(
                frame_count=1000,
                duration=33.3,
                fps=30.0,
            )

            import numpy as np

            mock_frames = [(i * 100, np.zeros((100, 100, 3), dtype=np.uint8)) for i in range(10)]
            mock_extract.return_value = mock_frames

            mock_router = Mock()
            mock_router.generate_from_images = AsyncMock(return_value=mock_router_result)
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            await summarize_video_with_external_api(
                request=request,
                video_path="/videos/test_video.mp4",
                api_config=api_config,
                provider="openai",
            )

            call_args = mock_extract.call_args
            assert call_args[1]["num_frames"] == 10

    @pytest.mark.asyncio
    async def test_summarize_video_handles_api_errors(self) -> None:
        """Test that API errors are properly handled."""
        request = SummarizeRequest(
            video_id="test_video",
            persona_id="test_persona",
            max_frames=10,
        )

        api_config = ExternalAPIConfig(
            api_key="invalid_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        with (
            patch("src.summarization.get_video_info") as mock_video_info,
            patch("src.summarization.extract_frames_uniform") as mock_extract,
            patch("src.summarization.ExternalModelRouter") as mock_router_class,
        ):
            mock_video_info.return_value = Mock(
                frame_count=300,
                duration=10.0,
                fps=30.0,
            )

            import numpy as np

            mock_extract.return_value = [(0, np.zeros((100, 100, 3), dtype=np.uint8))]

            mock_router = Mock()
            mock_router.generate_from_images = AsyncMock(
                side_effect=Exception("API authentication failed")
            )
            mock_router.close_all = AsyncMock()
            mock_router_class.return_value = mock_router

            from src.summarization import SummarizationError

            with pytest.raises(SummarizationError, match="External API summarization failed"):
                await summarize_video_with_external_api(
                    request=request,
                    video_path="/videos/test_video.mp4",
                    api_config=api_config,
                    provider="anthropic",
                )

            mock_router.close_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_summarize_video_handles_no_frames_extracted(self) -> None:
        """Test error handling when no frames can be extracted."""
        request = SummarizeRequest(
            video_id="test_video",
            persona_id="test_persona",
            max_frames=10,
        )

        api_config = ExternalAPIConfig(
            api_key="test_key",
            api_endpoint="https://api.test.com",
            model_id="test-model",
        )

        with (
            patch("src.summarization.get_video_info") as mock_video_info,
            patch("src.summarization.extract_frames_uniform") as mock_extract,
        ):
            mock_video_info.return_value = Mock(
                frame_count=300,
                duration=10.0,
                fps=30.0,
            )

            mock_extract.return_value = []

            from src.summarization import SummarizationError

            with pytest.raises(SummarizationError, match="No frames could be extracted"):
                await summarize_video_with_external_api(
                    request=request,
                    video_path="/videos/test_video.mp4",
                    api_config=api_config,
                    provider="anthropic",
                )
