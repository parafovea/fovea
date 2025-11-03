"""Deepgram audio transcription client.

This module provides integration with Deepgram's Nova-3 transcription API
for fast and accurate audio transcription with speaker diarization support.
"""

import logging

from deepgram import DeepgramClient as DGClient
from deepgram import PrerecordedOptions

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class DeepgramClient(AudioAPIClient):
    """Client for Deepgram Nova-3 transcription API.

    Deepgram provides fast transcription with support for speaker diarization,
    sentiment analysis, and automatic punctuation.
    """

    def __init__(self, api_key: str) -> None:
        """Initialize Deepgram client with API key.

        Parameters
        ----------
        api_key : str
            Deepgram API key.
        """
        super().__init__(api_key)
        self.client = DGClient(api_key)

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using Deepgram API.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en", "es"). If None, auto-detects.
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
            logger.info(f"Transcribing audio with Deepgram: {audio_path}")

            with open(audio_path, "rb") as audio_file:
                audio_data = audio_file.read()

            options = PrerecordedOptions(
                model="nova-3",
                language=language or "en",
                diarize=enable_diarization,
                sentiment=enable_sentiment,
                punctuate=True,
                utterances=True,
                smart_format=True,
            )

            response = await self.client.listen.asyncprerecorded.v("1").transcribe_file(
                {"buffer": audio_data}, options
            )

            if not response or not response.results:
                raise RuntimeError("Deepgram API returned empty response")

            results = response.results
            channels = results.channels

            if not channels or not channels[0].alternatives:
                raise RuntimeError("No transcription alternatives in Deepgram response")

            alternative = channels[0].alternatives[0]
            transcript_text = alternative.transcript or ""

            segments = []
            if results.utterances:
                for utterance in results.utterances:
                    speaker_label = (
                        f"SPEAKER_{utterance.speaker}" if utterance.speaker is not None else None
                    )
                    segments.append(
                        TranscriptSegment(
                            start=utterance.start,
                            end=utterance.end,
                            text=utterance.transcript,
                            confidence=utterance.confidence,
                            speaker=speaker_label,
                        )
                    )
            else:
                for word_group in alternative.words or []:
                    segments.append(
                        TranscriptSegment(
                            start=word_group.start,
                            end=word_group.end,
                            text=word_group.word,
                            confidence=word_group.confidence,
                            speaker=f"SPEAKER_{word_group.speaker}"
                            if hasattr(word_group, "speaker")
                            else None,
                        )
                    )

            words = None
            if alternative.words:
                words = [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "confidence": word.confidence,
                    }
                    for word in alternative.words
                ]

            duration = (
                results.channels[0].alternatives[0].words[-1].end if alternative.words else 0.0
            )

            logger.info("Deepgram transcription completed successfully")

            return TranscriptResult(
                text=transcript_text,
                segments=segments,
                language=results.channels[0].detected_language or language or "en",
                duration=duration,
                confidence=alternative.confidence or 0.0,
                words=words,
            )

        except Exception as e:
            logger.error(f"Deepgram transcription failed: {e}")
            raise RuntimeError(f"Deepgram API error: {e}") from e
