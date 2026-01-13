"""Fake implementations for testing.

This package contains fake implementations of model loaders and services
for use in contract tests. Fakes return configurable canned responses
without loading actual ML models.

Modules
-------
fake_vlm
    Fake VLM loader with configurable responses.
fake_detection
    Fake detection loader with preset detections.
fake_model_manager
    Fake model manager for testing model lifecycle.
fake_external_api
    Fake external API client for testing API integrations.
"""

from test.fakes.fake_model_manager import FakeModelManager, FakeModelManagerConfig
from test.fakes.fake_vlm import FakeVLMConfig, FakeVLMLoader

__all__ = [
    "FakeModelManager",
    "FakeModelManagerConfig",
    "FakeVLMConfig",
    "FakeVLMLoader",
]
