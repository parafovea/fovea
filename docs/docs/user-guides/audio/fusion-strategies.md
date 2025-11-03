---
title: Audio-Visual Fusion Strategies
sidebar_position: 2
---

# Audio-Visual Fusion Strategies

Audio-visual fusion combines information from audio transcripts and visual analysis to create comprehensive video summaries. FOVEA provides four fusion strategies, each suited for different video types and analysis goals.

## What is Audio-Visual Fusion?

When analyzing videos with both visual content and spoken audio, you can process each modality separately or combine them for richer understanding. Audio-visual fusion determines how these two information streams are integrated:

- **Visual analysis**: Description of what appears in video frames (objects, scenes, actions)
- **Audio transcript**: Transcribed speech with timestamps and speaker labels
- **Fusion**: Strategy for combining visual and audio information into a single summary

## Fusion Strategies

FOVEA supports four fusion strategies. Choose based on your video content and analysis requirements.

### 1. Sequential Fusion

**How it works:**
Process audio and visual information independently, then concatenate the results. Visual analysis appears first, followed by audio transcript.

**Output structure:**
```
## Visual Analysis
[Visual summary from frame analysis]

## Audio Transcript
[Transcribed speech with timestamps]
```

**When to use:**
- Audio and visual content are largely independent
- You want separate sections for audio and visual information
- Video contains minimal correlation between speech and visuals (e.g., voice-over narration with unrelated visuals)
- Fastest processing time is important

**Example use cases:**
- Documentaries with narrator and stock footage
- Presentations with slides and independent commentary
- Podcasts with static or decorative visuals

**Advantages:**
- Simple and fast
- Clear separation of modalities
- Easy to understand output structure
- No risk of information loss from alignment issues

**Limitations:**
- Misses temporal relationships between audio and visual events
- Redundant information not deduplicated
- Summary may not reflect synchronized audio-visual events

### 2. Timestamp-Aligned Fusion

**How it works:**
Align audio segments with visual frames by timestamp, creating an event timeline where audio and visual information for the same time period appear together.

**Output structure:**
```
## Timeline Summary

### 00:00 - 00:15
Visual: [What appears in frames 0-450]
Audio: Speaker 1: [What was said during this time]

### 00:15 - 00:30
Visual: [What appears in frames 450-900]
Audio: Speaker 2: [What was said during this time]
```

**When to use:**
- Audio and visual content are synchronized
- Temporal relationships are important
- You need to understand when specific things were said relative to what was shown
- Interview or conversation videos where speakers react to visual content

**Example use cases:**
- Interviews (speaker reacts to images, video clips)
- Product demonstrations (narrator describes visible actions)
- News broadcasts (reporter discusses shown footage)
- Educational videos (teacher points to visual elements)

**Advantages:**
- Preserves temporal relationships
- Shows correlation between speech and visuals
- Easier to locate specific events
- Natural chronological flow

**Limitations:**
- Requires accurate timestamps from both sources
- Alignment threshold may miss slightly offset events
- More complex output structure
- Processing takes longer than sequential

**Configuration options:**
- **Alignment threshold**: Maximum time difference (seconds) to consider audio and visual events synchronized (default: 1.0)

### 3. Native Multimodal Fusion

**How it works:**
Use models that natively process both audio and visual inputs simultaneously (GPT-4o, Gemini 2.5 Flash). Audio and video are sent together to a single model that understands both modalities.

**Output structure:**
```
[Integrated summary that naturally incorporates both audio and visual information]
```

**When to use:**
- Need highest-quality, most coherent summaries
- Using external API models (GPT-4o, Gemini 2.5 Flash)
- Audio and visual information are tightly integrated
- Budget allows for premium API calls

**Example use cases:**
- Complex scenes requiring understanding of audio-visual context
- Videos where meaning depends on both modalities (e.g., person describing what they're showing)
- Multi-speaker conversations where visual cues matter
- Analysis requiring inference across modalities

**Advantages:**
- Most coherent and natural summaries
- Model understands cross-modal context
- No manual alignment required
- Handles complex audio-visual relationships

**Limitations:**
- Requires external API with multimodal support
- Higher API costs (processing both audio and video)
- Dependent on external service availability
- Less control over output structure

**Supported models:**
- GPT-4o (OpenAI)
- Gemini 2.5 Flash (Google)

### 4. Hybrid Fusion

**How it works:**
Adaptive fusion that combines sequential and timestamp-aligned approaches using weighted combination. Balances speed and integration quality based on audio density and speaker count.

**Output structure:**
```
## Summary
[Weighted combination of visual and audio summaries]

## Visual Highlights
[Key visual moments]

## Audio Highlights (N speakers)
[Key spoken content with timestamps]
```

**When to use:**
- Uncertain which fusion strategy is best
- Want automatic adaptation to content characteristics
- Need balance between processing speed and quality
- Videos with varying audio-visual coupling

**Example use cases:**
- Mixed content (some sections with narration, some without)
- Videos where audio-visual correlation varies over time
- Exploratory analysis of unknown video content
- Batch processing of diverse video types

**Advantages:**
- Adapts to content automatically
- Balances multiple fusion approaches
- Flexible weighting of audio vs. visual importance
- Good general-purpose choice

**Limitations:**
- Less predictable output structure
- May not be optimal for specific use cases
- Additional configuration complexity
- Harder to troubleshoot issues

**Configuration options:**
- **Audio weight**: Importance of audio content (0.0 to 1.0, default: 0.5)
- **Visual weight**: Importance of visual content (0.0 to 1.0, default: 0.5)

## Fusion Configuration

When generating a video summary with audio enabled, configure the fusion strategy:

1. Open the **Generate Summary** dialog
2. Expand **Audio Options**
3. Enable **Audio Transcription**
4. Select **Fusion Strategy** from dropdown:
   - Sequential
   - Timestamp Aligned
   - Native Multimodal
   - Hybrid
5. Adjust weights (if using Hybrid):
   - **Audio Weight**: 0.0 (ignore audio) to 1.0 (prioritize audio)
   - **Visual Weight**: 0.0 (ignore visual) to 1.0 (prioritize visual)
6. Set **Alignment Threshold** (if using Timestamp Aligned):
   - Default: 1.0 second
   - Increase for looser alignment (e.g., 2.0 for subtitle-like delays)
   - Decrease for stricter alignment (e.g., 0.5 for tightly synchronized content)

## Decision Guide

Use this decision tree to choose the right strategy:

```
Do you have an external API configured (GPT-4o or Gemini 2.5 Flash)?
├─ Yes → Are audio and visual tightly integrated?
│         ├─ Yes → Use Native Multimodal
│         └─ No → Continue below
└─ No → Continue below

Are audio and visual synchronized (narration describes what's shown)?
├─ Yes → Use Timestamp Aligned
└─ No → Is audio largely independent from visuals?
          ├─ Yes → Use Sequential
          └─ No (mixed/unknown) → Use Hybrid
```

**Quick recommendations by video type:**

| Video Type | Recommended Strategy | Reason |
|------------|----------------------|--------|
| Interview | Timestamp Aligned | Speaker reacts to shown content |
| Product demo | Timestamp Aligned | Narration describes visible actions |
| Documentary | Sequential | Narration independent from visuals |
| Lecture | Timestamp Aligned | Teacher references slides |
| Podcast | Sequential | Visuals are decorative/static |
| News broadcast | Timestamp Aligned | Reporter discusses footage |
| Tutorial | Timestamp Aligned | Instructor demonstrates steps |
| Conversation | Native Multimodal | Complex multi-speaker interaction |
| Unknown content | Hybrid | Adapts automatically |

## Performance Considerations

### Processing Time

Fusion strategies ranked by speed (fastest to slowest):

1. **Sequential**: Minimal overhead, parallel processing
2. **Timestamp Aligned**: Moderate overhead for alignment
3. **Hybrid**: Similar to timestamp aligned plus weighting
4. **Native Multimodal**: Depends on external API latency

### API Costs

For external API models:

- **Sequential**: Audio transcription cost + visual analysis cost (separate calls)
- **Timestamp Aligned**: Same as sequential + minimal fusion overhead
- **Native Multimodal**: Single API call with both audio and video (often more expensive)
- **Hybrid**: Similar to timestamp aligned

### Quality

Fusion strategies ranked by summary coherence (best to worst):

1. **Native Multimodal**: Best understanding of cross-modal context
2. **Timestamp Aligned**: Good temporal correlation
3. **Hybrid**: Balanced approach
4. **Sequential**: Lowest integration, but clearest structure

## Troubleshooting

### Misaligned Audio and Visual

**Problem**: Timestamp-aligned fusion shows audio and visual events that don't match.

**Solutions:**
- Increase alignment threshold (e.g., from 1.0 to 2.0 seconds)
- Check for audio/video synchronization issues in source file
- Try sequential fusion instead
- Verify transcript timestamps are correct

### Poor Fusion Quality

**Problem**: Hybrid or timestamp-aligned fusion produces confusing summaries.

**Solutions:**
- Try sequential fusion for clearer separation
- Use native multimodal with GPT-4o or Gemini 2.5 Flash
- Adjust audio/visual weights in hybrid mode
- Check that both audio and visual analysis are individually high quality

### Native Multimodal Not Available

**Problem**: Native multimodal option is disabled or missing.

**Solutions:**
- Configure API key for GPT-4o or Gemini 2.5 Flash
- Verify API key has correct permissions
- Check model service logs for configuration errors
- Fall back to timestamp-aligned fusion

### Weighted Fusion Ignores One Modality

**Problem**: Hybrid fusion heavily favors audio or visual despite balanced weights.

**Solutions:**
- Explicitly set audio_weight and visual_weight to 0.5
- Check that both modalities contain substantial content
- Use sequential fusion to see each modality separately
- Verify transcript is not empty (if audio seems ignored)

## Advanced Topics

### Custom Weighting

For hybrid fusion, adjust weights based on content:

- **Interviews**: audio_weight=0.7, visual_weight=0.3 (speech more important)
- **Silent demonstrations**: audio_weight=0.2, visual_weight=0.8 (visuals more important)
- **Balanced content**: audio_weight=0.5, visual_weight=0.5 (equal importance)

### Transcript Inclusion

Control whether full transcript appears in output:

- **Include transcript**: Full verbatim speech with timestamps
- **Summarize transcript**: Key points only, no verbatim text
- **Exclude transcript**: Visual analysis only with audio metadata

### Speaker Label Integration

When speaker diarization is enabled:

- **Sequential**: Speaker labels appear in audio section
- **Timestamp Aligned**: Speaker labels appear in each timeline segment
- **Native Multimodal**: Model incorporates speaker changes naturally
- **Hybrid**: Adaptive integration based on speaker count

## Next Steps

- **[Audio Transcription Overview](./transcription-overview.md)**: Learn about audio transcription capabilities
- **[External API Configuration](../external-apis.md)**: Set up GPT-4o or Gemini 2.5 Flash for native multimodal
- **[Video Summarization](../../model-service/video-summarization.md)**: Complete summarization workflow
- **[API Reference: Audio-Visual Fusion](../../api-reference/audio-transcription.md)**: Technical fusion API documentation
