"""Video summarization pipeline using Vision Language Models.

This module provides functions for summarizing video content using VLMs.
It extracts frames, generates descriptions, and produces structured summaries
tailored to specific personas and their information needs.
"""

import logging
import uuid
from pathlib import Path
from typing import Any

from opentelemetry import trace
from PIL import Image

from .models import KeyFrame, SummarizeRequest, SummarizeResponse
from .video_utils import extract_frames_uniform, get_video_info
from .vlm_loader import InferenceFramework, QuantizationType, VLMConfig, create_vlm_loader

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
        indices = [
            int(i * (len(frames) - 1) / (num_key_frames - 1))
            for i in range(num_key_frames)
        ]
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
            logger.info(
                f"Processing video: {video_path} "
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

            images = [
                Image.fromarray(frame_array)
                for _, frame_array in frames_with_indices
            ]

            logger.info(f"Loading VLM model: {model_name}")
            loader = create_vlm_loader(model_name, model_config)
            loader.load()

            try:
                prompt = get_persona_prompt(persona_role, information_need)

                logger.info(f"Generating summary with {len(images)} frames")
                response = loader.generate(
                    images=images,
                    prompt=prompt,
                    max_new_tokens=1024,
                    temperature=0.7,
                )

                summary, visual_analysis = parse_vlm_response(response)

                key_frames = identify_key_frames(
                    frames_with_indices,
                    video_info.fps,
                    num_key_frames=min(3, len(frames_with_indices)),
                )

                span.set_attribute("summary_length", len(summary))
                span.set_attribute("key_frames_identified", len(key_frames))

                return SummarizeResponse(
                    id=str(uuid.uuid4()),
                    video_id=request.video_id,
                    persona_id=request.persona_id,
                    summary=summary,
                    visual_analysis=visual_analysis,
                    audio_transcript=None,
                    key_frames=key_frames,
                    confidence=0.85,
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

    for ext in video_extensions:
        video_path = data_path / f"{video_id}{ext}"
        if video_path.exists():
            return str(video_path)

    potential_matches = list(data_path.glob(f"{video_id}.*"))
    if potential_matches:
        return str(potential_matches[0])

    return None
