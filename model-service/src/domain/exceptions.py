"""Domain exception definitions.

This module defines domain-specific exceptions that represent business logic
errors independent of infrastructure concerns. These exceptions propagate
through use cases and are translated to appropriate HTTP responses at the
API boundary.
"""


class DomainError(Exception):
    """Base exception for all domain errors.

    Parameters
    ----------
    message : str
        Human-readable error message.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class VideoNotFoundError(DomainError):
    """Raised when a requested video cannot be found.

    Parameters
    ----------
    video_id : str
        Identifier of the video that was not found.
    """

    def __init__(self, video_id: str) -> None:
        self.video_id = video_id
        super().__init__(f"Video not found: {video_id}")


class VideoProcessingError(DomainError):
    """Raised when video processing fails.

    Parameters
    ----------
    video_id : str
        Identifier of the video being processed.
    reason : str
        Reason for the failure.
    """

    def __init__(self, video_id: str, reason: str) -> None:
        self.video_id = video_id
        self.reason = reason
        super().__init__(f"Failed to process video {video_id}: {reason}")


class ModelNotLoadedError(DomainError):
    """Raised when a required model is not loaded.

    Parameters
    ----------
    task_type : str
        Task type requiring the model.
    model_id : str | None
        Identifier of the model that should be loaded.
    """

    def __init__(self, task_type: str, model_id: str | None = None) -> None:
        self.task_type = task_type
        self.model_id = model_id
        msg = f"Model not loaded for task: {task_type}"
        if model_id:
            msg += f" (model_id: {model_id})"
        super().__init__(msg)


class ModelLoadError(DomainError):
    """Raised when model loading fails.

    Parameters
    ----------
    model_id : str
        Identifier of the model that failed to load.
    reason : str
        Reason for the failure.
    """

    def __init__(self, model_id: str, reason: str) -> None:
        self.model_id = model_id
        self.reason = reason
        super().__init__(f"Failed to load model {model_id}: {reason}")


class InsufficientMemoryError(DomainError):
    """Raised when there is not enough memory to load a model.

    Parameters
    ----------
    model_id : str
        Identifier of the model that requires memory.
    required_gb : float
        Required memory in gigabytes.
    available_gb : float
        Available memory in gigabytes.
    """

    def __init__(self, model_id: str, required_gb: float, available_gb: float) -> None:
        self.model_id = model_id
        self.required_gb = required_gb
        self.available_gb = available_gb
        super().__init__(
            f"Insufficient memory for {model_id}: "
            f"requires {required_gb:.1f}GB, available {available_gb:.1f}GB"
        )


class InferenceError(DomainError):
    """Raised when model inference fails.

    Parameters
    ----------
    task_type : str
        Task type that failed.
    reason : str
        Reason for the failure.
    """

    def __init__(self, task_type: str, reason: str) -> None:
        self.task_type = task_type
        self.reason = reason
        super().__init__(f"Inference failed for {task_type}: {reason}")


class ConfigurationError(DomainError):
    """Raised when configuration is invalid.

    Parameters
    ----------
    config_key : str
        Configuration key that is invalid.
    reason : str
        Reason why configuration is invalid.
    """

    def __init__(self, config_key: str, reason: str) -> None:
        self.config_key = config_key
        self.reason = reason
        super().__init__(f"Invalid configuration '{config_key}': {reason}")


class InvalidTaskTypeError(DomainError):
    """Raised when an unknown task type is requested.

    Parameters
    ----------
    task_type : str
        The invalid task type.
    valid_types : list[str] | None
        List of valid task types.
    """

    def __init__(self, task_type: str, valid_types: list[str] | None = None) -> None:
        self.task_type = task_type
        self.valid_types = valid_types
        msg = f"Invalid task type: {task_type}"
        if valid_types:
            msg += f". Valid types: {', '.join(valid_types)}"
        super().__init__(msg)


class ExternalAPIError(DomainError):
    """Raised when an external API call fails.

    Parameters
    ----------
    provider : str
        Name of the API provider.
    reason : str
        Reason for the failure.
    status_code : int | None
        HTTP status code if applicable.
    """

    def __init__(self, provider: str, reason: str, status_code: int | None = None) -> None:
        self.provider = provider
        self.reason = reason
        self.status_code = status_code
        msg = f"External API error ({provider}): {reason}"
        if status_code:
            msg += f" (status: {status_code})"
        super().__init__(msg)


class AudioProcessingError(DomainError):
    """Raised when audio processing fails.

    Parameters
    ----------
    audio_path : str
        Path to the audio file.
    reason : str
        Reason for the failure.
    """

    def __init__(self, audio_path: str, reason: str) -> None:
        self.audio_path = audio_path
        self.reason = reason
        super().__init__(f"Failed to process audio {audio_path}: {reason}")


class OntologyAugmentationError(DomainError):
    """Raised when ontology augmentation fails.

    Parameters
    ----------
    category : str
        Target ontology category.
    reason : str
        Reason for the failure.
    """

    def __init__(self, category: str, reason: str) -> None:
        self.category = category
        self.reason = reason
        super().__init__(f"Ontology augmentation failed for {category}: {reason}")


class ClaimExtractionError(DomainError):
    """Raised when claim extraction fails.

    Parameters
    ----------
    summary_id : str
        Identifier of the summary.
    reason : str
        Reason for the failure.
    """

    def __init__(self, summary_id: str, reason: str) -> None:
        self.summary_id = summary_id
        self.reason = reason
        super().__init__(f"Claim extraction failed for summary {summary_id}: {reason}")


class ClaimSynthesisError(DomainError):
    """Raised when claim synthesis fails.

    Parameters
    ----------
    summary_id : str
        Target summary identifier.
    reason : str
        Reason for the failure.
    """

    def __init__(self, summary_id: str, reason: str) -> None:
        self.summary_id = summary_id
        self.reason = reason
        super().__init__(f"Claim synthesis failed for summary {summary_id}: {reason}")
