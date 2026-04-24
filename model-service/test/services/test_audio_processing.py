"""Tests for :mod:`src.application.services.audio_processing`.

Each async helper wraps an ``ffmpeg``/``ffprobe`` subprocess. The real
binary is not required for these tests: we patch
``asyncio.create_subprocess_exec`` to yield a fake process with
configurable ``returncode`` and ``communicate`` output, then assert on
the parsed result and on the argument list the helper built.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from src.application.services.audio_processing import (
    AudioProcessingError,
    check_ffmpeg_available,
    check_ffprobe_available,
    chunk_audio_file,
    extract_audio_segment,
    extract_audio_track,
    get_audio_duration,
    get_audio_info,
    has_audio_stream,
    load_audio_array,
)


def _fake_process(
    returncode: int = 0,
    stdout: bytes = b"",
    stderr: bytes = b"",
) -> MagicMock:
    """Build a mock subprocess with the given return / output."""
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


@pytest.fixture
def patch_subprocess() -> Any:
    """Patch ``asyncio.create_subprocess_exec`` with an AsyncMock.

    The returned AsyncMock's ``return_value`` must be set to a fake
    process (see :func:`_fake_process`) before each test exercises a
    single call.
    """
    with patch(
        "src.application.services.audio_processing.asyncio.create_subprocess_exec",
        new_callable=AsyncMock,
    ) as mock:
        yield mock


class TestHasAudioStream:
    @pytest.mark.asyncio
    async def test_returns_true_when_audio_present(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"audio\n")
        assert await has_audio_stream("video.mp4") is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_audio(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"")
        assert await has_audio_stream("video.mp4") is False

    @pytest.mark.asyncio
    async def test_returns_false_on_exception(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.side_effect = FileNotFoundError("no ffprobe")
        assert await has_audio_stream("video.mp4") is False


class TestGetAudioInfo:
    @pytest.mark.asyncio
    async def test_parses_stream_metadata(self, patch_subprocess: AsyncMock) -> None:
        payload = {
            "streams": [
                {
                    "codec_name": "aac",
                    "sample_rate": "48000",
                    "channels": "2",
                    "duration": "12.345",
                    "bit_rate": "128000",
                }
            ]
        }
        patch_subprocess.return_value = _fake_process(stdout=json.dumps(payload).encode())

        info = await get_audio_info("video.mp4")
        assert info == {
            "codec": "aac",
            "sample_rate": 48000,
            "channels": 2,
            "duration": 12.345,
            "bitrate": 128000,
        }

    @pytest.mark.asyncio
    async def test_no_streams_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b'{"streams": []}')
        with pytest.raises(AudioProcessingError, match="No audio stream"):
            await get_audio_info("video.mp4")

    @pytest.mark.asyncio
    async def test_nonzero_rc_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(
            returncode=1, stderr=b"unknown codec"
        )
        with pytest.raises(AudioProcessingError, match="ffprobe failed"):
            await get_audio_info("video.mp4")

    @pytest.mark.asyncio
    async def test_malformed_json_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"not json")
        with pytest.raises(AudioProcessingError, match="parse audio info"):
            await get_audio_info("video.mp4")


class TestChunkAudioFile:
    @pytest.mark.asyncio
    async def test_non_overlapping_chunks(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"90.0\n")
        chunks = await chunk_audio_file("a.wav", chunk_duration=30.0, overlap=0.0)
        assert chunks == [(0.0, 30.0), (30.0, 30.0), (60.0, 30.0)]

    @pytest.mark.asyncio
    async def test_short_audio_returns_single_chunk(
        self, patch_subprocess: AsyncMock
    ) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"5.0\n")
        chunks = await chunk_audio_file("a.wav", chunk_duration=30.0, overlap=1.0)
        assert chunks == [(0.0, 5.0)]

    @pytest.mark.asyncio
    async def test_overlap_produces_staggered_starts(
        self, patch_subprocess: AsyncMock
    ) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"60.0\n")
        chunks = await chunk_audio_file("a.wav", chunk_duration=30.0, overlap=5.0)
        assert chunks[0] == (0.0, 30.0)
        assert chunks[1][0] == 25.0

    @pytest.mark.asyncio
    async def test_ffprobe_failure_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(returncode=1, stderr=b"oops")
        with pytest.raises(AudioProcessingError, match="chunk audio"):
            await chunk_audio_file("a.wav")

    @pytest.mark.asyncio
    async def test_unparseable_duration_raises(
        self, patch_subprocess: AsyncMock
    ) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"not-a-number")
        with pytest.raises(AudioProcessingError, match="parse audio duration"):
            await chunk_audio_file("a.wav")


class TestGetAudioDuration:
    @pytest.mark.asyncio
    async def test_returns_float_duration(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"42.5\n")
        assert await get_audio_duration("a.wav") == 42.5

    @pytest.mark.asyncio
    async def test_nonzero_rc_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(returncode=1, stderr=b"bad")
        with pytest.raises(AudioProcessingError, match="Failed to get duration"):
            await get_audio_duration("a.wav")

    @pytest.mark.asyncio
    async def test_malformed_output_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"not-a-number")
        with pytest.raises(AudioProcessingError, match="parse duration"):
            await get_audio_duration("a.wav")


class TestLoadAudioArray:
    @pytest.mark.asyncio
    async def test_normalizes_int16_to_float_minus_one_one(
        self, patch_subprocess: AsyncMock
    ) -> None:
        samples_int16 = np.array([0, 16384, -32768], dtype=np.int16).tobytes()
        patch_subprocess.return_value = _fake_process(stdout=samples_int16)

        array, sr = await load_audio_array("a.wav", sample_rate=16000)

        assert sr == 16000
        assert array.dtype == np.float32
        assert array[0] == pytest.approx(0.0)
        assert array[1] == pytest.approx(0.5)
        assert array[2] == pytest.approx(-1.0)

    @pytest.mark.asyncio
    async def test_ffmpeg_failure_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(returncode=1, stderr=b"no input")
        with pytest.raises(AudioProcessingError, match="load audio array"):
            await load_audio_array("missing.wav")


class TestExtractAudioSegment:
    @pytest.mark.asyncio
    async def test_returns_output_path(
        self,
        tmp_path: Any,
        patch_subprocess: AsyncMock,
    ) -> None:
        output = tmp_path / "segment.wav"
        output.write_bytes(b"fake")
        # First probe call for ``has_audio_stream``, second for extraction.
        patch_subprocess.side_effect = [
            _fake_process(stdout=b"audio\n"),
            _fake_process(),
        ]
        result = await extract_audio_segment(
            "video.mp4",
            start_time=1.0,
            duration=2.0,
            output_path=str(output),
        )
        assert result == str(output)

    @pytest.mark.asyncio
    async def test_no_audio_stream_raises(
        self, patch_subprocess: AsyncMock
    ) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"")
        with pytest.raises(AudioProcessingError, match="no audio stream"):
            await extract_audio_segment("video.mp4", 0.0, 1.0, output_path="/tmp/x.wav")

    @pytest.mark.asyncio
    async def test_ffmpeg_failure_raises(
        self,
        tmp_path: Any,
        patch_subprocess: AsyncMock,
    ) -> None:
        output = tmp_path / "segment.wav"
        patch_subprocess.side_effect = [
            _fake_process(stdout=b"audio\n"),
            _fake_process(returncode=1, stderr=b"ffmpeg died"),
        ]
        with pytest.raises(AudioProcessingError, match="FFmpeg segment extraction failed"):
            await extract_audio_segment(
                "video.mp4", 0.0, 1.0, output_path=str(output)
            )


class TestExtractAudioTrack:
    @pytest.mark.asyncio
    async def test_returns_output_path(
        self,
        tmp_path: Any,
        patch_subprocess: AsyncMock,
    ) -> None:
        # ``extract_audio_track`` resolves tmp through ``tempfile.gettempdir``.
        # The output_path guard requires the resolved output to live under
        # that resolved temp dir — use the system temp dir so macOS's
        # /var -> /private/var symlink doesn't trip the check.
        import tempfile as _tempfile

        output = Path(_tempfile.gettempdir()) / f"track_{id(self)}.wav"
        output.write_bytes(b"fake")
        patch_subprocess.side_effect = [
            _fake_process(stdout=b"audio\n"),
            _fake_process(),
        ]
        result = await extract_audio_track(
            "video.mp4",
            track_index=1,
            output_path=str(output),
        )
        assert result == str(output)

    @pytest.mark.asyncio
    async def test_output_path_outside_temp_raises(
        self, patch_subprocess: AsyncMock, tmp_path: Any
    ) -> None:
        # tmp_path lives under pytest's basetemp, not tempfile.gettempdir().
        # On Linux this is inside the temp dir; guard against both cases by
        # using an explicitly non-temp location.
        bogus = Path("/etc/fovea-bogus.wav")
        patch_subprocess.return_value = _fake_process(stdout=b"audio\n")
        with pytest.raises(AudioProcessingError, match="within temp directory"):
            await extract_audio_track("video.mp4", output_path=str(bogus))

    @pytest.mark.asyncio
    async def test_no_audio_raises(self, patch_subprocess: AsyncMock) -> None:
        patch_subprocess.return_value = _fake_process(stdout=b"")
        with pytest.raises(AudioProcessingError, match="no audio streams"):
            await extract_audio_track("video.mp4")


class TestFfmpegAvailability:
    def test_ffmpeg_available_when_rc_zero(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run"
        ) as mock:
            mock.return_value = MagicMock(returncode=0)
            assert check_ffmpeg_available() is True

    def test_ffmpeg_missing_when_rc_nonzero(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run"
        ) as mock:
            mock.return_value = MagicMock(returncode=1)
            assert check_ffmpeg_available() is False

    def test_ffmpeg_missing_when_file_not_found(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run",
            side_effect=FileNotFoundError(),
        ):
            assert check_ffmpeg_available() is False

    def test_ffmpeg_missing_on_timeout(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run",
            side_effect=subprocess.TimeoutExpired("ffmpeg", 5),
        ):
            assert check_ffmpeg_available() is False

    def test_ffprobe_available_when_rc_zero(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run"
        ) as mock:
            mock.return_value = MagicMock(returncode=0)
            assert check_ffprobe_available() is True

    def test_ffprobe_missing_on_exception(self) -> None:
        with patch(
            "src.application.services.audio_processing.subprocess.run",
            side_effect=FileNotFoundError(),
        ):
            assert check_ffprobe_available() is False


# Helpers imported late so their patch targets reflect the current module state.
from pathlib import Path  # noqa: E402
