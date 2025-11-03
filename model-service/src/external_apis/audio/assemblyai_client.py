"""AssemblyAI audio transcription client.

This module provides integration with AssemblyAI's Universal Streaming
transcription API for accurate audio transcription with speaker diarization
and sentiment analysis support.
"""

import asyncio
import logging

import assemblyai as aai

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class AssemblyAIClient(AudioAPIClient):
    """Client for AssemblyAI Universal Streaming transcription API.

    AssemblyAI provides accurate transcription with support for speaker
    diarization, sentiment analysis, and automatic language detection.
    """

    def __init__(self, api_key: str) -> None:
        """Initialize AssemblyAI client with API key.

        Parameters
        ----------
        api_key : str
            AssemblyAI API key.
        """
        super().__init__(api_key)
        aai.settings.api_key = api_key

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using AssemblyAI API.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en", "es"). If None, auto-detects.
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis per sentence.

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
            logger.info(f"Transcribing audio with AssemblyAI: {audio_path}")

            config = aai.TranscriptionConfig(
                language_code=language,
                speaker_labels=enable_diarization,
                sentiment_analysis=enable_sentiment,
            )

            transcriber = aai.Transcriber(config=config)

            loop = asyncio.get_event_loop()
            transcript = await loop.run_in_executor(None, transcriber.transcribe, audio_path)

            if transcript.status == aai.TranscriptStatus.error:
                raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

            segments = []
            for utterance in transcript.utterances or []:
                speaker_label = f"SPEAKER_{utterance.speaker}" if utterance.speaker else None
                segments.append(
                    TranscriptSegment(
                        start=utterance.start / 1000.0,
                        end=utterance.end / 1000.0,
                        text=utterance.text,
                        confidence=utterance.confidence,
                        speaker=speaker_label,
                    )
                )

            words = None
            if transcript.words:
                words = [
                    {
                        "word": word.text,
                        "start": word.start / 1000.0,
                        "end": word.end / 1000.0,
                        "confidence": word.confidence,
                    }
                    for word in transcript.words
                ]

            logger.info("AssemblyAI transcription completed successfully")

            return TranscriptResult(
                text=transcript.text or "",
                segments=segments,
                language=transcript.language_code or language or "en",
                duration=(transcript.audio_duration or 0) / 1000.0,
                confidence=transcript.confidence or 0.0,
                words=words,
            )

        except Exception as e:
            logger.error(f"AssemblyAI transcription failed: {e}")
            raise RuntimeError(f"AssemblyAI API error: {e}") from e
