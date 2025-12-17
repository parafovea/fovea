"""Custom exceptions for Wikibase data import operations."""


class WikibaseImportError(Exception):
    """Raised when a Wikibase import operation fails.

    This exception is raised for various import failures including:
    - Network connectivity issues
    - Authentication failures
    - Data validation errors
    - API response errors
    """


class WikidataFetchError(Exception):
    """Raised when fetching data from Wikidata fails.

    This exception is raised when:
    - The Wikidata API is unreachable
    - The API returns an error response
    - The requested entity does not exist
    """


class ConfigurationError(Exception):
    """Raised when configuration is invalid or missing.

    This exception is raised for:
    - Invalid YAML configuration files
    - Missing required configuration fields
    - Invalid configuration values
    """
