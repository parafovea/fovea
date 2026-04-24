"""Pre-download default models from HuggingFace at Docker build time.

Reads the active model configuration YAML, identifies the default (selected)
model for each task type, and downloads models that use HuggingFace-based
frameworks (transformers, llama_cpp). External API models are skipped.

Usage:
    python scripts/preload_models.py [--config PATH]

The --config flag defaults to the MODEL_CONFIG_PATH environment variable,
falling back to /app/config/active-models.yaml.
"""

import argparse
import os
import sys
from pathlib import Path

import yaml

# Frameworks that require downloading model weights from HuggingFace
HF_FRAMEWORKS = {"transformers", "llama_cpp", "ctranslate2", "onnx", "ultralytics"}

# Frameworks that are external APIs (no download needed)
SKIP_FRAMEWORKS = {"external_api"}


def load_config(config_path: str) -> dict:
    """Load model configuration from YAML file."""
    with open(config_path) as f:
        return yaml.safe_load(f)


def get_default_models(config: dict) -> list[dict]:
    """Extract default (selected) models from config.

    Returns a list of dicts with model_id, framework, and task_type.
    """
    models = []
    for task_type, task_config in config.get("models", {}).items():
        selected = task_config.get("selected")
        if not selected:
            continue

        options = task_config.get("options", {})
        model_config = options.get(selected, {})
        framework = model_config.get("framework", "")
        model_id = model_config.get("model_id", "")

        if not model_id:
            continue

        if framework in SKIP_FRAMEWORKS:
            print(f"  Skipping {task_type}/{selected}: external API model")
            continue

        models.append(
            {
                "task_type": task_type,
                "name": selected,
                "model_id": model_id,
                "framework": framework,
            }
        )

    return models


def download_model(model: dict, cache_dir: str) -> bool:
    """Download a single model to the cache directory.

    Returns True on success, False on failure.
    """
    model_id = model["model_id"]
    framework = model["framework"]
    task_type = model["task_type"]

    print(f"\n{'=' * 60}")
    print(f"Downloading: {model_id}")
    print(f"  Task: {task_type} | Framework: {framework}")
    print(f"  Cache: {cache_dir}")
    print(f"{'=' * 60}")

    try:
        if framework in ("transformers", "llama_cpp", "ctranslate2", "onnx"):
            from huggingface_hub import snapshot_download

            snapshot_download(
                model_id,
                cache_dir=cache_dir,
                token=os.environ.get("HF_TOKEN"),
            )

        elif framework == "ultralytics":
            # Ultralytics models download via their own mechanism
            # but we can pre-cache via huggingface_hub if the model_id is an HF repo
            if "/" in model_id:
                from huggingface_hub import snapshot_download

                snapshot_download(
                    model_id,
                    cache_dir=cache_dir,
                    token=os.environ.get("HF_TOKEN"),
                )
            else:
                print(f"  Ultralytics model {model_id} uses built-in download, skipping HF cache")
                return True

        else:
            print(f"  Unknown framework '{framework}', attempting generic HF download")
            from huggingface_hub import snapshot_download

            snapshot_download(
                model_id,
                cache_dir=cache_dir,
                token=os.environ.get("HF_TOKEN"),
            )

        print(f"  OK: {model_id}")
        return True

    except Exception as e:
        print(f"  FAILED: {model_id}: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-download default models")
    parser.add_argument(
        "--config",
        default=os.environ.get("MODEL_CONFIG_PATH", "/app/config/active-models.yaml"),
        help="Path to model configuration YAML",
    )
    parser.add_argument(
        "--cache-dir",
        default=os.environ.get("TRANSFORMERS_CACHE", "/models"),
        help="Cache directory for downloaded models",
    )
    args = parser.parse_args()

    config_path = args.config
    cache_dir = args.cache_dir

    if not Path(config_path).exists():
        print(f"Config file not found: {config_path}")
        sys.exit(1)

    print(f"Loading config from: {config_path}")
    config = load_config(config_path)

    models = get_default_models(config)
    if not models:
        print("No downloadable models found in config.")
        return

    print(f"\nFound {len(models)} model(s) to download:")
    for m in models:
        print(f"  - {m['task_type']}: {m['model_id']} ({m['framework']})")

    successes = 0
    failures = 0
    for model in models:
        if download_model(model, cache_dir):
            successes += 1
        else:
            failures += 1

    print(f"\n{'=' * 60}")
    print(f"Pre-download complete: {successes} succeeded, {failures} failed")
    print(f"{'=' * 60}")

    if failures > 0:
        print("WARNING: Some models failed to download. They will be downloaded on first use.")


if __name__ == "__main__":
    main()
