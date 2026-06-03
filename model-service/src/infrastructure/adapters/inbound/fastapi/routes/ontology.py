"""Ontology augmentation route.

Provides the endpoint for generating ontology type suggestions using
language models or external provider APIs.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi.dependencies import ModelManagerDep  # noqa: TC001
from src.infrastructure.adapters.inbound.fastapi.mappers import ontology_type_dto_to_schema
from src.infrastructure.adapters.inbound.fastapi.schemas import (
    AugmentRequest,
    AugmentResponse,
    ErrorResponse,
)

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)


@router.post(
    "/ontology/augment",
    response_model=AugmentResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Augment ontology with AI suggestions",
    description="Suggests new ontology types based on domain description and existing types. "
    "Uses language models to generate semantically relevant entity types, event types, roles, or relations.",
)
async def augment_ontology(
    request: AugmentRequest,
    manager: ModelManagerDep,
) -> AugmentResponse:
    """Suggest new ontology types using language models."""
    with tracer.start_as_current_span("augment_ontology") as span:
        span.set_attribute("persona_id", request.persona_id)
        span.set_attribute("target_category", request.target_category)
        span.set_attribute("max_suggestions", request.max_suggestions)

        from src.application.use_cases import augment_ontology as augment_module
        from src.application.use_cases.augment_ontology import (
            AugmentationContext,
            generate_augmentation_reasoning,
        )
        from src.infrastructure.adapters.outbound.external_api_router_adapter import (
            ExternalAPIRouterAdapter,
        )
        from src.infrastructure.adapters.outbound.llm_adapter import LLMLoaderAdapter
        from src.infrastructure.adapters.outbound.models.llm.loader import (
            LLMConfig,
            LLMFramework,
            create_llm_loader,
        )

        try:
            task_config = manager.tasks.get("ontology_augmentation")
            if task_config is None:
                raise HTTPException(
                    status_code=500,
                    detail="Ontology augmentation task not configured",
                )

            context = AugmentationContext(
                domain=request.domain,
                existing_types=request.existing_types,
                target_category=request.target_category,
                persona_role=None,
                information_need=None,
            )

            if manager.is_external_api("ontology_augmentation"):
                selected_model_config = task_config.get_selected_config()
                provider = selected_model_config.provider

                if not provider:
                    raise HTTPException(
                        status_code=500,
                        detail="External API model missing provider configuration",
                    )

                try:
                    api_config = manager.get_external_api_config("ontology_augmentation")
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e)) from e

                suggestion_dtos = await augment_module.augment_ontology_with_external_api(
                    context=context,
                    api_config=api_config,
                    provider=provider,
                    external_router=ExternalAPIRouterAdapter(),
                    max_suggestions=request.max_suggestions,
                )
            else:
                selected_model_config = task_config.get_selected_config()

                if selected_model_config.architecture is None:
                    raise RuntimeError(
                        f"Model config for {task_config.selected!r} is missing required "
                        f"architecture field; add an architecture block to "
                        f"models.yaml/models-cpu.yaml"
                    )

                llm_config = LLMConfig(
                    model_id=selected_model_config.model_id,
                    quantization=selected_model_config.quantization or "4bit",
                    framework=LLMFramework(selected_model_config.framework),
                    max_tokens=2048,
                    temperature=0.7,
                    top_p=0.9,
                )
                loader = create_llm_loader(
                    selected_model_config.architecture, llm_config
                )
                language_model = LLMLoaderAdapter(loader)
                await language_model.aload()
                try:
                    suggestion_dtos = await augment_module.augment_ontology_with_llm(
                        context=context,
                        language_model=language_model,
                        max_suggestions=request.max_suggestions,
                    )
                finally:
                    await language_model.aunload()

            reasoning = generate_augmentation_reasoning(suggestion_dtos, context)
            suggestions = [ontology_type_dto_to_schema(s) for s in suggestion_dtos]

            augmentation_id = str(uuid.uuid4())

            span.set_attribute("suggestions_generated", len(suggestions))
            span.set_attribute(
                "avg_confidence",
                (
                    sum(s.confidence for s in suggestion_dtos) / len(suggestion_dtos)
                    if suggestion_dtos
                    else 0.0
                ),
            )

            return AugmentResponse(
                id=augmentation_id,
                persona_id=request.persona_id,
                target_category=request.target_category,
                suggestions=suggestions,
                reasoning=reasoning,
            )

        except HTTPException:
            raise
        except ValueError as e:
            logger.error("Validation error in augmentation: %s", e)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.error("Unexpected error in augmentation: %s", e)
            raise HTTPException(
                status_code=500,
                detail=f"Internal server error: {e!s}",
            ) from e
