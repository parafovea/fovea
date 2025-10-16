"""External audio API clients for transcription and diarization.

This package provides clients for external audio transcription services including
AssemblyAI, Deepgram, Rev AI, Gladia, AWS Transcribe, Google Speech-to-Text,
and Azure Speech Services.
"""

from .assemblyai_client import AssemblyAIClient
from .azure_speech_client import AzureSpeechClient
from .aws_transcribe_client import AWSTranscribeClient
from .base import AudioAPIClient, TranscriptSegment, TranscriptResult
from .deepgram_client import DeepgramClient
from .gladia_client import GladiaClient
from .google_speech_client import GoogleSpeechClient
from .revai_client import RevAIClient

__all__ = [
    "AudioAPIClient",
    "TranscriptSegment",
    "TranscriptResult",
    "AssemblyAIClient",
    "DeepgramClient",
    "RevAIClient",
    "GladiaClient",
    "AWSTranscribeClient",
    "GoogleSpeechClient",
    "AzureSpeechClient",
]
