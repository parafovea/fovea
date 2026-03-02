"""Video summarization route.

Provides the endpoint for generating AI-powered video summaries
using vision language models.
"""

import logging

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    ErrorResponse,
    SummarizeRequest,
    SummarizeResponse,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Summarize video content",
    description="Generates a text summary of video content using vision language models. "
    "Analyzes video frames and optionally audio to produce a description tailored to the persona's perspective.",
)
async def summarize_video(
    request: SummarizeRequest,
    manager: ModelManagerDep,
) -> SummarizeResponse:
    """Summarize video content using vision language models.

    Parameters
    ----------
    request : SummarizeRequest
        Video summarization request with video_id, persona_id, and sampling parameters.
    manager : ModelManagerDep
        Injected model manager instance.

    Returns
    -------
    SummarizeResponse
        Generated summary with key frame analysis.

    Raises
    ------
    HTTPException
        If video_id or persona_id is invalid, or if processing fails.
    """
    with tracer.start_as_current_span("summarize_video") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("frame_sample_rate", request.frame_sample_rate)

        from src.application.use_cases.summarize_video import (
            SummarizationError,
            get_video_path_for_id,
            summarize_video_with_external_api,
            summarize_video_with_vlm,
        )
        from src.infrastructure.adapters.outbound.models.vlm.loader import (
            InferenceFramework,
            QuantizationType,
            VLMConfig,
        )
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )

        # Track if we downloaded a temporary file for cleanup
        temp_video_path: str | None = None

        try:
            # Use provided video_path if available, otherwise resolve from video_id
            video_path: str
            if request.video_path:
                video_path = request.video_path
            else:
                resolved_path = get_video_path_for_id(request.video_id)
                if resolved_path is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Video not found: {request.video_id}",
                    )
                video_path = resolved_path

            # Download video if it's a URL (e.g., S3 pre-signed URL)
            video_path, is_temp = await download_video_if_needed(video_path)
            if is_temp:
                temp_video_path = video_path

            task_config = manager.tasks.get("video_summarization")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video summarization task not configured",
                )

            # Check if using external API
            if manager.is_external_api("video_summarization"):
                selected_model_config = task_config.get_selected_config()
                provider = selected_model_config.provider

                if not provider:
                    raise HTTPException(
                        status_code=500,
                        detail="External API model missing provider configuration",
                    )

                try:
                    api_config = manager.get_external_api_config("video_summarization")
                except ValueError as e:
                    raise HTTPException(
                        status_code=400,
                        detail=str(e),
                    ) from e

                response = await summarize_video_with_external_api(
                    request=request,
                    video_path=video_path,
                    api_config=api_config,
                    provider=provider,
                )
            else:
                # Use self-hosted model
                selected_model_config = task_config.get_selected_config()

                quantization_map = {
                    "4bit": QuantizationType.FOUR_BIT,
                    "8bit": QuantizationType.EIGHT_BIT,
                    "awq": QuantizationType.AWQ,
                    "none": QuantizationType.NONE,
                }
                quantization = quantization_map.get(
                    selected_model_config.quantization or "4bit",
                    QuantizationType.FOUR_BIT,
                )

                framework_map = {
                    "sglang": InferenceFramework.SGLANG,
                    "vllm": InferenceFramework.VLLM,
                    "transformers": InferenceFramework.TRANSFORMERS,
                    "llama_cpp": InferenceFramework.LLAMA_CPP,
                }
                framework = framework_map.get(
                    selected_model_config.framework,
                    InferenceFramework.TRANSFORMERS,
                )

                model_config = VLMConfig(
                    model_id=selected_model_config.model_id,
                    quantization=quantization,
                    framework=framework,
                )

                response = await summarize_video_with_vlm(
                    request=request,
                    video_path=video_path,
                    model_config=model_config,
                    model_name=task_config.selected,
                    persona_role=request.persona_role,
                    information_need=request.information_need,
                )

            span.set_attribute("summary_generated", True)
            return response

        except HTTPException:
            raise
        except SummarizationError as e:
            logger.error("Summarization error: %s", e)
            raise HTTPException(
                status_code=500,
                detail=str(e),
            ) from e
        except Exception as e:
            logger.error("Unexpected error in summarization: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            # Clean up temporary video file if downloaded
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
