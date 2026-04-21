"""Tests for video summarization pipeline."""

import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np
import pytest

from src.application.dto.summarization import SummarizeRequestDTO
from src.application.ports.outbound.frame_sampler import VideoMetadataDTO
from src.application.use_cases.summarize_video import (
    SummarizationError,
    SummarizeVideoUseCase,
    get_default_prompt_template,
    get_persona_prompt,
    get_video_path_for_id,
    identify_key_frames,
    parse_vlm_response,
)


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
    response = (
        "The video contains footage of outdoor activities with multiple people moving around."
    )

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

        assert result == str(video_file.resolve())


def test_get_video_path_for_id_different_extension():
    """Test video path resolution with different video extension."""
    with tempfile.TemporaryDirectory() as tmpdir:
        video_id = "test-video"
        video_file = Path(tmpdir) / f"{video_id}.avi"
        video_file.touch()

        result = get_video_path_for_id(video_id, data_dir=tmpdir)

        assert result == str(video_file.resolve())


def test_get_video_path_for_id_directory_not_exists():
    """Test video path resolution when directory does not exist."""
    result = get_video_path_for_id("any-id", data_dir="/nonexistent/path")

    assert result is None


def _make_video_file(tmpdir: str, frame_count: int) -> Path:
    """Write a small synthetic video with ``frame_count`` frames."""
    video_path = Path(tmpdir) / "test.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(video_path), fourcc, 30.0, (640, 480))
    for _ in range(frame_count):
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        out.write(frame)
    out.release()
    return video_path


def _make_sampler(metadata: VideoMetadataDTO, frames) -> MagicMock:
    """Build a frame-sampler mock with canned return values."""
    sampler = MagicMock()
    sampler.get_video_metadata.return_value = metadata
    sampler.extract_frames_uniform.return_value = frames
    return sampler


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_success():
    """Test successful video summarization with VLM."""
    with tempfile.TemporaryDirectory() as tmpdir:
        _make_video_file(tmpdir, frame_count=90)

        metadata = VideoMetadataDTO(frame_count=90, fps=30.0, duration=3.0)
        frames = [(i * 10, np.zeros((100, 100, 3), dtype=np.uint8)) for i in range(6)]
        sampler = _make_sampler(metadata, frames)

        vlm = MagicMock()
        vlm.is_loaded = False
        vlm.generate.return_value = (
            "Summary: Test video shows random frames. "
            "Visual Analysis: Contains RGB noise patterns."
        )

        request = SummarizeRequestDTO(
            video_id="test-video",
            persona_id=str(uuid.uuid4()),
            frame_sample_rate=1,
            max_frames=10,
        )

        use_case = SummarizeVideoUseCase(
            frame_sampler=sampler, vision_language_model=vlm
        )
        result = await use_case.execute_with_vlm(
            request=request,
            video_path=str(Path(tmpdir) / "test.mp4"),
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

        vlm.load.assert_called_once()
        vlm.unload.assert_called_once()


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_video_not_found():
    """Test summarization with nonexistent video file."""
    sampler = MagicMock()
    sampler.get_video_metadata.side_effect = FileNotFoundError(
        "Video file not found"
    )
    vlm = MagicMock()

    request = SummarizeRequestDTO(
        video_id="test-video",
        persona_id=str(uuid.uuid4()),
    )

    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)
    with pytest.raises(SummarizationError):
        await use_case.execute_with_vlm(
            request=request,
            video_path="/nonexistent/video.mp4",
            model_name="test-model",
        )


@pytest.mark.asyncio
async def test_summarize_video_with_vlm_model_error():
    """Test summarization when VLM loading fails."""
    metadata = VideoMetadataDTO(frame_count=30, fps=30.0, duration=1.0)
    frames = [(0, np.zeros((100, 100, 3), dtype=np.uint8))]
    sampler = _make_sampler(metadata, frames)

    vlm = MagicMock()
    vlm.load.side_effect = RuntimeError("Model loading failed")

    request = SummarizeRequestDTO(
        video_id="test-video",
        persona_id=str(uuid.uuid4()),
    )

    use_case = SummarizeVideoUseCase(frame_sampler=sampler, vision_language_model=vlm)
    with pytest.raises(SummarizationError):
        await use_case.execute_with_vlm(
            request=request,
            video_path="/videos/unused.mp4",
            model_name="test-model",
        )
