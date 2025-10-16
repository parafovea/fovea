"""Gladia audio transcription client.

This module provides integration with Gladia Audio API for accurate
audio transcription with speaker diarization and sentiment analysis.
"""

import asyncio
import logging
import time
from pathlib import Path

import httpx

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class GladiaClient(AudioAPIClient):
    """Client for Gladia Audio API.

    Gladia provides accurate transcription with support for speaker diarization,
    sentiment analysis, and multilingual processing.
    """

    BASE_URL = "https://api.gladia.io/v2"

    def __init__(self, api_key: str) -> None:
        """Initialize Gladia client with API key.

        Parameters
        ----------
        api_key : str
            Gladia API key.
        """
        super().__init__(api_key)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using Gladia API.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code. If None, auto-detects.
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis.

        Returns
        -------
        TranscriptResult
            Transcription result with segments and metadata.

        Raises
        ------
        RuntimeError
            If transcription fails or API returns an error.
        """
        try:
            logger.info(f"Transcribing audio with Gladia: {audio_path}")

            async with httpx.AsyncClient(timeout=300.0) as client:
                with open(audio_path, "rb") as audio_file:
                    files = {"audio": (Path(audio_path).name, audio_file, "audio/wav")}
                    data = {
                        "language": language or "auto",
                        "diarization": str(enable_diarization).lower(),
                        "sentiment_analysis": str(enable_sentiment).lower(),
                    }

                    response = await client.post(
                        f"{self.BASE_URL}/transcription",
                        headers={"X-Gladia-Key": self.api_key},
                        files=files,
                        data=data,
                    )

                    response.raise_for_status()
                    job = response.json()
                    job_id = job["result"]["id"]

                result = await self._poll_transcription(client, job_id)

            transcript_data = result["result"]["transcription"]

            segments = []
            full_text_parts = []

            for utterance in transcript_data.get("utterances", []):
                speaker_label = utterance.get("speaker")
                for word_data in utterance.get("words", []):
                    segments.append(
                        TranscriptSegment(
                            start=word_data["start"],
                            end=word_data["end"],
                            text=word_data["word"],
                            confidence=word_data.get("confidence", 1.0),
                            speaker=f"SPEAKER_{speaker_label}" if speaker_label is not None else None,
                        )
                    )
                    full_text_parts.append(word_data["word"])

            full_text = " ".join(full_text_parts)
            duration = segments[-1].end if segments else 0.0
            avg_confidence = (
                sum(s.confidence for s in segments) / len(segments) if segments else 0.0
            )

            logger.info("Gladia transcription completed successfully")

            return TranscriptResult(
                text=full_text,
                segments=segments,
                language=transcript_data.get("language", language or "en"),
                duration=duration,
                confidence=avg_confidence,
                words=None,
            )

        except Exception as e:
            logger.error(f"Gladia transcription failed: {e}")
            raise RuntimeError(f"Gladia API error: {e}") from e

    async def _poll_transcription(
        self, client: httpx.AsyncClient, job_id: str, max_wait: int = 300
    ) -> dict[str, any]:
        """Poll Gladia transcription status until completion.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client for API requests.
        job_id : str
            Job ID to poll.
        max_wait : int, default=300
            Maximum wait time in seconds.

        Returns
        -------
        dict[str, any]
            Transcription result.

        Raises
        ------
        RuntimeError
            If transcription fails or times out.
        """
        start_time = time.time()

        while time.time() - start_time < max_wait:
            response = await client.get(
                f"{self.BASE_URL}/transcription/{job_id}",
                headers={"X-Gladia-Key": self.api_key},
            )
            response.raise_for_status()
            result = response.json()

            status = result.get("status")

            if status == "done":
                return result
            if status == "error":
                raise RuntimeError(f"Gladia transcription failed: {result.get('error')}")

            await asyncio.sleep(2)

        raise RuntimeError(f"Gladia transcription timed out after {max_wait} seconds")
