"""External audio API clients for transcription and diarization.

This package provides clients for external audio transcription services including
AssemblyAI, Deepgram, Rev AI, Gladia, AWS Transcribe, Google Speech-to-Text,
and Azure Speech Services.
"""

from .assemblyai_client import AssemblyAIClient
from .aws_transcribe_client import AWSTranscribeClient
from .azure_speech_client import AzureSpeechClient
from .base import AudioAPIClient, TranscriptResult, TranscriptSegment
from .deepgram_client import DeepgramClient
from .gladia_client import GladiaClient
from .google_speech_client import GoogleSpeechClient
from .revai_client import RevAIClient

__all__ = [
    "AWSTranscribeClient",
    "AssemblyAIClient",
    "AudioAPIClient",
    "AzureSpeechClient",
    "DeepgramClient",
    "GladiaClient",
    "GoogleSpeechClient",
    "RevAIClient",
    "TranscriptResult",
    "TranscriptSegment",
]
