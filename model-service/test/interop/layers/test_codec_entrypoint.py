"""Entry-point discovery test for the fovea codec.

``lairs.codec("fovea")`` resolves through the ``lairs.codecs`` entry-point group
once the model-service distribution is installed with its metadata. A source
checkout in the codec virtualenv is not installed that way, so this test registers
the codec in-process (the same registry path an installed entry point loads into)
and asserts the resolver returns it; it also confirms :class:`FoveaCodec` is a
valid, importable :class:`lairs.integrations.ports.Codec`.
"""

from __future__ import annotations

import pytest

pytest.importorskip("lairs")
pytest.importorskip("panproto")

import lairs
from lairs.integrations.ports import Codec
from lairs.integrations.registry import register_codec

from src.infrastructure.adapters.outbound.layers.codec import FoveaCodec


def test_fovea_codec_is_a_codec_type() -> None:
    assert isinstance(FoveaCodec(), Codec)


def test_codec_resolves_by_name() -> None:
    register_codec("fovea", FoveaCodec)
    resolved = lairs.codec("fovea")
    assert resolved is FoveaCodec
    assert resolved().name == "fovea"
