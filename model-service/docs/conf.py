# Configuration file for the Sphinx documentation builder.
import sys
from pathlib import Path

# Add src directory to Python path for autodoc
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# -- Project information
project = "Fovea Model Service"
copyright = "2025, Aaron Steven White"
author = "Aaron Steven White"
version = "0.1.0"
release = "0.1.0"

# -- General configuration
extensions = [
    "sphinx.ext.autodoc",  # Auto-generate docs from docstrings
    "sphinx.ext.napoleon",  # Support Google/NumPy docstring styles
    "sphinx.ext.viewcode",  # Add links to source code
    "sphinx.ext.intersphinx",  # Link to other projects' docs
    "sphinx_autodoc_typehints",  # Better type hint rendering
]

# Napoleon settings (for Google/NumPy docstrings)
napoleon_google_docstring = True
napoleon_numpy_docstring = True
napoleon_include_init_with_doc = True
napoleon_include_private_with_doc = False
napoleon_include_special_with_doc = True
napoleon_use_admonition_for_examples = False
napoleon_use_admonition_for_notes = False
napoleon_use_admonition_for_references = False
napoleon_use_ivar = False
napoleon_use_param = True
napoleon_use_rtype = True

# Autodoc settings
autodoc_default_options = {
    "members": True,
    "member-order": "bysource",
    "special-members": "__init__",
    "undoc-members": True,
    "exclude-members": "__weakref__",
}

# Type hints settings
autodoc_typehints = "description"
autodoc_typehints_description_target = "documented"

# Templates
templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# -- Options for HTML output
html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]

# Theme options
html_theme_options = {
    "navigation_depth": 4,
    "collapse_navigation": False,
    "sticky_navigation": True,
    "includehidden": True,
}

# Intersphinx mapping (link to Python and common libraries)
intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "fastapi": ("https://fastapi.tiangolo.com", None),
}
