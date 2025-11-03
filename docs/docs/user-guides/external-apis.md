---
title: External API Configuration
sidebar_position: 4
---

# External API Configuration

FOVEA integrates with external AI service providers to enable cloud-based video analysis, audio transcription, and ontology generation. This guide explains how to configure API keys and choose between local and external models.

## What are External APIs?

External APIs are cloud-based AI services that process video and audio data without requiring local GPU infrastructure. FOVEA supports:

- **Vision Language Models (VLM)**: Video understanding and summarization
- **Large Language Models (LLM)**: Ontology generation and text analysis
- **Audio Transcription**: Speech-to-text with speaker identification

## Supported Providers

### Vision Language Models & Large Language Models

| Provider | Models | Features |
|----------|--------|----------|
| **Anthropic Claude** | Claude Sonnet 4.5 | High-quality video analysis, multimodal understanding, structured outputs |
| **OpenAI** | GPT-4o | Vision analysis, audio processing, strong reasoning capabilities |
| **Google AI** | Gemini 2.5 Flash | Native multimodal, fast inference, large context windows |

### Audio Transcription Services

| Provider | Features | Languages |
|----------|----------|-----------|
| **AssemblyAI** | Universal-2 model, speaker diarization, sentiment analysis | 50+ |
| **Deepgram** | Nova-3 model, real-time streaming, highest accuracy | 30+ |
| **Azure Speech** | Real-time streaming, custom models, speaker profiles | 90+ |
| **AWS Transcribe** | Medical/legal vocabularies, speaker diarization | 100+ |
| **Google Speech-to-Text** | Chirp 2 model, 125+ languages, word-level timestamps | 125+ |
| **Rev.ai** | Human-level accuracy, speaker diarization | 40+ |
| **Gladia** | Code-switching, multilingual, named entity recognition | 100+ |

## Local Models vs. External APIs

### When to Use Local Models

Use local models when:

- **Privacy requirements**: Data cannot leave your infrastructure
- **No internet access**: Offline or air-gapped environments
- **High volume**: Frequent processing makes pay-per-use expensive
- **GPU resources available**: You have NVIDIA GPUs for inference
- **Latency sensitive**: Need fastest possible response times

Local models require:
- NVIDIA GPU with 8GB+ VRAM (16GB+ recommended)
- Local storage for model weights (20-50GB per model)
- Initial setup and configuration time

### When to Use External APIs

Use external APIs when:

- **Limited hardware**: No GPU or limited GPU memory
- **Occasional use**: Pay-per-use more economical than dedicated hardware
- **Highest quality**: Need state-of-the-art model performance
- **No maintenance**: Prefer managed service to local infrastructure
- **Specialized features**: Require capabilities not in local models (sentiment, entities)

External APIs require:
- Internet connectivity
- API account with each provider
- API keys configured in FOVEA
- Budget for API usage costs

## API Key Configuration

API keys can be configured in three ways with the following priority:

1. **User-level keys**: Personal API keys (highest priority)
2. **System-level keys**: Admin-configured keys shared across users
3. **Environment variables**: Fallback configuration (lowest priority)

The system checks user keys first, then system keys, then environment variables.

### User-Level API Keys

Configure personal API keys in your user settings:

1. Click the **user menu** (avatar icon, top-right corner)
2. Select **Settings**
3. Navigate to the **API Keys** tab
4. Click **Add API Key**
5. Fill in the form:
   - **Provider**: Select from dropdown (Anthropic, OpenAI, Google, etc.)
   - **Key Name**: Descriptive name (e.g., "My Anthropic Key")
   - **API Key**: Paste your API key
6. Click **Save**

Your API keys are encrypted at rest using AES-256-GCM. Only the last 4 characters are displayed in the UI.

**User keys override system keys**, allowing you to use personal API accounts instead of shared organization keys.

### System-Level API Keys (Admin Only)

Administrators can configure shared API keys for all users:

1. Click the **admin icon** (gear icon, top-right corner)
2. Select **Admin Panel**
3. Navigate to the **API Keys** tab
4. Click **Add System API Key**
5. Fill in the form (same as user-level)
6. Click **Save**

System keys are available to all users and serve as fallback when users have not configured personal keys.

### Environment Variables

API keys can be configured via environment variables in the model service:

**File**: `model-service/.env`

```bash
# Vision Language Models / Large Language Models
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-key-here
GOOGLE_API_KEY=your-key-here

# Audio Transcription Services
ASSEMBLYAI_API_KEY=your-key-here
DEEPGRAM_API_KEY=your-key-here
AZURE_SPEECH_KEY=your-key-here
AZURE_SPEECH_REGION=eastus
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
REV_AI_API_KEY=your-key-here
GLADIA_API_KEY=your-key-here
```

Environment variables are useful for:
- Initial setup and testing
- Single-user deployments
- Docker deployments with secrets management
- CI/CD environments

## Obtaining API Keys

### Anthropic Claude

1. Visit [Anthropic Console](https://console.anthropic.com)
2. Create an account or log in
3. Navigate to **API Keys** section
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

**Pricing**: Pay-per-token, varies by model (see [Anthropic Pricing](https://www.anthropic.com/pricing))

### OpenAI

1. Visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create an account or log in
3. Click **Create new secret key**
4. Enter a name and copy the key (starts with `sk-`)

**Pricing**: Pay-per-token, varies by model (see [OpenAI Pricing](https://openai.com/pricing))

### Google AI

1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Click **Create API Key**
4. Copy the key

**Pricing**: Free tier available, pay-per-use beyond quota (see [Google AI Pricing](https://ai.google.dev/gemini-api/docs/pricing))

### AssemblyAI

1. Visit [https://www.assemblyai.com/](https://www.assemblyai.com/)
2. Create an account
3. Navigate to **Dashboard** → **API Keys**
4. Copy your API key

**Pricing**: Pay-per-hour of audio (see [AssemblyAI Pricing](https://www.assemblyai.com/pricing))

### Deepgram

1. Visit [https://console.deepgram.com/](https://console.deepgram.com/)
2. Create an account
3. Navigate to **API Keys**
4. Create a new key and copy it

**Pricing**: Pay-per-minute of audio (see [Deepgram Pricing](https://deepgram.com/pricing))

### Azure Speech Services

1. Visit [https://portal.azure.com/](https://portal.azure.com/)
2. Create or select an Azure subscription
3. Create a **Speech Services** resource
4. Navigate to **Keys and Endpoint**
5. Copy **Key 1** and note the **Region**

**Configuration requires two values:**
- `AZURE_SPEECH_KEY`: The API key
- `AZURE_SPEECH_REGION`: The region code (e.g., "eastus")

**Pricing**: Pay-per-hour with free tier (see [Azure Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/))

### AWS Transcribe

1. Visit [https://console.aws.amazon.com/](https://console.aws.amazon.com/)
2. Create or select an AWS account
3. Navigate to **IAM** → **Users**
4. Create a user with **Transcribe** permissions
5. Create **Access Key** and copy both:
   - Access Key ID
   - Secret Access Key

**Configuration requires three values:**
- `AWS_ACCESS_KEY_ID`: The access key ID
- `AWS_SECRET_ACCESS_KEY`: The secret key
- `AWS_REGION`: The region code (e.g., "us-east-1")

**Pricing**: Pay-per-second of audio (see [AWS Transcribe Pricing](https://aws.amazon.com/transcribe/pricing/))

### Google Speech-to-Text

1. Visit [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create or select a Google Cloud project
3. Enable **Speech-to-Text API**
4. Navigate to **APIs & Services** → **Credentials**
5. Create **API Key** and copy it

**Pricing**: Pay-per-minute with free tier (see [Google Cloud Pricing](https://cloud.google.com/speech-to-text/pricing))

### Rev.ai

1. Visit [https://www.rev.ai/](https://www.rev.ai/)
2. Create an account
3. Navigate to **Account** → **Access Tokens**
4. Create a new token and copy it

**Pricing**: Pay-per-minute, human transcription available (see [Rev.ai Pricing](https://www.rev.ai/pricing))

### Gladia

1. Visit [https://www.gladia.io/](https://www.gladia.io/)
2. Create an account
3. Navigate to **API Keys**
4. Create a new key and copy it

**Pricing**: Pay-per-hour with free tier (see [Gladia Pricing](https://www.gladia.io/pricing))

## Using External APIs

Once API keys are configured, FOVEA automatically uses external providers when:

1. **Model service is configured**: Environment variables or UI keys are set
2. **Provider is selected**: You choose an external model in the UI
3. **Local models unavailable**: No local GPU or models not loaded

### Video Summarization with External APIs

1. Select a video
2. Click **Generate Summary**
3. In the summarization dialog, select model:
   - Choose **External Provider** tab (if available)
   - Select provider (Anthropic, OpenAI, Google)
   - Select specific model (Claude Sonnet 4.5, GPT-4o, Gemini 2.5 Flash)
4. Configure other options (frame rate, audio transcription)
5. Click **Generate**

The system sends video frames to the external API and retrieves the analysis results.

### Audio Transcription with External APIs

1. Select a video
2. Click **Generate Summary**
3. Expand **Audio Options**
4. Check **Enable Audio Transcription**
5. The system automatically selects an available audio provider based on configured API keys
6. Click **Generate**

If multiple audio providers are configured, the system selects based on:
- User-configured keys (first priority)
- System-level keys (second priority)
- Environment variables (fallback)

### Ontology Augmentation with External APIs

Ontology suggestions use LLM providers for text generation:

1. Open the **Ontology Workspace**
2. Click **Augment Ontology**
3. Select provider (if multiple configured)
4. Describe your domain and requirements
5. Click **Generate Suggestions**

The system generates ontology type suggestions based on your persona context.

## Cost Management

### Monitoring API Usage

Most providers offer usage dashboards:
- Anthropic: [console.anthropic.com](https://console.anthropic.com)
- OpenAI: [https://platform.openai.com/usage](https://platform.openai.com/usage)
- Google AI: [https://console.cloud.google.com/billing](https://console.cloud.google.com/billing)

Check these dashboards regularly to monitor costs.

### Cost Optimization Strategies

**For Video Summarization:**
- Reduce `frame_sample_rate` (fewer frames = lower cost)
- Reduce `max_frames` to minimum needed
- Use faster models (Gemini 2.5 Flash is fastest and most economical)
- Process shorter video clips instead of full videos

**For Audio Transcription:**
- Disable speaker diarization if not needed (reduces cost for some providers)
- Specify language instead of auto-detection (faster processing)
- Use local Whisper models for high-volume transcription
- Choose budget-friendly providers (Google, AWS free tiers)

**General Tips:**
- Set up billing alerts with your provider
- Use free tiers for testing and development
- Switch to local models for high-volume production use
- Only enable audio when needed (audio + visual costs more than visual alone)

## Security Best Practices

### API Key Security

- **Never commit API keys to version control**: Use `.env` files and `.gitignore`
- **Rotate keys periodically**: Create new keys every 90 days
- **Use separate keys for dev/prod**: Different keys for different environments
- **Revoke compromised keys immediately**: If a key is exposed, revoke it in the provider console
- **Limit key permissions**: Use read-only or specific service permissions where possible

### Data Privacy

When using external APIs:
- **Data leaves your infrastructure**: Video frames and audio are sent to external services
- **Review provider privacy policies**: Understand data retention and usage policies
- **Compliance requirements**: Ensure provider meets your regulatory requirements (GDPR, HIPAA, etc.)
- **Opt-out of training**: Some providers allow opting out of model training on your data

For sensitive content, use local models instead of external APIs.

## Troubleshooting

### API Key Not Working

**Problem**: API requests fail with authentication errors.

**Solutions**:
- Verify API key is correctly copied (no extra spaces or characters)
- Check API key has not expired (some providers expire keys)
- Ensure API key has correct permissions enabled
- Test API key directly with provider's API (use curl or Postman)
- Check provider account has available credits/quota
- Review provider dashboard for account status

### No External Provider Option

**Problem**: External provider option not available in model selection.

**Solutions**:
- Verify at least one API key is configured (user, system, or environment)
- Check model service is running (http://localhost:8000/docs)
- Restart model service after adding environment variables
- Review model service logs for configuration errors
- Ensure frontend can communicate with model service (check CORS)

### Rate Limit Errors

**Problem**: API requests fail with rate limit or quota exceeded errors.

**Solutions**:
- Wait for rate limit to reset (varies by provider)
- Upgrade to higher tier plan with provider
- Reduce request frequency (process fewer videos)
- Use multiple API keys and rotate between them (if provider allows)
- Switch to local models for high-volume processing

### High API Costs

**Problem**: API usage costs are higher than expected.

**Solutions**:
- Review cost optimization strategies (see above)
- Check usage dashboard for unexpected usage
- Reduce frame sample rate and max frames
- Use smaller models (Haiku, GPT-4o-mini, Gemini Flash)
- Switch to local models for production workloads
- Set up billing alerts and limits with provider

### Slow API Response Times

**Problem**: External API requests take longer than expected.

**Solutions**:
- Check internet connection speed and latency
- Try different provider (some are faster than others)
- Reduce frame count to process less data
- Use streaming models if available (Deepgram, Azure)
- Consider local models for latency-sensitive applications

## Next Steps

- **[Audio Transcription](./audio/transcription-overview.md)**: Use external audio transcription services
- **[Audio-Visual Fusion](./audio/fusion-strategies.md)**: Combine audio and visual analysis
- **[Video Summarization](../model-service/video-summarization.md)**: Generate summaries with external VLMs
- **[API Reference](../api-reference/authentication.md)**: API key management endpoints
