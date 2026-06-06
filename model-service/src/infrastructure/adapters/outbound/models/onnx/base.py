"""ONNX Runtime base model loader for CPU inference.

Provides a base class with ONNX Runtime session creation and lifecycle
management, shared by all ONNX detection loaders.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    import onnxruntime as ort

logger = logging.getLogger(__name__)


@dataclass
class ONNXConfig:
    """Configuration for ONNX model loading.

    Parameters
    ----------
    model_id : str
        HuggingFace model ID or local path.
    onnx_filename : str
        Repo-root filename of the ONNX weights to download. Different
        Ultralytics-derived community exports publish under different
        filenames; each loader sets the canonical value its repo uses
        rather than scanning a fallback chain.
    num_threads : int
        Number of CPU threads for inference.
    cache_dir : Path | None
        Directory for caching model files.
    graph_optimization_level : str
        ONNX Runtime graph optimization level.
    """

    model_id: str
    onnx_filename: str = "model.onnx"
    num_threads: int = 4
    cache_dir: Path | None = None
    graph_optimization_level: str = "ORT_ENABLE_ALL"


class ONNXModelLoader:
    """Base loader for ONNX Runtime models.

    Provides session creation, lifecycle management, and shared
    configuration for all ONNX model loaders.

    Parameters
    ----------
    onnx_config : ONNXConfig
        ONNX-specific model configuration.
    """

    def __init__(self, onnx_config: ONNXConfig) -> None:
        self.onnx_config = onnx_config
        self._session: ort.InferenceSession | None = None

    def _create_session(self, model_path: str) -> ort.InferenceSession:
        """Create an ONNX Runtime inference session.

        Parameters
        ----------
        model_path : str
            Path to the ONNX model file.

        Returns
        -------
        ort.InferenceSession
            Configured inference session with CPU execution provider.
        """
        import onnxruntime as ort

        sess_options = ort.SessionOptions()
        sess_options.intra_op_num_threads = self.onnx_config.num_threads
        sess_options.inter_op_num_threads = self.onnx_config.num_threads

        opt_level = getattr(
            ort.GraphOptimizationLevel,
            self.onnx_config.graph_optimization_level,
            None,
        )
        if opt_level is not None:
            sess_options.graph_optimization_level = opt_level

        session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        )
        logger.info(
            "Created ONNX session for %s with %d threads",
            model_path,
            self.onnx_config.num_threads,
        )
        return session

    @property
    def is_loaded(self) -> bool:
        """Whether the model session is loaded."""
        return self._session is not None

    def _unload_session(self) -> None:
        """Unload the ONNX session and free resources."""
        self._session = None
        logger.info("Unloaded ONNX model: %s", self.onnx_config.model_id)
