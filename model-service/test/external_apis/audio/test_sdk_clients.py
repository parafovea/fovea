"""Tests for SDK-based audio clients (AssemblyAI, Deepgram, AWS, Azure, Google).

These clients wrap vendor SDKs that live in the optional ``[audio]``
extra. ``conftest.py`` installs lightweight ``sys.modules`` stubs so the
module graph loads; each test then patches the specific SDK symbol
imported into the client module.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture
def tmp_audio(tmp_path: Path) -> str:
    p = tmp_path / "clip.wav"
    p.write_bytes(b"RIFF")
    return str(p)


class TestAssemblyAIClient:
    """Wraps ``assemblyai.Transcriber`` via ``run_in_executor``."""

    @pytest.mark.asyncio
    async def test_happy_path_builds_result(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            assemblyai_client,
        )

        transcript = MagicMock()
        transcript.status = "completed"
        transcript.error = None
        utterance = MagicMock(start=1000, end=2000, text="hello", confidence=0.9, speaker="A")
        transcript.utterances = [utterance]
        transcript.words = [MagicMock(text="hello", start=1000, end=2000, confidence=0.9)]
        transcript.text = "hello"
        transcript.language_code = "en"
        transcript.audio_duration = 2000
        transcript.confidence = 0.9

        transcriber = MagicMock()
        transcriber.transcribe.return_value = transcript

        fake_aai = MagicMock()
        fake_aai.TranscriptionConfig.return_value = MagicMock()
        fake_aai.Transcriber.return_value = transcriber
        error_sentinel = object()
        fake_aai.TranscriptStatus.error = error_sentinel

        with patch.object(assemblyai_client, "aai", fake_aai):
            client = assemblyai_client.AssemblyAIClient("key")
            result = await client.transcribe(
                tmp_audio, enable_diarization=True, enable_sentiment=True
            )

        assert result.text == "hello"
        assert result.duration == 2.0
        assert result.segments[0].speaker == "SPEAKER_A"
        assert result.words is not None
        assert result.words[0]["word"] == "hello"

    @pytest.mark.asyncio
    async def test_error_status_wraps_as_runtime_error(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            assemblyai_client,
        )

        error_sentinel = object()
        transcript = MagicMock()
        transcript.status = error_sentinel
        transcript.error = "bad audio"

        transcriber = MagicMock()
        transcriber.transcribe.return_value = transcript

        fake_aai = MagicMock()
        fake_aai.Transcriber.return_value = transcriber
        fake_aai.TranscriptStatus.error = error_sentinel

        with patch.object(assemblyai_client, "aai", fake_aai):
            client = assemblyai_client.AssemblyAIClient("key")
            with pytest.raises(RuntimeError, match="AssemblyAI API error"):
                await client.transcribe(tmp_audio)


class TestDeepgramClient:
    @pytest.mark.asyncio
    async def test_happy_path_uses_utterances(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            deepgram_client,
        )

        alt = MagicMock(transcript="hello world", confidence=0.9)
        alt.words = [
            MagicMock(word="hello", start=0.0, end=0.5, confidence=0.9),
            MagicMock(word="world", start=0.5, end=1.0, confidence=0.9),
        ]
        channel = MagicMock(alternatives=[alt], detected_language="en")
        utt = MagicMock(start=0.0, end=1.0, transcript="hello world", confidence=0.9, speaker=0)
        results = MagicMock(channels=[channel], utterances=[utt])
        response = MagicMock(results=results)

        dg = MagicMock()
        dg.listen.asyncprerecorded.v.return_value.transcribe_file = AsyncMock(return_value=response)

        with (
            patch.object(deepgram_client, "DGClient", return_value=dg),
            patch.object(deepgram_client, "PrerecordedOptions", MagicMock()),
        ):
            client = deepgram_client.DeepgramClient("key")
            result = await client.transcribe(tmp_audio, enable_diarization=True)

        assert result.text == "hello world"
        assert result.segments[0].speaker == "SPEAKER_0"
        assert result.words is not None
        assert result.duration == 1.0

    @pytest.mark.asyncio
    async def test_empty_response_raises(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            deepgram_client,
        )

        dg = MagicMock()
        dg.listen.asyncprerecorded.v.return_value.transcribe_file = AsyncMock(
            return_value=MagicMock(results=None)
        )

        with (
            patch.object(deepgram_client, "DGClient", return_value=dg),
            patch.object(deepgram_client, "PrerecordedOptions", MagicMock()),
        ):
            client = deepgram_client.DeepgramClient("key")
            with pytest.raises(RuntimeError, match="Deepgram API error"):
                await client.transcribe(tmp_audio)


class TestAWSTranscribeClient:
    @pytest.mark.asyncio
    async def test_happy_path_parses_transcript(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            aws_transcribe_client,
        )

        s3 = MagicMock()
        transcribe = MagicMock()
        transcribe.get_transcription_job.return_value = {
            "TranscriptionJob": {
                "TranscriptionJobStatus": "COMPLETED",
                "Transcript": {"TranscriptFileUri": "https://example/xfer.json"},
            }
        }

        fake_boto = MagicMock()
        fake_boto.client.side_effect = [transcribe, s3]

        transcript_payload = {
            "results": {
                "items": [
                    {
                        "type": "pronunciation",
                        "start_time": "0.0",
                        "end_time": "0.5",
                        "alternatives": [{"content": "hi", "confidence": "0.9"}],
                    }
                ]
            }
        }

        http_resp = MagicMock()
        http_resp.json.return_value = transcript_payload

        class _FakeHttpxClient:
            async def __aenter__(self) -> _FakeHttpxClient:
                return self

            async def __aexit__(self, *_: object) -> None:
                return None

            async def get(self, *_: object, **__: object) -> MagicMock:
                return http_resp

        with (
            patch.object(aws_transcribe_client, "boto3", fake_boto),
            patch(
                "httpx.AsyncClient",
                return_value=_FakeHttpxClient(),
            ),
        ):
            client = aws_transcribe_client.AWSTranscribeClient("access:secret")
            result = await client.transcribe(tmp_audio)

        assert result.text == "hi"
        assert result.segments[0].confidence == pytest.approx(0.9)

    @pytest.mark.asyncio
    async def test_failed_job_raises(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            aws_transcribe_client,
        )

        transcribe = MagicMock()
        transcribe.get_transcription_job.return_value = {
            "TranscriptionJob": {
                "TranscriptionJobStatus": "FAILED",
                "FailureReason": "audio corrupt",
            }
        }
        fake_boto = MagicMock()
        fake_boto.client.side_effect = [transcribe, MagicMock()]

        with patch.object(aws_transcribe_client, "boto3", fake_boto):
            client = aws_transcribe_client.AWSTranscribeClient("access:secret")
            with pytest.raises(RuntimeError, match="AWS Transcribe API error"):
                await client.transcribe(tmp_audio)

    def test_splits_api_key_into_aws_credentials(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            aws_transcribe_client,
        )

        fake_boto = MagicMock()
        with patch.object(aws_transcribe_client, "boto3", fake_boto):
            aws_transcribe_client.AWSTranscribeClient("AKIA:secretxyz", region="us-west-2")

        first = fake_boto.client.call_args_list[0]
        assert first.kwargs["aws_access_key_id"] == "AKIA"
        assert first.kwargs["aws_secret_access_key"] == "secretxyz"  # noqa: S105
        assert first.kwargs["region_name"] == "us-west-2"


class TestAzureSpeechClient:
    @pytest.mark.asyncio
    async def test_happy_path_collects_results(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            azure_speech_client,
        )

        result_obj = MagicMock()
        result_obj.json = None
        result_obj.text = "hello"

        recognizer = MagicMock()

        def _start() -> None:
            # Simulate a recognized event firing, then session stops.
            cb = recognizer.recognized.connect.call_args.args[0]
            evt = MagicMock()
            evt.result = result_obj
            evt.result.reason = azure_speech_client.speechsdk.ResultReason.RecognizedSpeech
            cb(evt)
            stopped_cb = recognizer.session_stopped.connect.call_args.args[0]
            stopped_cb(MagicMock())

        recognizer.start_continuous_recognition.side_effect = _start

        fake_sdk = azure_speech_client.speechsdk
        fake_sdk.SpeechConfig = MagicMock()
        fake_sdk.audio.AudioConfig = MagicMock()
        fake_sdk.SpeechRecognizer = MagicMock(return_value=recognizer)

        client = azure_speech_client.AzureSpeechClient("key", region="eastus")
        out = await client.transcribe(tmp_audio)

        assert "hello" in out.text
        assert out.language == "en-US"

    @pytest.mark.asyncio
    async def test_exception_is_wrapped(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            azure_speech_client,
        )

        fake_sdk = azure_speech_client.speechsdk
        fake_sdk.SpeechConfig.side_effect = ValueError("bad key")

        client = azure_speech_client.AzureSpeechClient("key")
        with pytest.raises(RuntimeError, match="Azure Speech API error"):
            await client.transcribe(tmp_audio)
        fake_sdk.SpeechConfig.side_effect = None


class TestGoogleSpeechClient:
    @pytest.mark.asyncio
    async def test_happy_path_without_diarization(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            google_speech_client,
        )

        word = MagicMock()
        word.word = "hi"
        word.start_offset.total_seconds.return_value = 0.0
        word.end_offset.total_seconds.return_value = 1.0

        alt = MagicMock(transcript="hi", confidence=0.9, words=[word])
        res = MagicMock(alternatives=[alt])
        response = MagicMock(results=[res])

        fake_speech_v2 = google_speech_client.speech_v2
        fake_speech_v2.SpeechAsyncClient.return_value.recognize.return_value = response
        fake_speech_v2.RecognitionConfig = MagicMock()
        fake_speech_v2.AutoDetectDecodingConfig = MagicMock()
        fake_speech_v2.RecognitionFeatures = MagicMock()
        fake_speech_v2.SpeakerDiarizationConfig = MagicMock()
        fake_speech_v2.RecognizeRequest = MagicMock()

        client = google_speech_client.GoogleSpeechClient("key")
        result = await client.transcribe(tmp_audio)

        assert result.text == "hi"
        assert result.segments[0].start == 0.0
        assert result.segments[0].end == 1.0

    @pytest.mark.asyncio
    async def test_exception_is_wrapped(self, tmp_audio: str) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            google_speech_client,
        )

        fake_sv2 = google_speech_client.speech_v2
        fake_sv2.SpeechAsyncClient.return_value.recognize.side_effect = RuntimeError("boom")

        client = google_speech_client.GoogleSpeechClient("key")
        with pytest.raises(RuntimeError, match="Google Speech API error"):
            await client.transcribe(tmp_audio)
        fake_sv2.SpeechAsyncClient.return_value.recognize.side_effect = None


class TestClientConstructors:
    """Smoke tests confirming each client stores ``api_key``."""

    def test_assemblyai(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            assemblyai_client,
        )

        c = assemblyai_client.AssemblyAIClient("k")
        assert c.api_key == "k"

    def test_deepgram(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            deepgram_client,
        )

        c = deepgram_client.DeepgramClient("k")
        assert c.api_key == "k"

    def test_gladia(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            gladia_client,
        )

        c = gladia_client.GladiaClient("k")
        assert c.api_key == "k"

    def test_revai(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            revai_client,
        )

        c = revai_client.RevAIClient("k")
        assert c.api_key == "k"

    def test_azure(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            azure_speech_client,
        )

        c = azure_speech_client.AzureSpeechClient("k")
        assert c.api_key == "k"
        assert c.region == "eastus"

    def test_google(self) -> None:
        from src.infrastructure.adapters.outbound.external_apis.audio import (
            google_speech_client,
        )

        c = google_speech_client.GoogleSpeechClient("k", project_id="p")
        assert c.api_key == "k"
        assert c.project_id == "p"


_ = Any  # silence unused warnings on Any (used by `dict[str, Any]` annotations elsewhere)
