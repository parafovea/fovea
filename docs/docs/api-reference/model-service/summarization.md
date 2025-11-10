---
sidebar_label: summarization
title: summarization
---

Video summarization pipeline using Vision Language Models.

This module provides functions for summarizing video content using VLMs.
It extracts frames, generates descriptions, and produces structured summaries
tailored to specific personas and their information needs. Supports optional
audio transcription and multimodal fusion strategies.

## io

## logging

## os

## re

## time

## uuid

## Path

## Any

## trace

## Image

## extract\_audio\_track

## has\_audio\_stream

## AudioSegment

## FusionConfig

## FusionStrategy

## VisualFrame

## create\_fusion\_strategy

## ExternalAPIConfig

## ExternalModelRouter

## KeyFrame

## SummarizeRequest

## SummarizeResponse

## extract\_frames\_uniform

## get\_video\_info

## VLMConfig

## create\_vlm\_loader

#### logger

#### tracer

## SummarizationError Objects

```python
class SummarizationError(Exception)
```

Raised when video summarization fails.

#### get\_default\_prompt\_template

```python
def get_default_prompt_template() -> str
```

Get the default prompt template for video summarization.

Returns
-------
str
    Prompt template with placeholders for persona information and frames.

#### get\_persona\_prompt

```python
def get_persona_prompt(persona_role: str | None = None,
                       information_need: str | None = None) -> str
```

Generate persona-specific prompt for video summarization.

Parameters
----------
persona_role : str | None, default=None
    Role or title of the persona (e.g., &quot;Baseball Scout&quot;).
information_need : str | None, default=None
    Description of what information the persona needs.

Returns
-------
str
    Formatted prompt for the VLM.

#### parse\_vlm\_response

```python
def parse_vlm_response(response: str) -> tuple[str, str | None]
```

Parse VLM response into summary and visual analysis components.

Parameters
----------
response : str
    Raw text response from the VLM.

Returns
-------
tuple[str, str | None]
    Tuple of (summary, visual_analysis). If response cannot be parsed,
    returns full response as summary with None for visual analysis.

#### identify\_key\_frames

```python
def identify_key_frames(frames: list[tuple[int, Any]],
                        video_fps: float,
                        num_key_frames: int = 3) -> list[KeyFrame]
```

Identify key frames from extracted frames.

Parameters
----------
frames : list[tuple[int, Any]]
    List of (frame_number, frame_array) tuples.
video_fps : float
    Video frames per second.
num_key_frames : int, default=3
    Number of key frames to identify.

Returns
-------
list[KeyFrame]
    List of key frame objects with descriptions.

#### convert\_image\_to\_base64

```python
def convert_image_to_base64(image: Image.Image,
                            format: str = "JPEG",
                            max_dimension: int = 1024) -> bytes
```

Convert PIL Image to base64-encoded bytes.

Parameters
----------
image : Image.Image
    PIL Image to convert.
format : str, default=&quot;JPEG&quot;
    Image format for encoding (JPEG or PNG).
max_dimension : int, default=1024
    Maximum dimension for resizing (maintains aspect ratio).

Returns
-------
bytes
    Base64-encoded image bytes.

#### calculate\_frame\_sample\_count

```python
def calculate_frame_sample_count(total_frames: int, provider: str,
                                 max_frames: int) -> int
```

Calculate appropriate number of frames to sample for external API.

Parameters
----------
total_frames : int
    Total number of frames in video.
provider : str
    External API provider (anthropic, openai, google).
max_frames : int
    User-requested maximum frames.

Returns
-------
int
    Number of frames to sample (respects provider limits).

#### get\_external\_api\_prompt

```python
def get_external_api_prompt(frame_count: int, duration: float,
                            timestamps: list[float]) -> str
```

Generate prompt for external API video summarization.

Parameters
----------
frame_count : int
    Number of frames being analyzed.
duration : float
    Video duration in seconds.
timestamps : list[float]
    Timestamp in seconds for each frame.

Returns
-------
str
    Formatted prompt for external API.

#### transcribe\_audio

```python
async def transcribe_audio(
    video_path: str,
    audio_model: str = "whisper-v3-turbo",
    language: str | None = None,
    enable_diarization: bool = False
) -> tuple[str, list[AudioSegment], str | None, int | None, float]
```

Extract and transcribe audio from video.

Parameters
----------
video_path : str
    Path to video file.
audio_model : str, default=&quot;whisper-v3-turbo&quot;
    Audio transcription model to use.
language : str | None, default=None
    Target language code. If None, auto-detects.
enable_diarization : bool, default=False
    Whether to perform speaker diarization.

Returns
-------
tuple[str, list[AudioSegment], str | None, int | None, float]
    Tuple of (full_transcript, segments, detected_language, speaker_count, processing_time).

Raises
------
SummarizationError
    If audio extraction or transcription fails.

#### summarize\_video\_with\_external\_api

```python
async def summarize_video_with_external_api(
        request: SummarizeRequest, video_path: str,
        api_config: ExternalAPIConfig, provider: str) -> SummarizeResponse
```

Summarize video using external VLM API.

Parameters
----------
request : SummarizeRequest
    Request containing parameters for summarization.
video_path : str
    Path to the video file to summarize.
api_config : ExternalAPIConfig
    Configuration for external API client.
provider : str
    Provider name (anthropic, openai, google).

Returns
-------
SummarizeResponse
    Generated video summary with analysis and key frames.

Raises
------
SummarizationError
    If video processing or API call fails.

#### summarize\_video\_with\_vlm

```python
async def summarize_video_with_vlm(
        request: SummarizeRequest,
        video_path: str,
        model_config: VLMConfig,
        model_name: str,
        persona_role: str | None = None,
        information_need: str | None = None) -> SummarizeResponse
```

Summarize video using Vision Language Model.

Parameters
----------
request : SummarizeRequest
    Request containing parameters for summarization.
video_path : str
    Path to the video file to summarize.
model_config : VLMConfig
    Configuration for the VLM to use.
model_name : str
    Name of the model (for loader selection).
persona_role : str | None, default=None
    Role of the persona requesting the summary.
information_need : str | None, default=None
    Information need of the persona.

Returns
-------
SummarizeResponse
    Generated video summary with analysis and key frames.

Raises
------
SummarizationError
    If video processing or model inference fails.

#### get\_video\_path\_for\_id

```python
def get_video_path_for_id(video_id: str,
                          data_dir: str = "/videos") -> str | None
```

Resolve video ID to file path.

Parameters
----------
video_id : str
    Video identifier from request.
data_dir : str, default=&quot;/videos&quot;
    Base directory containing video files.

Returns
-------
str | None
    Full path to video file, or None if not found.

