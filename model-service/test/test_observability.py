"""
Tests for OpenTelemetry observability integration.
"""

from opentelemetry import trace, metrics


def test_create_tracer():
    """Test creating a tracer."""
    tracer = trace.get_tracer(__name__)
    assert tracer is not None


def test_create_span():
    """Test creating and ending a span."""
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("test_span") as span:
        assert span is not None
        span.set_attribute("test.attribute", "test_value")


def test_create_meter():
    """Test creating a meter."""
    meter = metrics.get_meter(__name__)
    assert meter is not None


def test_create_counter():
    """Test creating a counter."""
    meter = metrics.get_meter(__name__)
    counter = meter.create_counter("test_counter", description="Test counter")
    assert counter is not None
    counter.add(1)


def test_create_histogram():
    """Test creating a histogram."""
    meter = metrics.get_meter(__name__)
    histogram = meter.create_histogram("test_histogram", description="Test histogram")
    assert histogram is not None
    histogram.record(100)
