"""llama.cpp base configuration and model resolution.

Provides the shared configuration dataclass and GGUF model file
resolution logic used by all llama.cpp loaders.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class LlamaCppConfig:
    """Configuration for llama.cpp model loading.

    Parameters
    ----------
    model_id : str
        HuggingFace repo ID containing GGUF files.
    gguf_filename : str
        Specific GGUF filename to download (e.g., "model-Q4_K_M.gguf").
        If empty, auto-detects from repo.
    n_ctx : int
        Context window size.
    n_threads : int
        Number of CPU threads for inference.
    n_gpu_layers : int
        Number of layers to offload to GPU (0 for CPU-only).
    verbose : bool
        Enable llama.cpp verbose logging.
    cache_dir : Path | None
        Directory for caching model files.
    """

    model_id: str
    gguf_filename: str = ""
    n_ctx: int = 4096
    n_threads: int = 4
    n_gpu_layers: int = 0
    verbose: bool = False
    cache_dir: Path | None = None

    def resolve_model_path(self) -> str:
        """Download and resolve the GGUF model file path.

        Uses the HuggingFace Hub to download the specified GGUF file,
        or auto-detects a suitable quantization if no filename is given.

        Returns
        -------
        str
            Local path to the GGUF model file.

        Raises
        ------
        FileNotFoundError
            If no GGUF files are found in the repository.
        """
        from huggingface_hub import hf_hub_download, list_repo_files

        cache_dir = str(self.cache_dir) if self.cache_dir else None

        if self.gguf_filename:
            return hf_hub_download(
                repo_id=self.model_id,
                filename=self.gguf_filename,
                cache_dir=cache_dir,
            )

        # Auto-detect GGUF file, preferring Q4_K_M quantization
        files = list_repo_files(self.model_id)
        gguf_files = [f for f in files if f.endswith(".gguf")]

        if not gguf_files:
            msg = f"No GGUF files found in {self.model_id}"
            raise FileNotFoundError(msg)

        # Prefer Q4_K_M, then Q4_K_S, then any Q4, then Q5_K_M
        for pattern in ["q4_k_m", "q4_k_s", "q4_", "q5_k_m"]:
            for f in gguf_files:
                if pattern in f.lower():
                    logger.info("Auto-selected GGUF file: %s", f)
                    return hf_hub_download(repo_id=self.model_id, filename=f, cache_dir=cache_dir)

        # Fallback to first GGUF file
        logger.info("Auto-selected GGUF file: %s", gguf_files[0])
        return hf_hub_download(repo_id=self.model_id, filename=gguf_files[0], cache_dir=cache_dir)
