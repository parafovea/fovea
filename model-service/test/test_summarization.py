"""Tests for video summarization pipeline."""

import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import cv2
import numpy as np
import pytest
from PIL import Image

from src.models import KeyFrame, SummarizeRequest, SummarizeResponse
from src.summarization import (
    SummarizationError,
    get_default_prompt_template,
    get_persona_prompt,
    get_video_path_for_id,
    identify_key_frames,
    parse_vlm_response,
    summarize_video_with_vlm,
)
from src.vlm_loader import InferenceFramework, QuantizationType, VLMConfig


def test_get_default_prompt_template():
    """Test that default prompt template contains expected placeholders."""
    template = get_default_prompt_template()

    assert "{persona_role}" in template
    assert "{information_need}" in template
    assert "summary" in template.lower()
    assert "visual analysis" in template.lower()


def test_get_persona_prompt_with_params():
    """Test persona prompt generation with provided parameters."""
    prompt = get_persona_prompt(
        persona_role="Sports Scout",
        information_need="Tracking player movements and ball trajectory",
    )

    assert "Sports Scout" in prompt
    assert "Tracking player movements and ball trajectory" in prompt
    assert "summary" in prompt.lower()


def test_get_persona_prompt_defaults():
    """Test persona prompt generation with default parameters."""
    prompt = get_persona_prompt()

    assert "Analyst" in prompt
    assert "Understanding the content" in prompt


def test_parse_vlm_response_structured():
    """Test parsing VLM response with structured format."""
    response = """Summary:
    The video shows a baseball game with pitcher throwing to batter.

    Visual Analysis:
    - Pitcher uses overhand throwing motion
    - Ball travels at approximately 90mph
    - Batter prepares swing stance"""

    summary, visual_analysis = parse_vlm_response(response)

    assert "baseball game" in summary.lower()
    assert "pitcher" in summary.lower()
    assert visual_analysis is not None
    assert "overhand" in visual_analysis.lower()


def test_parse_vlm_response_unstructured():
    """Test parsing VLM response without clear structure."""
    response = "The video contains footage of outdoor activities with multiple people moving around."

    summary, visual_analysis = parse_vlm_response(response)

    assert "outdoor activities" in summary.lower()


def test_parse_vlm_response_numbered():
    """Test parsing VLM response with numbered sections."""
    response = """1. The scene shows urban traffic at an intersection.

    2. Detailed visual elements include:
    - Three vehicles: two cars and one truck
    - Pedestrian crosswalk visible
    - Traffic light in red phase"""

    summary, visual_analysis = parse_vlm_response(response)

    assert "urban traffic" in summary.lower()
    assert visual_analysis is not None
    assert "three vehicles" in visual_analysis.lower()


def test_identify_key_frames_fewer_than_requested():
    """Test key frame identification when fewer frames than requested."""
    frames = [
        (0, np.zeros((100, 100, 3))),
        (15, np.zeros((100, 100, 3))),
    ]
    fps = 30.0

    key_frames = identify_key_frames(frames, fps, num_key_frames=5)

    assert len(key_frames) == 2
    assert key_frames[0].frame_number == 0
    assert key_frames[1].frame_number == 15


def test_identify_key_frames_exact_match():
    """Test key frame identification with exact match."""
    frames = [
        (0, np.zeros((100, 100, 3))),
        (30, np.zeros((100, 100, 3))),
        (60, np.zeros((100, 100, 3))),
    ]
    fps = 30.0

    key_frames = identify_key_frames(frames, fps, num_key_frames=3)

    assert len(key_frames) == 3
    assert key_frames[0].timestamp == 0.0
    assert key_frames[1].timestamp == 1.0
    assert key_frames[2].timestamp == 2.0


def test_identify_key_frames_more_than_requested():
    """Test key frame identification selecting subset."""
    frames = [(i * 10, np.zeros((100, 100, 3))) for i in range(10)]
    fps = 30.0

    key_frames = identify_key_frames(frames, fps, num_key_frames=3)

    assert len(key_frames) == 3
    assert key_frames[0].frame_number == 0
    assert key_frames[-1].frame_number == 90


def test_identify_key_frames_descriptions():
    """Test that key frames have appropriate descriptions."""
    frames = [(i * 30, np.zeros((100, 100, 3))) for i in range(5)]
    fps = 30.0

    key_frames = identify_key_frames(frames, fps, num_key_frames=3)

    assert "opening" in key_frames[0].description.lower()
    assert "closing" in key_frames[-1].description.lower()


def test_get_video_path_for_id_not_found():
    """Test video path resolution when video does not exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_id = str(uuid.uuid4())
        result = get_video_path_for_id(video_id, data_dir=tmpdir)

        assert result is None


def test_get_video_path_for_id_exact_match():
    """Test video path resolution with exact filename match."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_id = "test-video"
        video_file = Path(tmpdir) / f"{video_id}.mp4"
        video_file.touch()

        result = get_video_path_for_id(video_id, data_dir=tmpdir)

        assert result == str(video_file)


def test_get_video_path_for_id_different_extension():
    """Test video path resolution with different video extension."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_id = "test-video"
        video_file = Path(tmpdir) / f"{video_id}.avi"
        video_file.touch()

        result = get_video_path_for_id(video_id, data_dir=tmpdir)

        assert result == str(video_file)


def test_get_video_path_for_id_directory_not_exists():
    """Test video path resolution when directory does not exist."""
    result = get_video_path_for_id("any-id", data_dir="/nonexistent/path")

    assert result is None


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_success():
    """Test successful video summarization with VLM."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(str(video_path), fourcc, 30.0, (640, 480))
        for _ in range(90):
            frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            out.write(frame)
        out.release()

        mock_loader = MagicMock()
        mock_loader.generate.return_value = (
            "Summary: Test video shows random frames. "
            "Visual Analysis: Contains RGB noise patterns."
        )

        with patch("src.summarization.create_vlm_loader", return_value=mock_loader):
            request = SummarizeRequest(
                video_id="test-video",
                persona_id=str(uuid.uuid4()),
                frame_sample_rate=1,
                max_frames=10,
            )

            config = VLMConfig(
                model_id="test/model",
                quantization=QuantizationType.FOUR_BIT,
                framework=InferenceFramework.TRANSFORMERS,
            )

            result = await summarize_video_with_vlm(
                request=request,
                video_path=str(video_path),
                model_config=config,
                model_name="test-model",
                persona_role="Analyst",
                information_need="Testing",
            )

            assert result.video_id == "test-video"
            assert result.persona_id == request.persona_id
            assert "test video" in result.summary.lower()
            assert result.visual_analysis is not None
            assert "rgb noise" in result.visual_analysis.lower()
            assert len(result.key_frames) > 0
            assert result.confidence > 0

            mock_loader.load.assert_called_once()
            mock_loader.unload.assert_called_once()


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_video_not_found():
    """Test summarization with nonexistent video file."""
    request = SummarizeRequest(
        video_id="test-video",
        persona_id=str(uuid.uuid4()),
    )

    config = VLMConfig(
        model_id="test/model",
        quantization=QuantizationType.FOUR_BIT,
        framework=InferenceFramework.TRANSFORMERS,
    )

    with pytest.raises(SummarizationError):
        await summarize_video_with_vlm(
            request=request,
            video_path="/nonexistent/video.mp4",
            model_config=config,
            model_name="test-model",
        )


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_model_error():
    """Test summarization when VLM loading fails."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = Path(tmpdir) / "test.mp4"

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(str(video_path), fourcc, 30.0, (640, 480))
        for _ in range(30):
            frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            out.write(frame)
        out.release()

        mock_loader = MagicMock()
        mock_loader.load.side_effect = RuntimeError("Model loading failed")

        with patch("src.summarization.create_vlm_loader", return_value=mock_loader):
            request = SummarizeRequest(
                video_id="test-video",
                persona_id=str(uuid.uuid4()),
            )

            config = VLMConfig(
                model_id="test/model",
                quantization=QuantizationType.FOUR_BIT,
                framework=InferenceFramework.TRANSFORMERS,
            )

            with pytest.raises(SummarizationError):
                await summarize_video_with_vlm(
                    request=request,
                    video_path=str(video_path),
                    model_config=config,
                    model_name="test-model",
                )
