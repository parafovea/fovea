"""Video summarization route.

Provides the endpoint for generating AI-powered video summaries
using vision language models.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import TYPE_CHECKING, cast

if TYPE_CHECKING:
    from src.domain.entities.architectures import VLMArchitecture

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.mappers import (
    summarize_request_schema_to_dto,
    summarize_response_dto_to_schema,
)
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
    """Summarize video content using vision language models."""
    with tracer.start_as_current_span("summarize_video") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("frame_sample_rate", request.frame_sample_rate)

        from src.application.use_cases import summarize_video as summarize_module
        from src.application.use_cases.summarize_video import (
            SummarizationError,
            get_video_path_for_id,
        )
        from src.infrastructure.adapters.outbound.external_api_router_adapter import (
            ExternalAPIRouterAdapter,
        )
        from src.infrastructure.adapters.outbound.frame_sampler_opencv import OpenCVFrameSampler
        from src.infrastructure.adapters.outbound.models.vlm.loader import (
            InferenceFramework,
            QuantizationType,
            VLMConfig,
            create_vlm_loader,
        )
        from src.infrastructure.adapters.outbound.transcriber_whisper import (
            WhisperTranscriberAdapter,
        )
        from src.infrastructure.adapters.outbound.video.downloader import (
            cleanup_temp_video,
            download_video_if_needed,
        )
        from src.infrastructure.adapters.outbound.vlm_adapter import VLMLoaderAdapter

        temp_video_path: str | None = None
        dto_request = summarize_request_schema_to_dto(request)

        # Enforce the deployment-wide frame cap from inference config.
        # CPU VLMs run ~10-30 s/frame; without this cap, a frontend that
        # asks for the schema-default 30 frames blocks for 5-15 min and
        # makes the demo feel broken. The cap is a hard ceiling, not a
        # default — even if the client sets a higher number, the server
        # downsamples to what its hardware can serve within demo-time
        # budgets. GPU deployments raise it via models.yaml.
        frame_cap = manager.inference_config.max_video_frames
        if dto_request.max_frames > frame_cap:
            logger.info(
                "Clamping max_frames from %d to %d per inference.max_video_frames",
                dto_request.max_frames,
                frame_cap,
            )
            dto_request = replace(dto_request, max_frames=frame_cap)

        try:
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

            video_path, is_temp = await download_video_if_needed(video_path)
            if is_temp:
                temp_video_path = video_path

            task_config = manager.tasks.get("video_summarization")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Video summarization task not configured",
                )

            frame_sampler = OpenCVFrameSampler()
            transcriber = WhisperTranscriberAdapter() if request.enable_audio else None

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
                    raise HTTPException(status_code=400, detail=str(e)) from e

                response_dto = await summarize_module.summarize_video_with_external_api(
                    request=dto_request,
                    video_path=video_path,
                    frame_sampler=frame_sampler,
                    external_router=ExternalAPIRouterAdapter(),
                    api_config=api_config,
                    provider=provider,
                    transcriber=transcriber,
                )
            else:
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

                architecture = selected_model_config.architecture
                if architecture is None:
                    raise RuntimeError(
                        f"Model config for {task_config.selected!r} is missing the "
                        "required architecture field; add an architecture block "
                        "(e.g. architecture: {kind: 'smolvlm'}) to the matching "
                        "entry in models.yaml or models-cpu.yaml."
                    )
                vlm_loader = create_vlm_loader(cast("VLMArchitecture", architecture), model_config)
                vlm = VLMLoaderAdapter(vlm_loader)

                response_dto = await summarize_module.summarize_video_with_vlm(
                    request=dto_request,
                    video_path=video_path,
                    frame_sampler=frame_sampler,
                    vision_language_model=vlm,
                    model_name=task_config.selected,
                    transcriber=transcriber,
                    persona_role=request.persona_role,
                    information_need=request.information_need,
                )

            span.set_attribute("summary_generated", True)
            return summarize_response_dto_to_schema(response_dto)

        except HTTPException:
            raise
        except SummarizationError as e:
            logger.error("Summarization error: %s", e)
            raise HTTPException(status_code=500, detail=str(e)) from e
        except Exception as e:
            logger.error("Unexpected error in summarization: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
        finally:
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
