# Wikibase Data Loader
# Imports data from Wikidata into a local Wikibase instance

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Copy Python project files
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir .

# Copy scripts
COPY scripts/ /app/scripts/

# Copy configuration
COPY config/ /app/config/

# Make scripts executable
RUN chmod +x /app/scripts/*.sh 2>/dev/null || true

# Entry point
ENTRYPOINT ["python", "-m", "scripts.main"]
