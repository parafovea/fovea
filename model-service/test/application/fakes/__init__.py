"""Fake implementations of outbound ports for use case testing.

These are real classes implementing the port interfaces with configurable
canned responses. No mocking libraries are used.
"""

from test.application.fakes.fake_detection_model import FakeDetectionModel
from test.application.fakes.fake_external_api_router import FakeExternalAPIRouter
from test.application.fakes.fake_frame_sampler import FakeFrameSampler
from test.application.fakes.fake_language_model import FakeLanguageModel
from test.application.fakes.fake_tracking_model import FakeTrackingModel
from test.application.fakes.fake_transcriber import FakeTranscriber
from test.application.fakes.fake_video_processor import FakeVideoProcessor
from test.application.fakes.fake_vision_language_model import FakeVisionLanguageModel

__all__ = [
    "FakeDetectionModel",
    "FakeExternalAPIRouter",
    "FakeFrameSampler",
    "FakeLanguageModel",
    "FakeTrackingModel",
    "FakeTranscriber",
    "FakeVideoProcessor",
    "FakeVisionLanguageModel",
]
