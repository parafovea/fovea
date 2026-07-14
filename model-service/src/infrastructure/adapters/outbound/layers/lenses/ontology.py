"""Lens between fovea ontology suggestions and canonical layers records.

An ontology-augmentation run produces a list of
:class:`~src.application.dto.ontology.OntologyTypeDTO` — suggested types, each
with a confidence, a set of examples, an optional parent name, and an optional
chain-of-thought :class:`~src.application.dto.reasoning.ThinkingTrace`. This
lens projects that list (paired with the emitting :class:`EmitContext`) to a
:class:`lairs.integrations.codecs.CorpusFragment`:

- one :class:`lairs.records.ontology.Ontology` named ``fovea``,
- one :class:`lairs.records.ontology.TypeDef` per suggested type, whose ``gloss``
  carries the description, whose ``parentTypeRef`` resolves the parent name to a
  local type AT-URI, and whose ``features`` carry the examples and the
  integer-scaled confidence.

The layers view scales confidence to an integer ``0..1000`` and drops both the
reasoning trace and the exact parent-name/example ordering the ``OntologyTypeDTO``
carries, so the round-trip is a :class:`dx.Lens`: the view is the faithful layers
projection and the complement carries the fovea-only remainder (the emit context,
the exact confidence floats, the example order, the resolved parent names, and
each reasoning trace verbatim), so GetPut holds for every suggestion set.
"""

from __future__ import annotations

from datetime import datetime

import didactic.api as dx
from lairs.integrations.codecs import CorpusFragment, FragmentRecord
from lairs.records import ontology

from src.application.dto.ontology import OntologyTypeDTO
from src.application.dto.reasoning import ThinkingStep, ThinkingTrace
from src.application.ports.outbound.layers_codec import EmitContext
from src.infrastructure.adapters.outbound.layers._convert import (
    ONTOLOGY_NSID,
    TYPEDEF_NSID,
    JsonValue,
    _record,
    conf_to_int,
    feature_map,
    j_float,
    j_list,
    j_obj,
    j_str,
    local_uri,
)

# The name every emitted fovea ontology carries, and the key under which its
# AT-URI is minted.
_ONTOLOGY_NAME = "fovea"
_ONTOLOGY_KEY = "fovea"

# The fovea DTO carries no event/situation signal, so every suggested type
# projects to an entity type; the mapping is total and round-trips trivially
# (``OntologyTypeDTO`` has no ``typeKind`` field to reconstruct).
_TYPE_KIND = "entity-type"

# The source of this lens: the suggested types in emission order, paired with the
# emit context that stamps their provenance (its ``created_at`` reaches the view).
type OntologySource = tuple[tuple[OntologyTypeDTO, ...], EmitContext]


def _trace_to_json(trace: ThinkingTrace | None) -> JsonValue:
    """Serialize a reasoning trace to a plain JSON value for the complement."""
    if trace is None:
        return None
    return {
        "steps": [
            {"content": step.content, "tokens_used": step.tokens_used} for step in trace.steps
        ],
        "total_tokens": trace.total_tokens,
        "model_id": trace.model_id,
    }


def _trace_from_json(value: JsonValue) -> ThinkingTrace | None:
    """Reconstruct a reasoning trace from its complement JSON value."""
    if value is None:
        return None
    obj = j_obj(value)
    steps_raw = j_list(obj["steps"])
    steps = []
    for entry in steps_raw:
        step_obj = j_obj(entry)
        tokens = step_obj["tokens_used"]
        steps.append(
            ThinkingStep(
                content=j_str(step_obj["content"]),
                tokens_used=None if tokens is None else int(j_float(tokens)),
            )
        )
    total = obj["total_tokens"]
    return ThinkingTrace(
        steps=steps,
        total_tokens=None if total is None else int(j_float(total)),
        model_id=j_str(obj["model_id"]),
    )


def _ctx_to_json(ctx: EmitContext) -> JsonValue:
    """Serialize an emit context to a plain JSON value for the complement."""
    return {
        "video_id": ctx.video_id,
        "created_at": ctx.created_at.isoformat(),
        "tool": ctx.tool,
        "agent_id": ctx.agent_id,
        "persona_ref": ctx.persona_ref,
        "authority": ctx.authority,
    }


def _ctx_from_json(value: JsonValue) -> EmitContext:
    """Reconstruct an emit context from its complement JSON value."""
    obj = j_obj(value)
    agent_id = obj["agent_id"]
    persona_ref = obj["persona_ref"]
    return EmitContext(
        video_id=j_str(obj["video_id"]),
        created_at=datetime.fromisoformat(j_str(obj["created_at"])),
        tool=j_str(obj["tool"]),
        agent_id=None if agent_id is None else j_str(agent_id),
        persona_ref=None if persona_ref is None else j_str(persona_ref),
        authority=j_str(obj["authority"]),
    )


class OntologyLayersLens(dx.Lens[OntologySource, CorpusFragment, JsonValue]):
    """Lossless lens ``(ontology suggestions, ctx) <-> (layers fragment, complement)``."""

    def forward(self, source: OntologySource) -> tuple[CorpusFragment, JsonValue]:
        """Project ontology suggestions to a layers fragment and fovea complement."""
        types, ctx = source
        ontology_ref = local_uri(ctx.authority, ONTOLOGY_NSID, _ONTOLOGY_KEY)

        records: list[FragmentRecord] = [
            _record(
                ONTOLOGY_NSID,
                f"ontology:{_ONTOLOGY_KEY}",
                ontology.Ontology(
                    name=_ONTOLOGY_NAME,
                    createdAt=ctx.created_at,
                    personaRef=ctx.persona_ref,
                ),
            )
        ]

        type_complements: list[JsonValue] = []
        for index, dto in enumerate(types):
            parent_ref = (
                local_uri(ctx.authority, TYPEDEF_NSID, dto.parent)
                if dto.parent is not None
                else None
            )
            records.append(
                _record(
                    TYPEDEF_NSID,
                    f"type:{index}",
                    ontology.TypeDef(
                        name=dto.name,
                        ontologyRef=ontology_ref,
                        typeKind=_TYPE_KIND,
                        gloss=dto.description,
                        parentTypeRef=parent_ref,
                        createdAt=ctx.created_at,
                        features=feature_map(
                            {
                                "examples": list(dto.examples),
                                "confidence": conf_to_int(dto.confidence),
                            }
                        ),
                    ),
                )
            )
            type_complements.append(
                {
                    "confidence": dto.confidence,
                    "examples": list(dto.examples),
                    "parent": dto.parent,
                    "reasoning_trace": _trace_to_json(dto.reasoning_trace),
                }
            )

        view = CorpusFragment(records=tuple(records), source="fovea")
        complement: JsonValue = {
            "ctx": _ctx_to_json(ctx),
            "types": type_complements,
        }
        return view, complement

    def backward(self, view: CorpusFragment, complement: JsonValue) -> OntologySource:
        """Reconstruct ontology suggestions and the emit context from the fragment."""
        comp = j_obj(complement)
        ctx = _ctx_from_json(comp["ctx"])
        type_comps = j_list(comp["types"])

        typedefs = [
            ontology.TypeDef.model_validate_json(record.value_json)
            for record in view.records
            if record.nsid == TYPEDEF_NSID
        ]

        dtos: list[OntologyTypeDTO] = []
        for typedef, type_comp in zip(typedefs, type_comps, strict=True):
            entry = j_obj(type_comp)
            parent = entry["parent"]
            dtos.append(
                OntologyTypeDTO(
                    name=typedef.name,
                    description=typedef.gloss if typedef.gloss is not None else "",
                    parent=None if parent is None else j_str(parent),
                    confidence=j_float(entry["confidence"]),
                    examples=[j_str(ex) for ex in j_list(entry["examples"])],
                    reasoning_trace=_trace_from_json(entry["reasoning_trace"]),
                )
            )
        return tuple(dtos), ctx


ONTOLOGY_LAYERS = OntologyLayersLens()
