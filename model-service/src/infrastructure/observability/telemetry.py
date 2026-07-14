"""OpenTelemetry configuration for distributed tracing and metrics.

Configures OTLP exporters for traces and metrics, with automatic instrumentation
for FastAPI and Redis clients.
"""

from __future__ import annotations

import asyncio
import functools
import time
from contextlib import contextmanager
from typing import TYPE_CHECKING, ParamSpec, TypeVar

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from src.infrastructure.config.settings import get_settings

if TYPE_CHECKING:
    from collections.abc import Callable, Generator, Mapping

    from fastapi import FastAPI


def configure_observability() -> None:
    """Configure OpenTelemetry tracing and metrics with OTLP exporters.

    Sets up trace and metric providers with OTLP exporters. Configures service
    resource attributes for identification in observability backend.
    """
    settings = get_settings()

    resource = Resource.create(
        {
            "service.name": "fovea-model-service",
            "service.version": "0.1.0",
        }
    )

    trace_provider = TracerProvider(resource=resource)
    trace_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_traces_endpoint))
    )
    trace.set_tracer_provider(trace_provider)

    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=settings.otel_metrics_endpoint),
        export_interval_millis=60000,
    )
    metric_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(metric_provider)


def instrument_app(app: FastAPI) -> None:
    """Instrument FastAPI application with OpenTelemetry tracing.

    Adds automatic tracing for HTTP requests and Redis operations.

    Parameters
    ----------
    app : FastAPI
        FastAPI application instance to instrument.
    """
    FastAPIInstrumentor.instrument_app(app)
    RedisInstrumentor().instrument()


meter = metrics.get_meter(__name__)

model_inference_counter = meter.create_counter(
    "model.inference.count", description="Number of model inference calls"
)

model_inference_duration = meter.create_histogram(
    "model.inference.duration", description="Model inference duration in seconds", unit="s"
)


@contextmanager
def record_inference(
    *, task: str, model_id: str, extra: Mapping[str, str] | None = None
) -> Generator[None]:
    """Record a single inference call as a counter and duration histogram.

    Parameters
    ----------
    task : str
        Logical task name (for example ``"detect"``, ``"transcribe"``).
    model_id : str
        Identifier of the model performing the inference.
    extra : Mapping[str, str] | None
        Optional extra attributes recorded on both the counter and histogram.

    Yields
    ------
    None
        The caller runs the inference inside the context.
    """
    attrs: dict[str, str] = {"task": task, "model": model_id}
    if extra:
        for key, value in extra.items():
            attrs[key] = value
    start = time.perf_counter()
    result = "success"
    try:
        yield
    except BaseException:
        result = "error"
        raise
    finally:
        duration = time.perf_counter() - start
        counter_attrs: dict[str, str] = dict(attrs)
        counter_attrs["result"] = result
        model_inference_counter.add(1, counter_attrs)
        model_inference_duration.record(duration, attrs)


P = ParamSpec("P")
R = TypeVar("R")


def instrument_method(
    *, task: str, model_id_attr: str = "config.model_id"
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator that records model-inference metrics around a bound method.

    The decorated method's owning instance must expose the model identifier at
    the attribute path given by ``model_id_attr`` (dot notation is supported,
    e.g. ``"config.model_id"``).

    Parameters
    ----------
    task : str
        Logical task label recorded on the metric.
    model_id_attr : str
        Dot-path on ``self`` resolving to the model identifier.

    Returns
    -------
    Callable[[Callable[P, R]], Callable[P, R]]
        Method decorator.
    """

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        def _resolve_model_id(args: tuple[object, ...]) -> str:
            self_obj = args[0] if args else None
            if self_obj is None:
                return "unknown"
            current: object = self_obj
            for part in model_id_attr.split("."):
                current = getattr(current, part, None)
                if current is None:
                    return "unknown"
            return str(current)

        if asyncio.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
                model_id = _resolve_model_id(args)
                start = time.perf_counter()
                result_label = "success"
                try:
                    return await func(*args, **kwargs)  # type: ignore[no-any-return]
                except BaseException:
                    result_label = "error"
                    raise
                finally:
                    duration = time.perf_counter() - start
                    attrs = {"task": task, "model": model_id}
                    counter_attrs = dict(attrs)
                    counter_attrs["result"] = result_label
                    model_inference_counter.add(1, counter_attrs)
                    model_inference_duration.record(duration, attrs)

            return async_wrapper  # type: ignore[return-value]

        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            model_id = _resolve_model_id(args)
            with record_inference(task=task, model_id=model_id):
                return func(*args, **kwargs)

        return wrapper

    return decorator
