"""Video summarization pipeline using Vision Language Models.

Framework-neutral use case for summarizing video content. Depends on
application DTOs and outbound ports only. Concrete adapters (VLM, video
processor, external API router, audio transcriber) are wired at the
composition root.
"""

from __future__ import annotations

import io
import logging
import re
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from PIL import Image

from src.application.dto.summarization import (
    KeyFrameDTO,
    SummarizeRequestDTO,
    SummarizeResponseDTO,
)
from src.application.use_cases.fuse_modalities import (
    AudioSegment,
    FusionConfig,
    FusionStrategy,
    VisualFrame,
    create_fusion_strategy,
)

if TYPE_CHECKING:
    from src.application.dto.external_api import ExternalAPIConfigDTO
    from src.application.ports.outbound.external_api_router import IExternalAPIRouter
    from src.application.ports.outbound.frame_sampler import IFrameSampler
    from src.application.ports.outbound.transcriber import ITranscriber
    from src.application.ports.outbound.vlm import IVisionLanguageModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class SummarizationError(Exception):
    """Raised when video summarization fails."""


def get_default_prompt_template() -> str:
    """Get the default prompt template for video summarization."""
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
    """Generate persona-specific prompt for video summarization."""
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
    """Parse VLM response into summary and visual analysis components."""
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
) -> list[KeyFrameDTO]:
    """Identify key frames from extracted frames."""
    if len(frames) <= num_key_frames:
        selected_frames = frames
    else:
        indices = [int(i * (len(frames) - 1) / (num_key_frames - 1)) for i in range(num_key_frames)]
        selected_frames = [frames[i] for i in indices]

    key_frames: list[KeyFrameDTO] = []
    for idx, (frame_number, _) in enumerate(selected_frames):
        timestamp = frame_number / video_fps if video_fps > 0 else 0.0

        if idx == 0:
            description = "Opening frames showing initial scene"
        elif idx == len(selected_frames) - 1:
            description = "Closing frames showing final state"
        else:
            description = f"Mid-sequence frame at {timestamp:.1f} seconds"

        key_frames.append(
            KeyFrameDTO(
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
    """Convert PIL Image to encoded bytes."""
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
    """Calculate appropriate number of frames to sample for external API."""
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
    """Generate prompt for external API video summarization."""
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


class SummarizeVideoUseCase:
    """Use case for summarizing video content via VLM or external API."""

    def __init__(
        self,
        *,
        frame_sampler: IFrameSampler,
        vision_language_model: IVisionLanguageModel | None = None,
        external_router: IExternalAPIRouter | None = None,
        transcriber: ITranscriber | None = None,
    ) -> None:
        """Initialize with required and optional ports.

        Parameters
        ----------
        frame_sampler : IFrameSampler
            Port for reading video metadata and extracting frames.
        vision_language_model : IVisionLanguageModel | None
            Port for self-hosted VLM inference.
        external_router : IExternalAPIRouter | None
            Port for external provider-based inference.
        transcriber : ITranscriber | None
            Port for audio transcription. Required only if audio is enabled.
        """
        self._sampler = frame_sampler
        self._vlm = vision_language_model
        self._router = external_router
        self._transcriber = transcriber

    async def execute_with_vlm(
        self,
        *,
        request: SummarizeRequestDTO,
        video_path: str,
        model_name: str,
        persona_role: str | None = None,
        information_need: str | None = None,
    ) -> SummarizeResponseDTO:
        """Summarize using the injected self-hosted VLM port."""
        if self._vlm is None:
            raise RuntimeError("Vision-language model port not provided")

        with tracer.start_as_current_span("summarize_video_with_vlm") as span:
            span.set_attribute("video_id", request.video_id)
            span.set_attribute("persona_id", request.persona_id)
            span.set_attribute("model_name", model_name)

            try:
                metadata = self._sampler.get_video_metadata(video_path)
                safe_video_path = _safe(video_path)
                logger.info(
                    f"Processing video: {safe_video_path} "
                    f"({metadata.frame_count} frames, {metadata.duration:.2f}s)"
                )

                num_frames = min(request.max_frames, metadata.frame_count)
                frames_with_indices = self._sampler.extract_frames_uniform(
                    video_path,
                    num_frames=num_frames,
                    max_dimension=1024,
                )

                if not frames_with_indices:
                    raise SummarizationError("No frames could be extracted from video")

                span.set_attribute("frames_extracted", len(frames_with_indices))

                images = [frame_array for _, frame_array in frames_with_indices]

                (
                    audio_transcript,
                    audio_segments,
                    audio_language,
                    speaker_count,
                    processing_time_audio,
                ) = await self._maybe_transcribe(request, video_path, span)

                logger.info(f"Loading VLM model: {model_name}")
                self._vlm.load()

                try:
                    prompt = get_persona_prompt(persona_role, information_need)
                    logger.info(f"Generating summary with {len(images)} frames")
                    visual_start_time = time.time()
                    reasoned = self._vlm.generate_reasoned_from_images(
                        images,
                        prompt,
                        max_tokens=1024,
                        temperature=0.7,
                    )
                    processing_time_visual = time.time() - visual_start_time

                    summary, visual_analysis = parse_vlm_response(reasoned.text)
                    key_frames = identify_key_frames(
                        frames_with_indices,
                        metadata.fps,
                        num_key_frames=min(3, len(frames_with_indices)),
                    )
                    span.set_attribute("summary_length", len(summary))
                    span.set_attribute("key_frames_identified", len(key_frames))

                    (
                        summary,
                        processing_time_fusion,
                        fusion_strategy_name,
                        transcript_json,
                    ) = await _apply_fusion(
                        request=request,
                        summary=summary,
                        audio_transcript=audio_transcript,
                        audio_segments=audio_segments,
                        audio_language=audio_language,
                        speaker_count=speaker_count,
                        frames_with_indices=frames_with_indices,
                        fps=metadata.fps,
                        span=span,
                    )

                    return SummarizeResponseDTO(
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
                        processing_time_audio=(
                            processing_time_audio if request.enable_audio else None
                        ),
                        processing_time_visual=processing_time_visual,
                        processing_time_fusion=(
                            processing_time_fusion if request.enable_audio else None
                        ),
                        reasoning_trace=reasoned.thinking,
                    )
                finally:
                    self._vlm.unload()
                    logger.info("VLM model unloaded")

            except SummarizationError:
                raise
            except Exception as e:
                logger.error(f"Video summarization failed: {e}")
                span.set_attribute("error", str(e))
                raise SummarizationError(f"Summarization failed: {e}") from e

    async def execute_with_external_api(
        self,
        *,
        request: SummarizeRequestDTO,
        video_path: str,
        api_config: ExternalAPIConfigDTO,
        provider: str,
    ) -> SummarizeResponseDTO:
        """Summarize using the injected external API router port."""
        if self._router is None:
            raise RuntimeError("External API router port not provided")

        with tracer.start_as_current_span("summarize_video_external_api") as span:
            span.set_attribute("video_id", request.video_id)
            span.set_attribute("persona_id", request.persona_id)
            span.set_attribute("provider", provider)

            try:
                metadata = self._sampler.get_video_metadata(video_path)
                safe_provider = _safe(provider)
                safe_video_path = _safe(video_path)
                logger.info(
                    f"Processing video with external API ({safe_provider}): {safe_video_path} "
                    f"({metadata.frame_count} frames, {metadata.duration:.2f}s)"
                )

                num_frames = calculate_frame_sample_count(
                    total_frames=metadata.frame_count,
                    provider=provider,
                    max_frames=request.max_frames,
                )

                frames_with_indices = self._sampler.extract_frames_uniform(
                    video_path,
                    num_frames=num_frames,
                    max_dimension=1024,
                )
                if not frames_with_indices:
                    raise SummarizationError("No frames could be extracted from video")

                span.set_attribute("frames_extracted", len(frames_with_indices))

                images_bytes: list[bytes] = []
                timestamps: list[float] = []
                for frame_idx, frame_array in frames_with_indices:
                    image = Image.fromarray(frame_array)
                    image_bytes = convert_image_to_base64(image, format="JPEG", max_dimension=1024)
                    images_bytes.append(image_bytes)
                    timestamps.append(frame_idx / metadata.fps if metadata.fps > 0 else 0.0)

                (
                    audio_transcript,
                    audio_segments,
                    audio_language,
                    speaker_count,
                    processing_time_audio,
                ) = await self._maybe_transcribe(request, video_path, span)

                prompt = get_external_api_prompt(
                    frame_count=len(images_bytes),
                    duration=metadata.duration,
                    timestamps=timestamps,
                )

                logger.info(f"Calling {provider} API with {len(images_bytes)} frames")
                try:
                    visual_start_time = time.time()
                    reasoned = await self._router.generate_reasoned_from_images(
                        config=api_config,
                        provider=provider,
                        images=images_bytes,
                        prompt=prompt,
                        max_tokens=1024,
                    )
                    processing_time_visual = time.time() - visual_start_time

                    response_text = reasoned.text
                    usage = (
                        {"total_tokens": reasoned.tokens_used}
                        if reasoned.tokens_used is not None
                        else {}
                    )
                    logger.info(
                        f"External API response received. Tokens: {usage.get('total_tokens', 'unknown')}"
                    )

                    summary, visual_analysis = parse_vlm_response(response_text)
                    key_frames = identify_key_frames(
                        frames_with_indices,
                        metadata.fps,
                        num_key_frames=min(3, len(frames_with_indices)),
                    )
                    span.set_attribute("summary_length", len(summary))
                    span.set_attribute("key_frames_identified", len(key_frames))
                    span.set_attribute("tokens_used", usage.get("total_tokens", 0) or 0)

                    (
                        summary,
                        processing_time_fusion,
                        fusion_strategy_name,
                        transcript_json,
                    ) = await _apply_fusion(
                        request=request,
                        summary=summary,
                        audio_transcript=audio_transcript,
                        audio_segments=audio_segments,
                        audio_language=audio_language,
                        speaker_count=speaker_count,
                        frames_with_indices=frames_with_indices,
                        fps=metadata.fps,
                        span=span,
                    )

                    return SummarizeResponseDTO(
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
                        processing_time_audio=(
                            processing_time_audio if request.enable_audio else None
                        ),
                        processing_time_visual=processing_time_visual,
                        processing_time_fusion=(
                            processing_time_fusion if request.enable_audio else None
                        ),
                        reasoning_trace=reasoned.thinking,
                    )
                finally:
                    await self._router.close()

            except SummarizationError:
                raise
            except Exception as e:
                logger.error(f"External API video summarization failed: {e}")
                span.set_attribute("error", str(e))
                raise SummarizationError(f"External API summarization failed: {e}") from e

    async def _maybe_transcribe(
        self,
        request: SummarizeRequestDTO,
        video_path: str,
        span: Any,
    ) -> tuple[str | None, list[AudioSegment], str | None, int | None, float]:
        """Transcribe audio via the injected port if enabled."""
        if not request.enable_audio:
            return None, [], None, None, 0.0

        if self._transcriber is None:
            raise SummarizationError("Audio enabled but transcriber port not provided")

        logger.info("Audio processing enabled, transcribing video")
        start_time = time.time()
        result = await self._transcriber.transcribe_video(
            video_path,
            language=request.audio_language,
            enable_diarization=request.enable_speaker_diarization,
        )
        processing_time = time.time() - start_time

        segments = [
            AudioSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text,
                speaker=seg.speaker,
                confidence=seg.confidence,
            )
            for seg in result.segments
        ]
        span.set_attribute("audio_segments", len(segments))
        span.set_attribute("audio_language", result.language or "unknown")
        span.set_attribute("speaker_count", result.speaker_count or 0)

        return (
            result.text or None,
            segments,
            result.language,
            result.speaker_count,
            processing_time,
        )


async def _apply_fusion(
    *,
    request: SummarizeRequestDTO,
    summary: str,
    audio_transcript: str | None,
    audio_segments: list[AudioSegment],
    audio_language: str | None,
    speaker_count: int | None,
    frames_with_indices: list[tuple[int, Any]],
    fps: float,
    span: Any,
) -> tuple[str, float, str | None, dict[str, Any] | None]:
    """Apply audio-visual fusion if audio is enabled.

    Returns
    -------
    tuple[str, float, str | None, dict[str, Any] | None]
        Fused summary, fusion processing time, fusion strategy name, and
        transcript JSON (all None/0 when fusion is skipped).
    """
    if not (request.enable_audio and audio_transcript):
        return summary, 0.0, None, None

    logger.info("Applying audio-visual fusion")
    timestamps = [frame_idx / fps if fps > 0 else 0.0 for frame_idx, _ in frames_with_indices]
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

    span.set_attribute("fusion_strategy", fusion_result.fusion_strategy)
    span.set_attribute("processing_time_fusion", fusion_result.processing_time_fusion)

    return (
        fusion_result.summary,
        fusion_result.processing_time_fusion,
        fusion_result.fusion_strategy,
        transcript_json,
    )


async def summarize_video_with_vlm(
    *,
    request: SummarizeRequestDTO,
    video_path: str,
    frame_sampler: IFrameSampler,
    vision_language_model: IVisionLanguageModel,
    model_name: str,
    transcriber: ITranscriber | None = None,
    persona_role: str | None = None,
    information_need: str | None = None,
) -> SummarizeResponseDTO:
    """Functional wrapper calling :meth:`SummarizeVideoUseCase.execute_with_vlm`.

    Exists as a module-level function so tests can patch this entry point
    without triggering construction of the wrapped VLM loader.
    """
    use_case = SummarizeVideoUseCase(
        frame_sampler=frame_sampler,
        vision_language_model=vision_language_model,
        transcriber=transcriber,
    )
    return await use_case.execute_with_vlm(
        request=request,
        video_path=video_path,
        model_name=model_name,
        persona_role=persona_role,
        information_need=information_need,
    )


async def summarize_video_with_external_api(
    *,
    request: SummarizeRequestDTO,
    video_path: str,
    frame_sampler: IFrameSampler,
    external_router: IExternalAPIRouter,
    api_config: ExternalAPIConfigDTO,
    provider: str,
    transcriber: ITranscriber | None = None,
) -> SummarizeResponseDTO:
    """Functional wrapper calling :meth:`SummarizeVideoUseCase.execute_with_external_api`."""
    use_case = SummarizeVideoUseCase(
        frame_sampler=frame_sampler,
        external_router=external_router,
        transcriber=transcriber,
    )
    return await use_case.execute_with_external_api(
        request=request,
        video_path=video_path,
        api_config=api_config,
        provider=provider,
    )


def _safe(value: str) -> str:
    """Strip CR/LF to make a string safe for log output."""
    return str(value).replace("\r", "").replace("\n", "")


def get_video_path_for_id(video_id: str, data_dir: str = "/videos") -> str | None:
    """Resolve video ID to file path.

    Parameters
    ----------
    video_id : str
        Video identifier from request.
    data_dir : str
        Base directory containing video files.

    Returns
    -------
    str | None
        Full path to video file, or None if not found.
    """
    if not re.match(r"^[\w\-]+$", video_id):
        sanitized_video_id = video_id.replace("\r", "").replace("\n", "")
        logger.warning(f"Invalid video_id format: {sanitized_video_id!r}")
        return None

    data_path = Path(data_dir)

    if not data_path.exists():
        logger.warning(f"Video directory does not exist: {data_dir}")
        return None

    video_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"]
    data_path_resolved = data_path.resolve()

    def _safe_resolve_inside(candidate: Path) -> Path | None:
        """Resolve ``candidate`` and return it only if it stays inside
        ``data_path_resolved``. Defends against path traversal by validating
        the resolved candidate against the sanitized root before any further
        filesystem I/O is performed."""
        try:
            resolved = candidate.resolve(strict=False)
        except (OSError, RuntimeError):
            return None
        try:
            resolved.relative_to(data_path_resolved)
        except ValueError:
            return None
        return resolved

    for ext in video_extensions:
        candidate = _safe_resolve_inside(data_path / f"{video_id}{ext}")
        if candidate is not None and candidate.is_file():
            return str(candidate)

    for match in data_path.glob(f"{video_id}.*"):
        candidate = _safe_resolve_inside(match)
        if candidate is not None and candidate.is_file():
            return str(candidate)

    return None
