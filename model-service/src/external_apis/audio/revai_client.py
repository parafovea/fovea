"""Rev AI audio transcription client.

This module provides integration with Rev AI Speech-to-Text API for accurate
audio transcription with speaker diarization support.
"""

import asyncio
import logging
import time
from pathlib import Path

import httpx

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class RevAIClient(AudioAPIClient):
    """Client for Rev AI Speech-to-Text API.

    Rev AI provides accurate transcription with support for speaker diarization
    and custom vocabularies.
    """

    BASE_URL = "https://api.rev.ai/speechtotext/v1"

    def __init__(self, api_key: str) -> None:
        """Initialize Rev AI client with API key.

        Parameters
        ----------
        api_key : str
            Rev AI API key.
        """
        super().__init__(api_key)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using Rev AI API.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en", "es"). If None, uses "en".
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis (not supported by Rev AI).

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
            logger.info(f"Transcribing audio with Rev AI: {audio_path}")

            async with httpx.AsyncClient(timeout=300.0) as client:
                with open(audio_path, "rb") as audio_file:
                    files = {"media": (Path(audio_path).name, audio_file, "audio/wav")}
                    data = {
                        "language": language or "en",
                        "speaker_channels_count": 1 if not enable_diarization else None,
                    }

                    response = await client.post(
                        f"{self.BASE_URL}/jobs",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        files=files,
                        data=data,
                    )

                    response.raise_for_status()
                    job = response.json()
                    job_id = job["id"]

                await self._poll_job_status(client, job_id)

                transcript_response = await client.get(
                    f"{self.BASE_URL}/jobs/{job_id}/transcript",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Accept": "application/vnd.rev.transcript.v1.0+json",
                    },
                )
                transcript_response.raise_for_status()
                transcript_data = transcript_response.json()

            segments = []
            full_text_parts = []

            for monologue in transcript_data.get("monologues", []):
                speaker_label = f"SPEAKER_{monologue.get('speaker', 0)}"
                for element in monologue.get("elements", []):
                    if element["type"] == "text":
                        segments.append(
                            TranscriptSegment(
                                start=element["ts"],
                                end=element["end_ts"],
                                text=element["value"],
                                confidence=element.get("confidence", 1.0),
                                speaker=speaker_label if enable_diarization else None,
                            )
                        )
                        full_text_parts.append(element["value"])

            full_text = " ".join(full_text_parts)
            duration = segments[-1].end if segments else 0.0
            avg_confidence = (
                sum(s.confidence for s in segments) / len(segments) if segments else 0.0
            )

            logger.info("Rev AI transcription completed successfully")

            return TranscriptResult(
                text=full_text,
                segments=segments,
                language=language or "en",
                duration=duration,
                confidence=avg_confidence,
                words=None,
            )

        except Exception as e:
            logger.error(f"Rev AI transcription failed: {e}")
            raise RuntimeError(f"Rev AI API error: {e}") from e

    async def _poll_job_status(
        self, client: httpx.AsyncClient, job_id: str, max_wait: int = 300
    ) -> dict[str, str]:
        """Poll Rev AI job status until completion.

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
        dict[str, str]
            Job status dictionary.

        Raises
        ------
        RuntimeError
            If job fails or times out.
        """
        start_time = time.time()

        while time.time() - start_time < max_wait:
            response = await client.get(
                f"{self.BASE_URL}/jobs/{job_id}",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            response.raise_for_status()
            job: dict[str, str] = response.json()  # type: ignore[assignment]

            status = job["status"]

            if status == "transcribed":
                return job
            if status == "failed":
                raise RuntimeError(f"Rev AI job failed: {job.get('failure_detail')}")

            await asyncio.sleep(2)

        raise RuntimeError(f"Rev AI job timed out after {max_wait} seconds")
