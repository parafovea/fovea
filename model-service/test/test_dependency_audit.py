"""Dependency-audit coverage for CPU wheel versions and package exclusions."""

from scripts.audit_dependencies import audit_requirement


def test_cpu_wheels_retain_the_public_version_for_advisory_lookup() -> None:
    """CPU wheels must be scanned rather than skipped as unknown PyPI versions."""
    assert audit_requirement("torch", "2.15.0+cpu") == "torch==2.15.0"
    assert audit_requirement("torchvision", "0.29.2+cpu") == "torchvision==0.29.2"
    assert audit_requirement("torch", "2.15.0") == "torch==2.15.0"


def test_only_the_application_is_excluded() -> None:
    """Keep development/build tools and unknown local wheel identifiers auditable."""
    assert audit_requirement("fovea_model_service", "0.6.0") is None
    assert audit_requirement("setuptools", "84.1.0") == "setuptools==84.1.0"
    assert audit_requirement("another_package", "1.0+cpu") == "another-package==1.0+cpu"
