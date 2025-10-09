"""OpenTelemetry configuration for distributed tracing and metrics.

Configures OTLP exporters for traces and metrics, with automatic instrumentation
for FastAPI and Redis clients.
"""

import os

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


def configure_observability() -> None:
    """Configure OpenTelemetry tracing and metrics with OTLP exporters.

    Sets up trace and metric providers with OTLP exporters. Configures service
    resource attributes for identification in observability backend.
    """
    resource = Resource.create(
        {
            "service.name": "fovea-model-service",
            "service.version": "1.0.0",
        }
    )

    trace_provider = TracerProvider(resource=resource)
    trace_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(
                endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")
            )
        )
    )
    trace.set_tracer_provider(trace_provider)

    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(
            endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/metrics")
        ),
        export_interval_millis=60000,
    )
    metric_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(metric_provider)


def instrument_app(app: object) -> None:
    """Instrument FastAPI application with OpenTelemetry tracing.

    Adds automatic tracing for HTTP requests and Redis operations.

    Parameters
    ----------
    app : object
        FastAPI application instance to instrument.
    """
    from typing import cast

    from fastapi import FastAPI

    FastAPIInstrumentor.instrument_app(cast(FastAPI, app))
    RedisInstrumentor().instrument()


meter = metrics.get_meter(__name__)

model_inference_counter = meter.create_counter(
    "model.inference.count", description="Number of model inference calls"
)

model_inference_duration = meter.create_histogram(
    "model.inference.duration", description="Model inference duration in seconds", unit="s"
)
