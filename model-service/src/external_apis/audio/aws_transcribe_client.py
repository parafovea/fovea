"""AWS Transcribe audio transcription client.

This module provides integration with AWS Transcribe for accurate audio
transcription with speaker diarization support.
"""

import asyncio
import logging
import time
import uuid
from pathlib import Path

import boto3

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class AWSTranscribeClient(AudioAPIClient):
    """Client for AWS Transcribe service.

    AWS Transcribe provides accurate transcription with support for speaker
    diarization, custom vocabularies, and medical terminology.
    """

    def __init__(self, api_key: str, region: str = "us-east-1") -> None:
        """Initialize AWS Transcribe client with credentials.

        Parameters
        ----------
        api_key : str
            AWS credentials in format "access_key_id:secret_access_key".
        region : str, default="us-east-1"
            AWS region for Transcribe service.
        """
        super().__init__(api_key)
        access_key_id, secret_access_key = api_key.split(":", 1)
        self.transcribe_client = boto3.client(
            "transcribe",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )
        self.s3_client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )
        self.bucket_name = f"fovea-transcribe-{uuid.uuid4().hex[:8]}"

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using AWS Transcribe.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en-US", "es-ES"). If None, uses "en-US".
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis (not supported by AWS Transcribe).

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
            logger.info(f"Transcribing audio with AWS Transcribe: {audio_path}")

            job_name = f"transcribe-job-{uuid.uuid4().hex}"
            audio_filename = Path(audio_path).name

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._create_s3_bucket)

            await loop.run_in_executor(
                None, self._upload_to_s3, audio_path, audio_filename
            )

            audio_uri = f"s3://{self.bucket_name}/{audio_filename}"

            settings = {}
            if enable_diarization:
                settings["ShowSpeakerLabels"] = True
                settings["MaxSpeakerLabels"] = 10

            await loop.run_in_executor(
                None,
                self.transcribe_client.start_transcription_job,
                {
                    "TranscriptionJobName": job_name,
                    "Media": {"MediaFileUri": audio_uri},
                    "MediaFormat": "wav",
                    "LanguageCode": language or "en-US",
                    "Settings": settings,
                },
            )

            transcript_data = await self._poll_transcription_job(job_name)

            await loop.run_in_executor(None, self._cleanup_s3, audio_filename)

            segments = self._parse_transcript(transcript_data, enable_diarization)

            full_text = " ".join(s.text for s in segments)
            duration = segments[-1].end if segments else 0.0
            avg_confidence = (
                sum(s.confidence for s in segments) / len(segments) if segments else 0.0
            )

            logger.info("AWS Transcribe completed successfully")

            return TranscriptResult(
                text=full_text,
                segments=segments,
                language=language or "en-US",
                duration=duration,
                confidence=avg_confidence,
                words=None,
            )

        except Exception as e:
            logger.error(f"AWS Transcribe failed: {e}")
            raise RuntimeError(f"AWS Transcribe API error: {e}") from e

    def _create_s3_bucket(self) -> None:
        """Create temporary S3 bucket for audio upload."""
        try:
            self.s3_client.create_bucket(Bucket=self.bucket_name)
        except self.s3_client.exceptions.BucketAlreadyExists:
            pass

    def _upload_to_s3(self, audio_path: str, filename: str) -> None:
        """Upload audio file to S3 bucket."""
        self.s3_client.upload_file(audio_path, self.bucket_name, filename)

    async def _poll_transcription_job(
        self, job_name: str, max_wait: int = 300
    ) -> dict[str, any]:
        """Poll AWS Transcribe job status until completion."""
        start_time = time.time()
        loop = asyncio.get_event_loop()

        while time.time() - start_time < max_wait:
            response = await loop.run_in_executor(
                None, self.transcribe_client.get_transcription_job, job_name
            )

            status = response["TranscriptionJob"]["TranscriptionJobStatus"]

            if status == "COMPLETED":
                import httpx

                transcript_uri = response["TranscriptionJob"]["Transcript"][
                    "TranscriptFileUri"
                ]
                async with httpx.AsyncClient() as client:
                    transcript_response = await client.get(transcript_uri)
                    return transcript_response.json()

            if status == "FAILED":
                failure_reason = response["TranscriptionJob"].get("FailureReason", "Unknown")
                raise RuntimeError(f"AWS Transcribe job failed: {failure_reason}")

            await asyncio.sleep(5)

        raise RuntimeError(f"AWS Transcribe job timed out after {max_wait} seconds")

    def _parse_transcript(
        self, transcript_data: dict[str, any], enable_diarization: bool
    ) -> list[TranscriptSegment]:
        """Parse AWS Transcribe transcript data into segments."""
        segments = []

        if enable_diarization and "speaker_labels" in transcript_data["results"]:
            items = transcript_data["results"]["items"]
            speaker_labels = transcript_data["results"]["speaker_labels"]["segments"]

            for segment in speaker_labels:
                speaker_label = segment["speaker_label"]
                text_parts = []
                start_time = float(segment["start_time"])
                end_time = float(segment["end_time"])

                for item in segment["items"]:
                    for full_item in items:
                        if (
                            full_item.get("start_time") == item["start_time"]
                            and full_item.get("end_time") == item["end_time"]
                        ):
                            text_parts.append(full_item["alternatives"][0]["content"])

                segments.append(
                    TranscriptSegment(
                        start=start_time,
                        end=end_time,
                        text=" ".join(text_parts),
                        confidence=1.0,
                        speaker=speaker_label,
                    )
                )
        else:
            for item in transcript_data["results"]["items"]:
                if item["type"] == "pronunciation":
                    alt = item["alternatives"][0]
                    segments.append(
                        TranscriptSegment(
                            start=float(item["start_time"]),
                            end=float(item["end_time"]),
                            text=alt["content"],
                            confidence=float(alt["confidence"]),
                            speaker=None,
                        )
                    )

        return segments

    def _cleanup_s3(self, filename: str) -> None:
        """Clean up temporary S3 bucket and objects."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=filename)
            self.s3_client.delete_bucket(Bucket=self.bucket_name)
        except Exception as e:
            logger.warning(f"Failed to clean up S3 resources: {e}")
