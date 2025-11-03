"""Google Speech-to-Text v2 audio transcription client.

This module provides integration with Google Cloud Speech-to-Text v2 API
for accurate audio transcription with speaker diarization support.
"""

import asyncio
import logging

from google.cloud import speech_v2  # type: ignore[import-untyped]

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class GoogleSpeechClient(AudioAPIClient):
    """Client for Google Cloud Speech-to-Text v2 API.

    Google Speech provides accurate transcription with support for speaker
    diarization, automatic punctuation, and profanity filtering.
    """

    def __init__(self, api_key: str, project_id: str = "fovea-project") -> None:
        """Initialize Google Speech client with API key.

        Parameters
        ----------
        api_key : str
            Google Cloud API key or path to service account JSON.
        project_id : str, default="fovea-project"
            Google Cloud project ID.
        """
        super().__init__(api_key)
        self.project_id = project_id
        self.client = speech_v2.SpeechAsyncClient()

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using Google Speech-to-Text v2.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en-US", "es-ES"). If None, uses "en-US".
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis (not supported by Google Speech).

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
            logger.info(f"Transcribing audio with Google Speech: {audio_path}")

            with open(audio_path, "rb") as audio_file:
                audio_content = audio_file.read()

            config = speech_v2.RecognitionConfig(
                auto_decoding_config=speech_v2.AutoDetectDecodingConfig(),
                language_codes=[language or "en-US"],
                model="latest_long",
                features=speech_v2.RecognitionFeatures(
                    enable_automatic_punctuation=True,
                    enable_word_time_offsets=True,
                    diarization_config=speech_v2.SpeakerDiarizationConfig(
                        min_speaker_count=1,
                        max_speaker_count=10,
                    )
                    if enable_diarization
                    else None,
                ),
            )

            request = speech_v2.RecognizeRequest(
                recognizer=f"projects/{self.project_id}/locations/global/recognizers/_",
                config=config,
                content=audio_content,
            )

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, self.client.recognize, request)

            segments = []
            full_text_parts = []

            for result in response.results:  # type: ignore[attr-defined]
                if not result.alternatives:
                    continue

                alternative = result.alternatives[0]
                full_text_parts.append(alternative.transcript)

                if enable_diarization and alternative.words:
                    current_speaker = None
                    current_segment_words: list[str] = []
                    segment_start = 0.0

                    for word_info in alternative.words:
                        word_speaker = (
                            word_info.speaker_label if hasattr(word_info, "speaker_label") else None
                        )

                        if word_speaker != current_speaker and current_segment_words:
                            segments.append(
                                TranscriptSegment(
                                    start=segment_start,
                                    end=word_info.start_offset.total_seconds(),
                                    text=" ".join(current_segment_words),
                                    confidence=alternative.confidence,
                                    speaker=f"SPEAKER_{current_speaker}"
                                    if current_speaker
                                    else None,
                                )
                            )
                            current_segment_words = []

                        if not current_segment_words:
                            segment_start = word_info.start_offset.total_seconds()

                        current_speaker = word_speaker
                        current_segment_words.append(word_info.word)

                    if current_segment_words:
                        last_word = alternative.words[-1]
                        segments.append(
                            TranscriptSegment(
                                start=segment_start,
                                end=last_word.end_offset.total_seconds(),
                                text=" ".join(current_segment_words),
                                confidence=alternative.confidence,
                                speaker=f"SPEAKER_{current_speaker}" if current_speaker else None,
                            )
                        )
                else:
                    if alternative.words:
                        start_time = alternative.words[0].start_offset.total_seconds()
                        end_time = alternative.words[-1].end_offset.total_seconds()
                    else:
                        start_time = 0.0
                        end_time = 0.0

                    segments.append(
                        TranscriptSegment(
                            start=start_time,
                            end=end_time,
                            text=alternative.transcript,
                            confidence=alternative.confidence,
                            speaker=None,
                        )
                    )

            full_text = " ".join(full_text_parts)
            duration = segments[-1].end if segments else 0.0
            avg_confidence = (
                sum(s.confidence for s in segments) / len(segments) if segments else 0.0
            )

            logger.info("Google Speech transcription completed successfully")

            return TranscriptResult(
                text=full_text,
                segments=segments,
                language=language or "en-US",
                duration=duration,
                confidence=avg_confidence,
                words=None,
            )

        except Exception as e:
            logger.error(f"Google Speech transcription failed: {e}")
            raise RuntimeError(f"Google Speech API error: {e}") from e
