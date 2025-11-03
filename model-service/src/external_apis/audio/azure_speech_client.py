"""Azure Speech Services audio transcription client.

This module provides integration with Azure Cognitive Services Speech-to-Text
API for accurate audio transcription with speaker diarization support.
"""

import asyncio
import logging

import azure.cognitiveservices.speech as speechsdk  # type: ignore[import-untyped]

from .base import AudioAPIClient, TranscriptResult, TranscriptSegment

logger = logging.getLogger(__name__)


class AzureSpeechClient(AudioAPIClient):
    """Client for Azure Speech Services Speech-to-Text API.

    Azure Speech provides accurate transcription with support for speaker
    diarization, custom models, and real-time transcription.
    """

    def __init__(self, api_key: str, region: str = "eastus") -> None:
        """Initialize Azure Speech client with API key.

        Parameters
        ----------
        api_key : str
            Azure Speech Services subscription key.
        region : str, default="eastus"
            Azure region for Speech Services.
        """
        super().__init__(api_key)
        self.region = region

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        enable_diarization: bool = False,
        enable_sentiment: bool = False,
    ) -> TranscriptResult:
        """Transcribe audio file using Azure Speech Services.

        Parameters
        ----------
        audio_path : str
            Path to audio file to transcribe.
        language : str | None, default=None
            Target language code (e.g., "en-US", "es-ES"). If None, uses "en-US".
        enable_diarization : bool, default=False
            Enable speaker diarization.
        enable_sentiment : bool, default=False
            Enable sentiment analysis (not supported by Azure Speech).

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
            logger.info(f"Transcribing audio with Azure Speech: {audio_path}")

            speech_config = speechsdk.SpeechConfig(subscription=self.api_key, region=self.region)
            speech_config.speech_recognition_language = language or "en-US"
            speech_config.output_format = speechsdk.OutputFormat.Detailed

            if enable_diarization:
                speech_config.set_property(
                    speechsdk.PropertyId.SpeechServiceConnection_EnableSpeakerDiarization,
                    "true",
                )

            audio_config = speechsdk.audio.AudioConfig(filename=audio_path)

            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )

            results = []
            done = asyncio.Event()

            def recognized_cb(evt: speechsdk.SpeechRecognitionEventArgs) -> None:  # type: ignore[no-any-unimported]
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    results.append(evt.result)

            def canceled_cb(evt: speechsdk.SpeechRecognitionCanceledEventArgs) -> None:  # type: ignore[no-any-unimported]
                if evt.reason == speechsdk.CancellationReason.Error:
                    logger.error(f"Azure Speech recognition error: {evt.error_details}")
                done.set()

            def stopped_cb(evt: speechsdk.SessionEventArgs) -> None:  # type: ignore[no-any-unimported]
                done.set()

            speech_recognizer.recognized.connect(recognized_cb)  # type: ignore[no-any-unimported]
            speech_recognizer.canceled.connect(canceled_cb)  # type: ignore[no-any-unimported]
            speech_recognizer.session_stopped.connect(stopped_cb)  # type: ignore[no-any-unimported]

            speech_recognizer.start_continuous_recognition()

            await done.wait()

            speech_recognizer.stop_continuous_recognition()

            segments = []
            full_text_parts = []

            for result in results:
                if hasattr(result, "json") and result.json:
                    import json

                    result_json = json.loads(result.json)
                    nbest = result_json.get("NBest", [])

                    if nbest:
                        best = nbest[0]
                        full_text_parts.append(best.get("Display", ""))

                        for word in best.get("Words", []):
                            segments.append(
                                TranscriptSegment(
                                    start=word["Offset"] / 10000000.0,
                                    end=(word["Offset"] + word["Duration"]) / 10000000.0,
                                    text=word["Word"],
                                    confidence=word.get("Confidence", 1.0),
                                    speaker=None,
                                )
                            )
                else:
                    full_text_parts.append(result.text)
                    segments.append(
                        TranscriptSegment(
                            start=0.0,
                            end=0.0,
                            text=result.text,
                            confidence=1.0,
                            speaker=None,
                        )
                    )

            full_text = " ".join(full_text_parts)
            duration = segments[-1].end if segments else 0.0
            avg_confidence = (
                sum(s.confidence for s in segments) / len(segments) if segments else 0.0
            )

            logger.info("Azure Speech transcription completed successfully")

            return TranscriptResult(
                text=full_text,
                segments=segments,
                language=language or "en-US",
                duration=duration,
                confidence=avg_confidence,
                words=None,
            )

        except Exception as e:
            logger.error(f"Azure Speech transcription failed: {e}")
            raise RuntimeError(f"Azure Speech API error: {e}") from e
