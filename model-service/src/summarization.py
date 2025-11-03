"""Video summarization pipeline using Vision Language Models.

This module provides functions for summarizing video content using VLMs.
It extracts frames, generates descriptions, and produces structured summaries
tailored to specific personas and their information needs. Supports optional
audio transcription and multimodal fusion strategies.
"""

import io
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

from opentelemetry import trace
from PIL import Image

from .audio_utils import extract_audio_track, has_audio_stream
from .av_fusion import (
    AudioSegment,
    FusionConfig,
    FusionStrategy,
    VisualFrame,
    create_fusion_strategy,
)
from .external_apis.base import ExternalAPIConfig
from .external_apis.router import ExternalModelRouter
from .models import KeyFrame, SummarizeRequest, SummarizeResponse
from .video_utils import extract_frames_uniform, get_video_info
from .vlm_loader import VLMConfig, create_vlm_loader

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class SummarizationError(Exception):
    """Raised when video summarization fails."""


def get_default_prompt_template() -> str:
    """Get the default prompt template for video summarization.

    Returns
    -------
    str
        Prompt template with placeholders for persona information and frames.
    """
    return """You are analyzing a video for {persona_role} with the following information need:
{information_need}

Based on the frames from this video, provide:

1. A concise summary (2-3 sentences) describing what happens in the video
2. A detailed visual analysis noting:
   - Key objects, people, or entities present
   - Important actions or events that occur
   - Spatial relationships and scene composition
   - Temporal progression and changes

Focus on aspects relevant to the persona's role and information need. Be factual and specific."""


def get_persona_prompt(
    persona_role: str | None = None,
    information_need: str | None = None,
) -> str:
    """Generate persona-specific prompt for video summarization.

    Parameters
    ----------
    persona_role : str | None, default=None
        Role or title of the persona (e.g., "Baseball Scout").
    information_need : str | None, default=None
        Description of what information the persona needs.

    Returns
    -------
    str
        Formatted prompt for the VLM.
    """
    template = get_default_prompt_template()

    if persona_role is None:
        persona_role = "Analyst"
    if information_need is None:
        information_need = "Understanding the content and events in this video"

    return template.format(
        persona_role=persona_role,
        information_need=information_need,
    )


def parse_vlm_response(response: str) -> tuple[str, str | None]:
    """Parse VLM response into summary and visual analysis components.

    Parameters
    ----------
    response : str
        Raw text response from the VLM.

    Returns
    -------
    tuple[str, str | None]
        Tuple of (summary, visual_analysis). If response cannot be parsed,
        returns full response as summary with None for visual analysis.
    """
    response = response.strip()

    summary_markers = ["summary:", "1.", "**summary**"]
    analysis_markers = ["visual analysis:", "2.", "**visual analysis**", "detailed"]

    summary_start = -1
    analysis_start = -1

    response_lower = response.lower()

    for marker in summary_markers:
        idx = response_lower.find(marker)
        if idx != -1:
            summary_start = idx + len(marker)
            break

    for marker in analysis_markers:
        idx = response_lower.find(marker)
        if idx != -1:
            analysis_start = idx + len(marker)
            break

    if summary_start != -1 and analysis_start != -1:
        summary = response[summary_start:analysis_start].strip()
        for marker in analysis_markers:
            if summary.lower().endswith(marker):
                summary = summary[: -len(marker)].strip()
        visual_analysis = response[analysis_start:].strip()
        return summary, visual_analysis

    if summary_start != -1:
        return response[summary_start:].strip(), None

    return response, None


def identify_key_frames(
    frames: list[tuple[int, Any]],
    video_fps: float,
    num_key_frames: int = 3,
) -> list[KeyFrame]:
    """Identify key frames from extracted frames.

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
    """
    if len(frames) <= num_key_frames:
        selected_frames = frames
    else:
        indices = [int(i * (len(frames) - 1) / (num_key_frames - 1)) for i in range(num_key_frames)]
        selected_frames = [frames[i] for i in indices]

    key_frames = []
    for idx, (frame_number, _) in enumerate(selected_frames):
        timestamp = frame_number / video_fps if video_fps > 0 else 0.0

        if idx == 0:
            description = "Opening frames showing initial scene"
        elif idx == len(selected_frames) - 1:
            description = "Closing frames showing final state"
        else:
            description = f"Mid-sequence frame at {timestamp:.1f} seconds"

        key_frames.append(
            KeyFrame(
                frame_number=frame_number,
                timestamp=timestamp,
                description=description,
                confidence=0.8,
            )
        )

    return key_frames


def convert_image_to_base64(
    image: Image.Image, format: str = "JPEG", max_dimension: int = 1024
) -> bytes:
    """Convert PIL Image to base64-encoded bytes.

    Parameters
    ----------
    image : Image.Image
        PIL Image to convert.
    format : str, default="JPEG"
        Image format for encoding (JPEG or PNG).
    max_dimension : int, default=1024
        Maximum dimension for resizing (maintains aspect ratio).

    Returns
    -------
    bytes
        Base64-encoded image bytes.
    """
    if max(image.size) > max_dimension:
        ratio = max_dimension / max(image.size)
        new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format=format, quality=85)
    return buffer.getvalue()


def calculate_frame_sample_count(
    total_frames: int,
    provider: str,
    max_frames: int,
) -> int:
    """Calculate appropriate number of frames to sample for external API.

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
    """
    provider_limits = {
        "anthropic": 20,
        "openai": 10,
        "google": 50,
    }

    provider_limit = provider_limits.get(provider, 10)
    return min(max_frames, provider_limit, total_frames)


def get_external_api_prompt(
    frame_count: int,
    duration: float,
    timestamps: list[float],
) -> str:
    """Generate prompt for external API video summarization.

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
    """
    timestamp_str = ", ".join(f"{t:.1f}s" for t in timestamps)

    return f"""You are analyzing a video. I have provided {frame_count} frames sampled evenly throughout the video.

Please provide a summary that describes:
1. What is happening in the video
2. Key objects, people, and actions
3. Scene changes and transitions
4. Any notable events or moments

Focus on factual descriptions of visual content.

Video duration: {duration:.1f} seconds
Frames sampled at: {timestamp_str}"""


async def transcribe_audio(
    video_path: str,
    audio_model: str = "whisper-v3-turbo",
    language: str | None = None,
    enable_diarization: bool = False,
) -> tuple[str, list[AudioSegment], str | None, int | None, float]:
    """Extract and transcribe audio from video.

    Parameters
    ----------
    video_path : str
        Path to video file.
    audio_model : str, default="whisper-v3-turbo"
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
    """
    start_time = time.time()

    try:
        if not await has_audio_stream(video_path):
            safe_video_path = str(video_path).replace("\r", "").replace("\n", "")
            logger.info(f"Video has no audio track: {safe_video_path}")
            return "", [], None, None, 0.0

        import tempfile

        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        audio_path = temp_file.name
        temp_file.close()

        try:
            await extract_audio_track(video_path, output_path=audio_path)

            from .audio_loader import AudioFramework, TranscriptionConfig, WhisperLoader

            config = TranscriptionConfig(
                model_id="openai/whisper-large-v3-turbo",
                framework=AudioFramework.WHISPER,
                language=language,
                device="cuda" if __import__("torch").cuda.is_available() else "cpu",
            )

            loader = WhisperLoader(config)
            loader.load()

            try:
                result = loader.transcribe(audio_path)

                segments = [
                    AudioSegment(
                        start=seg.start,
                        end=seg.end,
                        text=seg.text,
                        confidence=seg.confidence,
                    )
                    for seg in result.segments
                ]

                speaker_count = None
                if enable_diarization:
                    from .audio_loader import DiarizationConfig, PyannoteLoader

                    diar_config = DiarizationConfig(
                        model_id="pyannote/speaker-diarization-3.1",
                        device=config.device,
                    )
                    diar_loader = PyannoteLoader(diar_config)
                    diar_loader.load()

                    try:
                        diar_result = diar_loader.diarize(audio_path)
                        speaker_count = len({seg.speaker for seg in diar_result.segments})

                        speaker_map = {}
                        for diar_seg in diar_result.segments:
                            speaker_map[(diar_seg.start, diar_seg.end)] = diar_seg.speaker

                        for seg in segments:
                            for (diar_start, _diar_end), speaker in speaker_map.items():
                                if abs(seg.start - diar_start) < 0.5:
                                    seg.speaker = speaker
                                    break

                    finally:
                        diar_loader.unload()

                processing_time = time.time() - start_time

                logger.info(
                    f"Audio transcription completed in {processing_time:.2f}s "
                    f"({len(segments)} segments, language={result.language})"
                )

                return (
                    result.text,
                    segments,
                    result.language,
                    speaker_count,
                    processing_time,
                )

            finally:
                loader.unload()

        finally:
            import os

            if os.path.exists(audio_path):
                os.remove(audio_path)

    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        raise SummarizationError(f"Audio transcription failed: {e}") from e


async def summarize_video_with_external_api(
    request: SummarizeRequest,
    video_path: str,
    api_config: ExternalAPIConfig,
    provider: str,
) -> SummarizeResponse:
    """Summarize video using external VLM API.

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
    """
    with tracer.start_as_current_span("summarize_video_external_api") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("provider", provider)

        try:
            video_info = get_video_info(video_path)
            safe_provider = str(provider).replace("\r", "").replace("\n", "")
            safe_video_path = str(video_path).replace("\r", "").replace("\n", "")
            logger.info(
                f"Processing video with external API ({safe_provider}): {safe_video_path} "
                f"({video_info.frame_count} frames, {video_info.duration:.2f}s)"
            )

            num_frames = calculate_frame_sample_count(
                total_frames=video_info.frame_count,
                provider=provider,
                max_frames=request.max_frames,
            )

            frames_with_indices = extract_frames_uniform(
                video_path,
                num_frames=num_frames,
                max_dimension=1024,
            )

            if not frames_with_indices:
                raise SummarizationError("No frames could be extracted from video")

            span.set_attribute("frames_extracted", len(frames_with_indices))

            images_bytes = []
            timestamps = []
            for frame_idx, frame_array in frames_with_indices:
                image = Image.fromarray(frame_array)
                image_bytes = convert_image_to_base64(image, format="JPEG", max_dimension=1024)
                images_bytes.append(image_bytes)
                timestamps.append(frame_idx / video_info.fps if video_info.fps > 0 else 0.0)

            # Audio processing (if enabled)
            audio_transcript = None
            audio_segments: list[AudioSegment] = []
            audio_language = None
            speaker_count = None
            processing_time_audio = 0.0

            if request.enable_audio:
                logger.info("Audio processing enabled, transcribing video")
                (
                    audio_transcript,
                    audio_segments,
                    audio_language,
                    speaker_count,
                    processing_time_audio,
                ) = await transcribe_audio(
                    video_path,
                    audio_model="whisper-v3-turbo",
                    language=request.audio_language,
                    enable_diarization=request.enable_speaker_diarization,
                )
                span.set_attribute("audio_segments", len(audio_segments))
                span.set_attribute("audio_language", audio_language or "unknown")
                span.set_attribute("speaker_count", speaker_count or 0)

            prompt = get_external_api_prompt(
                frame_count=len(images_bytes),
                duration=video_info.duration,
                timestamps=timestamps,
            )

            logger.info(f"Calling {provider} API with {len(images_bytes)} frames")
            router = ExternalModelRouter()

            try:
                visual_start_time = time.time()
                result = await router.generate_from_images(
                    config=api_config,
                    provider=provider,
                    images=images_bytes,
                    prompt=prompt,
                    max_tokens=1024,
                )
                processing_time_visual = time.time() - visual_start_time

                response_text = result["text"]
                usage = result.get("usage", {})

                logger.info(
                    f"External API response received. Tokens: {usage.get('total_tokens', 'unknown')}"
                )

                summary, visual_analysis = parse_vlm_response(response_text)

                key_frames = identify_key_frames(
                    frames_with_indices,
                    video_info.fps,
                    num_key_frames=min(3, len(frames_with_indices)),
                )

                span.set_attribute("summary_length", len(summary))
                span.set_attribute("key_frames_identified", len(key_frames))
                span.set_attribute("tokens_used", usage.get("total_tokens", 0))

                # Apply fusion if audio is enabled
                processing_time_fusion = 0.0
                fusion_strategy_name = None
                transcript_json = None

                if request.enable_audio and audio_transcript:
                    logger.info("Applying audio-visual fusion")

                    # Convert frames to VisualFrame objects
                    visual_frames = [
                        VisualFrame(
                            timestamp=timestamps[i],
                            frame_number=frame_idx,
                            description=f"Frame at {timestamps[i]:.1f}s",
                            objects=[],
                            confidence=0.85,
                        )
                        for i, (frame_idx, _) in enumerate(frames_with_indices)
                    ]

                    # Create fusion config
                    fusion_config = FusionConfig(
                        strategy=FusionStrategy(request.fusion_strategy or "sequential"),
                        audio_weight=0.5,
                        visual_weight=0.5,
                        include_transcript=True,
                        include_speaker_labels=True,
                    )

                    strategy = create_fusion_strategy(fusion_config)
                    fusion_result = await strategy.fuse(
                        audio_transcript=audio_transcript,
                        audio_segments=audio_segments,
                        visual_summary=summary,
                        visual_frames=visual_frames,
                        audio_language=audio_language,
                        speaker_count=speaker_count,
                    )

                    # Update with fused summary
                    summary = fusion_result.summary
                    processing_time_fusion = fusion_result.processing_time_fusion
                    fusion_strategy_name = fusion_result.fusion_strategy

                    # Build transcript JSON
                    transcript_json = {
                        "segments": [
                            {
                                "start": seg.start,
                                "end": seg.end,
                                "text": seg.text,
                                "speaker": seg.speaker,
                                "confidence": seg.confidence,
                            }
                            for seg in audio_segments
                        ]
                    }

                    span.set_attribute("fusion_strategy", fusion_strategy_name)
                    span.set_attribute("processing_time_fusion", processing_time_fusion)

                return SummarizeResponse(
                    id=str(uuid.uuid4()),
                    video_id=request.video_id,
                    persona_id=request.persona_id,
                    summary=summary,
                    visual_analysis=visual_analysis,
                    audio_transcript=audio_transcript,
                    key_frames=key_frames,
                    confidence=0.85,
                    transcript_json=transcript_json,
                    audio_language=audio_language,
                    speaker_count=speaker_count,
                    audio_model_used="whisper-v3-turbo" if request.enable_audio else None,
                    visual_model_used=provider,
                    fusion_strategy=fusion_strategy_name,
                    processing_time_audio=processing_time_audio if request.enable_audio else None,
                    processing_time_visual=processing_time_visual,
                    processing_time_fusion=processing_time_fusion if request.enable_audio else None,
                )

            finally:
                await router.close_all()

        except Exception as e:
            logger.error(f"External API video summarization failed: {e}")
            span.set_attribute("error", str(e))
            raise SummarizationError(f"External API summarization failed: {e}") from e


async def summarize_video_with_vlm(
    request: SummarizeRequest,
    video_path: str,
    model_config: VLMConfig,
    model_name: str,
    persona_role: str | None = None,
    information_need: str | None = None,
) -> SummarizeResponse:
    """Summarize video using Vision Language Model.

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
    """
    with tracer.start_as_current_span("summarize_video_with_vlm") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("model_name", model_name)

        try:
            video_info = get_video_info(video_path)
            safe_video_path = str(video_path).replace("\r", "").replace("\n", "")
            logger.info(
                f"Processing video: {safe_video_path} "
                f"({video_info.frame_count} frames, {video_info.duration:.2f}s)"
            )

            num_frames = min(request.max_frames, video_info.frame_count)
            frames_with_indices = extract_frames_uniform(
                video_path,
                num_frames=num_frames,
                max_dimension=1024,
            )

            if not frames_with_indices:
                raise SummarizationError("No frames could be extracted from video")

            span.set_attribute("frames_extracted", len(frames_with_indices))

            images = [Image.fromarray(frame_array) for _, frame_array in frames_with_indices]

            # Audio processing (if enabled)
            audio_transcript = None
            audio_segments: list[AudioSegment] = []
            audio_language = None
            speaker_count = None
            processing_time_audio = 0.0

            if request.enable_audio:
                logger.info("Audio processing enabled, transcribing video")
                (
                    audio_transcript,
                    audio_segments,
                    audio_language,
                    speaker_count,
                    processing_time_audio,
                ) = await transcribe_audio(
                    video_path,
                    audio_model="whisper-v3-turbo",
                    language=request.audio_language,
                    enable_diarization=request.enable_speaker_diarization,
                )
                span.set_attribute("audio_segments", len(audio_segments))
                span.set_attribute("audio_language", audio_language or "unknown")
                span.set_attribute("speaker_count", speaker_count or 0)

            logger.info(f"Loading VLM model: {model_name}")
            loader = create_vlm_loader(model_name, model_config)
            loader.load()

            try:
                prompt = get_persona_prompt(persona_role, information_need)

                logger.info(f"Generating summary with {len(images)} frames")
                visual_start_time = time.time()
                response = loader.generate(
                    images=images,
                    prompt=prompt,
                    max_new_tokens=1024,
                    temperature=0.7,
                )
                processing_time_visual = time.time() - visual_start_time

                summary, visual_analysis = parse_vlm_response(response)

                key_frames = identify_key_frames(
                    frames_with_indices,
                    video_info.fps,
                    num_key_frames=min(3, len(frames_with_indices)),
                )

                span.set_attribute("summary_length", len(summary))
                span.set_attribute("key_frames_identified", len(key_frames))

                # Apply fusion if audio is enabled
                processing_time_fusion = 0.0
                fusion_strategy_name = None
                transcript_json = None

                if request.enable_audio and audio_transcript:
                    logger.info("Applying audio-visual fusion")

                    # Convert frames to VisualFrame objects
                    timestamps = [
                        frame_idx / video_info.fps if video_info.fps > 0 else 0.0
                        for frame_idx, _ in frames_with_indices
                    ]
                    visual_frames = [
                        VisualFrame(
                            timestamp=timestamps[i],
                            frame_number=frame_idx,
                            description=f"Frame at {timestamps[i]:.1f}s",
                            objects=[],
                            confidence=0.85,
                        )
                        for i, (frame_idx, _) in enumerate(frames_with_indices)
                    ]

                    # Create fusion config
                    fusion_config = FusionConfig(
                        strategy=FusionStrategy(request.fusion_strategy or "sequential"),
                        audio_weight=0.5,
                        visual_weight=0.5,
                        include_transcript=True,
                        include_speaker_labels=True,
                    )

                    strategy = create_fusion_strategy(fusion_config)
                    fusion_result = await strategy.fuse(
                        audio_transcript=audio_transcript,
                        audio_segments=audio_segments,
                        visual_summary=summary,
                        visual_frames=visual_frames,
                        audio_language=audio_language,
                        speaker_count=speaker_count,
                    )

                    # Update with fused summary
                    summary = fusion_result.summary
                    processing_time_fusion = fusion_result.processing_time_fusion
                    fusion_strategy_name = fusion_result.fusion_strategy

                    # Build transcript JSON
                    transcript_json = {
                        "segments": [
                            {
                                "start": seg.start,
                                "end": seg.end,
                                "text": seg.text,
                                "speaker": seg.speaker,
                                "confidence": seg.confidence,
                            }
                            for seg in audio_segments
                        ]
                    }

                    span.set_attribute("fusion_strategy", fusion_strategy_name)
                    span.set_attribute("processing_time_fusion", processing_time_fusion)

                return SummarizeResponse(
                    id=str(uuid.uuid4()),
                    video_id=request.video_id,
                    persona_id=request.persona_id,
                    summary=summary,
                    visual_analysis=visual_analysis,
                    audio_transcript=audio_transcript,
                    key_frames=key_frames,
                    confidence=0.85,
                    transcript_json=transcript_json,
                    audio_language=audio_language,
                    speaker_count=speaker_count,
                    audio_model_used="whisper-v3-turbo" if request.enable_audio else None,
                    visual_model_used=model_name,
                    fusion_strategy=fusion_strategy_name,
                    processing_time_audio=processing_time_audio if request.enable_audio else None,
                    processing_time_visual=processing_time_visual,
                    processing_time_fusion=processing_time_fusion if request.enable_audio else None,
                )

            finally:
                loader.unload()
                logger.info("VLM model unloaded")

        except Exception as e:
            logger.error(f"Video summarization failed: {e}")
            span.set_attribute("error", str(e))
            raise SummarizationError(f"Summarization failed: {e}") from e


def get_video_path_for_id(video_id: str, data_dir: str = "/videos") -> str | None:
    """Resolve video ID to file path.

    Parameters
    ----------
    video_id : str
        Video identifier from request.
    data_dir : str, default="/videos"
        Base directory containing video files.

    Returns
    -------
    str | None
        Full path to video file, or None if not found.
    """
    data_path = Path(data_dir)

    if not data_path.exists():
        logger.warning(f"Video directory does not exist: {data_dir}")
        return None

    video_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"]

    data_path_resolved = data_path.resolve()

    for ext in video_extensions:
        video_path = data_path / f"{video_id}{ext}"
        video_path_resolved = video_path.resolve()
        # Validate path is within allowed directory BEFORE checking existence
        if (
            os.path.commonpath([str(video_path_resolved), str(data_path_resolved)])
            == str(data_path_resolved)
            and video_path_resolved.exists()
        ):
            return str(video_path)

    potential_matches = list(data_path.glob(f"{video_id}.*"))
    for match in potential_matches:
        resolved_match = match.resolve()
        # Validate path is within allowed directory BEFORE checking existence
        if (
            os.path.commonpath([str(resolved_match), str(data_path_resolved)])
            == str(data_path_resolved)
            and resolved_match.exists()
        ):
            return str(match)

    return None
