"""Tests for the claim extraction and summary synthesis routes.

Uses FastAPI's ``TestClient`` with ``dependency_overrides`` to swap in a
fake model manager, plus ``unittest.mock.patch`` to substitute the
use-case classes the route imports lazily. The route logic under test
owns: task-config lookup, LLM loader construction, use-case invocation,
timing, DTO-to-schema mapping, recursive claim counting, and conflict
counting.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient

from src.application.dto.claims import ExtractedClaimDTO
from src.main import app

if TYPE_CHECKING:
    from collections.abc import Generator


def _model_manager_with(task_types: dict[str, str]) -> Mock:
    """Build a mock ``ModelManager`` exposing the given ``task → model_id`` map."""
    mock = Mock()
    tasks: dict[str, Mock] = {}
    for task_name, model_id in task_types.items():
        task = Mock()
        selected = Mock()
        selected.model_id = model_id
        selected.quantization = "4bit"
        selected.framework = "transformers"
        task.get_selected_config.return_value = selected
        task.options = {model_id: selected}
        task.selected = model_id
        tasks[task_name] = task
    mock.tasks = tasks
    return mock


@pytest.fixture
def client_with_full_manager() -> Generator[TestClient, None, None]:
    """TestClient for a manager configured with both claim tasks."""
    from src.infrastructure.adapters.inbound.fastapi.dependencies import get_model_manager

    manager = _model_manager_with(
        {
            "claim_extraction": "meta-llama/Llama-4-Scout",
            "claim_synthesis": "meta-llama/Llama-4-Scout",
        }
    )
    app.dependency_overrides[get_model_manager] = lambda: manager

    with (
        patch(
            "src.infrastructure.adapters.outbound.models.llm.loader.create_llm_loader",
            return_value=Mock(load=AsyncMock(), unload=AsyncMock()),
        ),
        patch("src.infrastructure.adapters.outbound.llm_adapter.LLMLoaderAdapter") as adapter_cls,
    ):
        adapter = Mock()
        adapter.aload = AsyncMock()
        adapter.aunload = AsyncMock()
        adapter_cls.return_value = adapter
        yield TestClient(app, base_url="http://testserver")
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_no_tasks() -> Generator[TestClient, None, None]:
    """TestClient for a manager with an empty ``tasks`` dict."""
    from src.infrastructure.adapters.inbound.fastapi.dependencies import get_model_manager

    manager = _model_manager_with({})
    app.dependency_overrides[get_model_manager] = lambda: manager
    yield TestClient(app, base_url="http://testserver")
    app.dependency_overrides.clear()


class TestExtractClaims:
    """Coverage of ``POST /api/extract-claims``."""

    def test_success_returns_claims(self, client_with_full_manager: TestClient) -> None:
        claim_dto = ExtractedClaimDTO(
            text="The JWST is a telescope",
            sentence_index=0,
            char_start=0,
            char_end=24,
            confidence=0.9,
            claim_type="entity",
            subclaims=[],
        )
        with patch("src.application.use_cases.extract_claims.ExtractClaimsUseCase") as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(return_value=[claim_dto])
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/extract-claims",
                json={
                    "summary_id": "sum-1",
                    "summary_text": "The JWST is a telescope.",
                    "extraction_strategy": "sentence-based",
                    "max_claims": 5,
                    "min_confidence": 0.3,
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["summary_id"] == "sum-1"
        assert body["model_used"] == "meta-llama/Llama-4-Scout"
        assert len(body["claims"]) == 1
        assert body["claims"][0]["text"] == "The JWST is a telescope"

    def test_threads_ontology_context_when_provided(
        self, client_with_full_manager: TestClient
    ) -> None:
        with patch("src.application.use_cases.extract_claims.ExtractClaimsUseCase") as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(return_value=[])
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/extract-claims",
                json={
                    "summary_id": "sum-2",
                    "summary_text": "...",
                    "ontology_types": [{"id": "t1", "name": "Person"}],
                    "ontology_glosses": {"t1": "a human individual"},
                },
            )

        assert response.status_code == 200
        request_arg = uc.execute.call_args.args[0]
        assert request_arg.ontology_context == {
            "types": [{"id": "t1", "name": "Person"}],
            "glosses": {"t1": "a human individual"},
        }

    def test_missing_task_returns_500(self, client_with_no_tasks: TestClient) -> None:
        response = client_with_no_tasks.post(
            "/api/extract-claims",
            json={"summary_id": "sum-1", "summary_text": "Hello."},
        )
        assert response.status_code == 500
        assert "Claim extraction" in response.json()["detail"]

    def test_use_case_exception_returns_500(self, client_with_full_manager: TestClient) -> None:
        with patch("src.application.use_cases.extract_claims.ExtractClaimsUseCase") as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(side_effect=RuntimeError("LLM timed out"))
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/extract-claims",
                json={"summary_id": "sum-1", "summary_text": "Hello."},
            )

        assert response.status_code == 500
        assert "LLM timed out" in response.json()["detail"]

    def test_missing_required_field_returns_422(self, client_with_full_manager: TestClient) -> None:
        response = client_with_full_manager.post("/api/extract-claims", json={"summary_text": "x"})
        assert response.status_code == 422


class TestSynthesizeSummary:
    """Coverage of ``POST /api/synthesize-summary``."""

    def test_success_returns_summary(self, client_with_full_manager: TestClient) -> None:
        summary_gloss = [{"type": "text", "content": "Two astronauts tour JWST."}]
        with patch(
            "src.application.use_cases.synthesize_summary.SynthesizeSummaryUseCase"
        ) as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(return_value=summary_gloss)
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/synthesize-summary",
                json={
                    "summary_id": "sum-9",
                    "claim_sources": [
                        {
                            "source_id": "vid-1",
                            "source_type": "video",
                            "claims": [{"text": "c1", "subclaims": []}],
                        }
                    ],
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["summary_id"] == "sum-9"
        assert body["summary_gloss"] == summary_gloss
        # claims_used = 1 because only the top-level claim exists.
        assert body["claims_used"] == 1
        assert body["synthesis_metadata"]["num_sources"] == 1

    def test_counts_claims_recursively(self, client_with_full_manager: TestClient) -> None:
        with patch(
            "src.application.use_cases.synthesize_summary.SynthesizeSummaryUseCase"
        ) as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(return_value=[])
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/synthesize-summary",
                json={
                    "summary_id": "sum-9",
                    "claim_sources": [
                        {
                            "source_id": "vid-1",
                            "source_type": "video",
                            "claims": [
                                {
                                    "text": "root",
                                    "subclaims": [
                                        {"text": "child-a", "subclaims": []},
                                        {"text": "child-b", "subclaims": []},
                                    ],
                                }
                            ],
                        }
                    ],
                },
            )

        assert response.status_code == 200
        # 1 root + 2 subclaims.
        assert response.json()["claims_used"] == 3

    def test_counts_conflicts_from_relations(self, client_with_full_manager: TestClient) -> None:
        with patch(
            "src.application.use_cases.synthesize_summary.SynthesizeSummaryUseCase"
        ) as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(return_value=[])
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/synthesize-summary",
                json={
                    "summary_id": "sum-9",
                    "claim_sources": [
                        {
                            "source_id": "vid-1",
                            "source_type": "video",
                            "claims": [{"text": "c1", "subclaims": []}],
                        }
                    ],
                    "claim_relations": [
                        {
                            "source_claim_id": "a",
                            "target_claim_id": "b",
                            "relation_type": "conflicts_with",
                        },
                        {
                            "source_claim_id": "a",
                            "target_claim_id": "c",
                            "relation_type": "contradicts",
                        },
                        {
                            "source_claim_id": "a",
                            "target_claim_id": "d",
                            "relation_type": "supports",
                        },
                    ],
                },
            )

        assert response.status_code == 200
        assert response.json()["synthesis_metadata"]["conflicts_detected"] == 2

    def test_missing_task_returns_500(self, client_with_no_tasks: TestClient) -> None:
        response = client_with_no_tasks.post(
            "/api/synthesize-summary",
            json={
                "summary_id": "sum-9",
                "claim_sources": [
                    {
                        "source_id": "vid-1",
                        "source_type": "video",
                        "claims": [{"text": "c1", "subclaims": []}],
                    }
                ],
            },
        )
        assert response.status_code == 500
        assert "Claim synthesis" in response.json()["detail"]

    def test_use_case_exception_returns_500(self, client_with_full_manager: TestClient) -> None:
        with patch(
            "src.application.use_cases.synthesize_summary.SynthesizeSummaryUseCase"
        ) as uc_cls:
            uc = Mock()
            uc.execute = AsyncMock(side_effect=RuntimeError("LLM error"))
            uc_cls.return_value = uc

            response = client_with_full_manager.post(
                "/api/synthesize-summary",
                json={
                    "summary_id": "sum-9",
                    "claim_sources": [
                        {
                            "source_id": "vid-1",
                            "source_type": "video",
                            "claims": [{"text": "c1"}],
                        }
                    ],
                },
            )

        assert response.status_code == 500
        assert "LLM error" in response.json()["detail"]

    def test_empty_claim_sources_returns_422(self, client_with_full_manager: TestClient) -> None:
        response = client_with_full_manager.post(
            "/api/synthesize-summary",
            json={"summary_id": "sum-9", "claim_sources": []},
        )
        assert response.status_code == 422
