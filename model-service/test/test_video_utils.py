"""
Tests for video processing utilities.

Tests cover frame extraction, audio extraction, and video metadata reading.
"""

import os
import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import cv2
import numpy as np
import pytest

from src.video_utils import (
    VideoInfo,
    VideoProcessingError,
    check_ffmpeg_available,
    extract_audio,
    extract_frame,
    extract_frames_by_rate,
    extract_frames_uniform,
    get_video_info,
    resize_frame,
)


@pytest.fixture
def test_video_path(tmp_path):
    """
    Create a simple test video file.

    Creates a 30-frame video at 10 fps (3 seconds) with 640x480 resolution.
    Each frame has a different solid color to distinguish frames.
    """
    video_path = tmp_path / "test_video.mp4"

    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    fps = 10.0
    frame_size = (640, 480)
    out = cv2.VideoWriter(str(video_path), fourcc, fps, frame_size)

    # Generate 30 frames with different colors
    for i in range(30):
        # Create frame with color based on frame number
        color = (i * 8, (30 - i) * 8, 128)
        frame = np.full((frame_size[1], frame_size[0], 3), color, dtype=np.uint8)

        # Add frame number as text
        cv2.putText(
            frame,
            f"Frame {i}",
            (50, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
        )

        out.write(frame)

    out.release()
    return str(video_path)


class TestGetVideoInfo:
    """Tests for get_video_info function."""

    def test_get_video_info_success(self, test_video_path):
        """Test successful video info extraction."""
        info = get_video_info(test_video_path)

        assert isinstance(info, VideoInfo)
        assert info.path == test_video_path
        assert info.frame_count == 30
        assert info.fps == pytest.approx(10.0, rel=0.1)
        assert info.duration == pytest.approx(3.0, rel=0.1)
        assert info.width == 640
        assert info.height == 480

    def test_get_video_info_nonexistent_file(self):
        """Test error handling for nonexistent video file."""
        with pytest.raises(VideoProcessingError, match="Video file not found"):
            get_video_info("/nonexistent/video.mp4")

    def test_get_video_info_invalid_file(self, tmp_path):
        """Test error handling for invalid video file."""
        invalid_file = tmp_path / "invalid.mp4"
        invalid_file.write_text("not a video")

        with pytest.raises(VideoProcessingError, match="Could not open video"):
            get_video_info(str(invalid_file))


class TestExtractFrame:
    """Tests for extract_frame function."""

    def test_extract_frame_success(self, test_video_path):
        """Test successful single frame extraction."""
        frame = extract_frame(test_video_path, 0)

        assert isinstance(frame, np.ndarray)
        assert frame.shape == (480, 640, 3)
        assert frame.dtype == np.uint8

    def test_extract_frame_middle(self, test_video_path):
        """Test extracting frame from middle of video."""
        frame = extract_frame(test_video_path, 15)

        assert isinstance(frame, np.ndarray)
        assert frame.shape == (480, 640, 3)

    def test_extract_frame_invalid_path(self):
        """Test error handling for invalid path."""
        with pytest.raises(VideoProcessingError, match="Could not open video"):
            extract_frame("/nonexistent/video.mp4", 0)

    def test_extract_frame_out_of_bounds(self, test_video_path):
        """Test error handling for out-of-bounds frame number."""
        with pytest.raises(VideoProcessingError, match="Could not read frame"):
            extract_frame(test_video_path, 1000)


class TestExtractFramesUniform:
    """Tests for extract_frames_uniform function."""

    def test_extract_frames_uniform_success(self, test_video_path):
        """Test uniform frame extraction."""
        frames = extract_frames_uniform(test_video_path, num_frames=5)

        assert len(frames) == 5
        for frame_num, frame_array in frames:
            assert isinstance(frame_num, int)
            assert isinstance(frame_array, np.ndarray)
            assert frame_array.shape == (480, 640, 3)

    def test_extract_frames_uniform_all_frames(self, test_video_path):
        """Test extracting all frames uniformly."""
        frames = extract_frames_uniform(test_video_path, num_frames=30)

        assert len(frames) == 30

    def test_extract_frames_uniform_more_than_available(self, test_video_path):
        """Test requesting more frames than available."""
        frames = extract_frames_uniform(test_video_path, num_frames=100)

        # Should cap at actual frame count
        assert len(frames) == 30

    def test_extract_frames_uniform_with_resize(self, test_video_path):
        """Test uniform extraction with resizing."""
        frames = extract_frames_uniform(test_video_path, num_frames=5, max_dimension=320)

        assert len(frames) == 5
        for _, frame_array in frames:
            # Width should be 320 (larger dimension)
            assert frame_array.shape[1] == 320
            # Height should be scaled proportionally
            assert frame_array.shape[0] == 240

    def test_extract_frames_uniform_frame_indices(self, test_video_path):
        """Test that frame indices are uniformly distributed."""
        frames = extract_frames_uniform(test_video_path, num_frames=5)

        frame_indices = [idx for idx, _ in frames]

        # Indices should be roughly evenly spaced
        assert frame_indices[0] == 0
        assert frame_indices[-1] == 29
        assert len(set(frame_indices)) == 5  # All unique


class TestExtractFramesByRate:
    """Tests for extract_frames_by_rate function."""

    def test_extract_frames_by_rate_success(self, test_video_path):
        """Test frame extraction by sampling rate."""
        frames = extract_frames_by_rate(test_video_path, sample_rate=10)

        # Should get frames 0, 10, 20
        assert len(frames) == 3
        frame_indices = [idx for idx, _ in frames]
        assert frame_indices == [0, 10, 20]

    def test_extract_frames_by_rate_every_frame(self, test_video_path):
        """Test extracting every frame."""
        frames = extract_frames_by_rate(test_video_path, sample_rate=1)

        assert len(frames) == 30

    def test_extract_frames_by_rate_with_resize(self, test_video_path):
        """Test rate-based extraction with resizing."""
        frames = extract_frames_by_rate(
            test_video_path, sample_rate=10, max_dimension=320
        )

        assert len(frames) == 3
        for _, frame_array in frames:
            assert frame_array.shape[1] == 320
            assert frame_array.shape[0] == 240


class TestResizeFrame:
    """Tests for resize_frame function."""

    def test_resize_frame_width_larger(self):
        """Test resizing when width is larger dimension."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        resized = resize_frame(frame, 320)

        assert resized.shape == (240, 320, 3)

    def test_resize_frame_height_larger(self):
        """Test resizing when height is larger dimension."""
        frame = np.zeros((640, 480, 3), dtype=np.uint8)
        resized = resize_frame(frame, 320)

        assert resized.shape == (320, 240, 3)

    def test_resize_frame_no_resize_needed(self):
        """Test that small frames are not resized."""
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        resized = resize_frame(frame, 640)

        # Should return original frame
        assert resized.shape == frame.shape
        assert np.array_equal(resized, frame)

    def test_resize_frame_square(self):
        """Test resizing square frame."""
        frame = np.zeros((640, 640, 3), dtype=np.uint8)
        resized = resize_frame(frame, 320)

        assert resized.shape == (320, 320, 3)


class TestExtractAudio:
    """Tests for extract_audio function."""

    @pytest.mark.asyncio
    async def test_extract_audio_success(self, test_video_path, tmp_path):
        """Test successful audio extraction."""
        output_path = tmp_path / "audio.wav"

        with patch("asyncio.create_subprocess_exec") as mock_exec:
            # Mock successful FFmpeg execution
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"")
            mock_process.returncode = 0
            mock_exec.return_value = mock_process

            # Mock file existence check
            with patch("pathlib.Path.exists", return_value=True):
                result = await extract_audio(test_video_path, str(output_path))

            assert result == str(output_path)
            mock_exec.assert_called_once()

            # Verify FFmpeg command structure
            call_args = mock_exec.call_args[0]
            assert call_args[0] == "ffmpeg"
            assert "-i" in call_args
            assert test_video_path in call_args
            assert str(output_path) in call_args

    @pytest.mark.asyncio
    async def test_extract_audio_default_output(self, test_video_path):
        """Test audio extraction with default output path."""
        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"")
            mock_process.returncode = 0
            mock_exec.return_value = mock_process

            with patch("pathlib.Path.exists", return_value=True):
                result = await extract_audio(test_video_path)

            # Should create temp file
            assert result.endswith("_audio.wav")
            assert os.path.isabs(result)

    @pytest.mark.asyncio
    async def test_extract_audio_custom_sample_rate(self, test_video_path, tmp_path):
        """Test audio extraction with custom sample rate."""
        output_path = tmp_path / "audio.wav"

        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"")
            mock_process.returncode = 0
            mock_exec.return_value = mock_process

            with patch("pathlib.Path.exists", return_value=True):
                await extract_audio(
                    test_video_path, str(output_path), sample_rate=48000, channels=2
                )

            call_args = mock_exec.call_args[0]
            assert "48000" in call_args
            assert "2" in call_args

    @pytest.mark.asyncio
    async def test_extract_audio_nonexistent_file(self):
        """Test error handling for nonexistent video file."""
        with pytest.raises(VideoProcessingError, match="Video file not found"):
            await extract_audio("/nonexistent/video.mp4")

    @pytest.mark.asyncio
    async def test_extract_audio_ffmpeg_error(self, test_video_path, tmp_path):
        """Test error handling for FFmpeg failures."""
        output_path = tmp_path / "audio.wav"

        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"FFmpeg error message")
            mock_process.returncode = 1
            mock_exec.return_value = mock_process

            with pytest.raises(VideoProcessingError, match="FFmpeg failed"):
                await extract_audio(test_video_path, str(output_path))

    @pytest.mark.asyncio
    async def test_extract_audio_ffmpeg_not_found(self, test_video_path, tmp_path):
        """Test error handling when FFmpeg is not installed."""
        output_path = tmp_path / "audio.wav"

        with patch(
            "asyncio.create_subprocess_exec", side_effect=FileNotFoundError()
        ):
            with pytest.raises(VideoProcessingError, match="FFmpeg not found"):
                await extract_audio(test_video_path, str(output_path))

    @pytest.mark.asyncio
    async def test_extract_audio_output_not_created(self, test_video_path, tmp_path):
        """Test error handling when output file is not created."""
        output_path = tmp_path / "audio.wav"

        with patch("asyncio.create_subprocess_exec") as mock_exec:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"")
            mock_process.returncode = 0
            mock_exec.return_value = mock_process

            # Mock exists to return True for video path, False for output path
            def mock_exists(path):
                return path == test_video_path

            with patch("os.path.exists", side_effect=mock_exists):
                with pytest.raises(VideoProcessingError, match="Output audio file not created"):
                    await extract_audio(test_video_path, str(output_path))


class TestCheckFFmpegAvailable:
    """Tests for check_ffmpeg_available function."""

    def test_check_ffmpeg_available_success(self):
        """Test when FFmpeg is available."""
        with patch("subprocess.run") as mock_run:
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_run.return_value = mock_result

            assert check_ffmpeg_available() is True
            mock_run.assert_called_once()

    def test_check_ffmpeg_not_found(self):
        """Test when FFmpeg is not installed."""
        with patch("subprocess.run", side_effect=FileNotFoundError()):
            assert check_ffmpeg_available() is False

    def test_check_ffmpeg_timeout(self):
        """Test when FFmpeg check times out."""
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ffmpeg", 5)):
            assert check_ffmpeg_available() is False


class TestVideoInfo:
    """Tests for VideoInfo class."""

    def test_video_info_creation(self):
        """Test VideoInfo object creation."""
        info = VideoInfo(
            path="/path/to/video.mp4",
            frame_count=100,
            fps=30.0,
            duration=3.33,
            width=1920,
            height=1080,
        )

        assert info.path == "/path/to/video.mp4"
        assert info.frame_count == 100
        assert info.fps == 30.0
        assert info.duration == 3.33
        assert info.width == 1920
        assert info.height == 1080
