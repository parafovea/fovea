import { randomUUID } from "node:crypto";
import { Queue, Worker, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient, Prisma } from "@prisma/client";
import snakecaseKeys from "snakecase-keys";
import { readOntologyAggregate } from "../services/layers-bridge/ontology-bridge.js";
import { readVideoPersonaAnnotations } from "../services/layers-bridge/annotation-bridge.js";
import {
  readSummaryClaims,
  writeClaim,
  type ClaimSummaryContext,
} from "../services/layers-bridge/claim-bridge.js";
import { nestClaims, type StoredClaim, type StoredClaimNode } from "../services/claim-layers-mapper.js";
import {
  queueJobCounter,
  queueJobDuration,
  modelServiceCounter,
  modelServiceDuration,
} from "../metrics.js";
import { config as appConfig } from "../config.js";
import { buildPersonaPrompts } from "../utils/queryBuilder.js";
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
} from "../lib/fetchModelService.js";

/**
 * Response type from model service /api/summarize endpoint.
 */
export interface ModelSummarizeResponse {
  summary: string;
  visual_analysis: string;
  audio_transcript: string;
  // Mirrors the model-service `KeyFrame` shape (the producer sends objects,
  // not frame indices). Persisted verbatim into the `keyFrames` JSON column.
  key_frames: Array<{
    frame_number: number;
    timestamp: number;
    description: string;
    confidence: number;
  }>;
  confidence: number;
  transcript_json?: Record<string, unknown>;
  audio_language?: string;
  speaker_count?: number;
  audio_model_used?: string;
  visual_model_used?: string;
  fusion_strategy?: string;
  processing_time_audio?: number;
  processing_time_visual?: number;
  processing_time_fusion?: number;
}

/**
 * Request type for model service /api/summarize endpoint.
 */
export interface ModelGenerationOverrides {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export interface ModelAudioOverrides {
  beam_size?: number;
  compute_type?: 'float16' | 'float32' | 'int8' | 'int8_float16';
  num_speakers?: number;
  min_speakers?: number;
  max_speakers?: number;
  vad_threshold?: number;
}

export interface ModelSummarizeRequest {
  video_id: string;
  video_path?: string;
  persona_id: string;
  frame_sample_rate: number;
  max_frames: number;
  persona_role: string | null;
  information_need: string | null;
  enable_audio?: boolean;
  enable_speaker_diarization?: boolean;
  fusion_strategy?: string;
  audio_language?: string;
  generation_overrides?: ModelGenerationOverrides;
  audio_overrides?: ModelAudioOverrides;
}

/**
 * Redis connection configuration for BullMQ.
 * Uses environment variables with localhost defaults for development.
 */
const connection = new Redis({
  host: appConfig.redis.host,
  port: appConfig.redis.port,
  maxRetriesPerRequest: null,
});

/**
 * Queue for processing video summarization jobs.
 * Jobs include video analysis using vision language models to generate summaries.
 */
export const videoSummarizationQueue = new Queue("video-summarization", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

/**
 * Queue events for monitoring video summarization job lifecycle.
 * Provides logging for completed and failed jobs.
 */
const queueEvents = new QueueEvents("video-summarization", { connection });

queueEvents.on("completed", async ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed with result:`, returnvalue);

  // Get job details to calculate duration
  const job = await videoSummarizationQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, {
      queue: "video-summarization",
      status: "completed",
    });
    queueJobDuration.record(duration, {
      queue: "video-summarization",
      status: "completed",
    });
  }
});

queueEvents.on("failed", async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);

  // Get job details to calculate duration
  const job = await videoSummarizationQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, { queue: "video-summarization", status: "failed" });
    queueJobDuration.record(duration, {
      queue: "video-summarization",
      status: "failed",
    });
  }
});

/**
 * Prisma client instance for database operations within workers.
 */
const prisma = new PrismaClient();

/**
 * Job data structure for video summarization tasks.
 */
export interface GenerationOverridesJobData {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AudioOverridesJobData {
  beamSize?: number;
  computeType?: 'float16' | 'float32' | 'int8' | 'int8_float16';
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  vadThreshold?: number;
}

export interface VideoSummarizationJobData {
  videoId: string;
  personaId: string;
  frameSampleRate?: number;
  maxFrames?: number;
  enableAudio?: boolean;
  enableSpeakerDiarization?: boolean;
  fusionStrategy?: string;
  audioLanguage?: string;
  generationOverrides?: GenerationOverridesJobData;
  audioOverrides?: AudioOverridesJobData;
}

/**
 * Result structure returned by video summarization jobs.
 */
export interface VideoSummarizationResult {
  summaryId: string;
  videoId: string;
  personaId: string;
  summary: Prisma.JsonValue;
  visualAnalysis?: string;
  audioTranscript?: string;
  keyFrames?: Array<{
    timestamp: number;
    description: string;
  }>;
  confidence?: number;
}

/**
 * Worker for processing video summarization jobs.
 * Calls the model service API to generate video summaries using vision language models,
 * then saves the results to Prisma database.
 */
export const videoWorker = new Worker<
  VideoSummarizationJobData,
  VideoSummarizationResult
>(
  "video-summarization",
  async (job): Promise<VideoSummarizationResult> => {
    const {
      videoId,
      personaId,
      frameSampleRate = 1,
      maxFrames = 30,
      enableAudio,
      enableSpeakerDiarization,
      fusionStrategy,
      audioLanguage,
      generationOverrides,
      audioOverrides,
    } = job.data;

    await job.updateProgress(10);

    // Fetch video to get path
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { path: true },
    });

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    // Fetch persona prompts for context-specific summarization
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    // Build persona prompts (null for Automated persona)
    let personaRole: string | null = null;
    let informationNeed: string | null = null;

    if (persona.name !== "Automated") {
      const prompts = await buildPersonaPrompts(personaId, prisma);
      personaRole = prompts.persona_role;
      informationNeed = prompts.information_need;
    }

    // Convert backend path to model service path
    // Backend uses /data, model service uses /videos
    const modelVideoPath = video.path.replace('/data/', '/videos/');

    // Call model service with metrics tracking
    const modelServiceUrl = appConfig.modelService.url;
    const modelStartTime = Date.now();

    const camelCaseRequest = {
      videoId,
      videoPath: modelVideoPath,
      personaId,
      frameSampleRate,
      maxFrames,
      personaRole,
      informationNeed,
      ...(enableAudio !== undefined && { enableAudio }),
      ...(enableSpeakerDiarization !== undefined && { enableSpeakerDiarization }),
      ...(fusionStrategy !== undefined && { fusionStrategy }),
      ...(audioLanguage !== undefined && { audioLanguage }),
      ...(generationOverrides !== undefined && { generationOverrides }),
      ...(audioOverrides !== undefined && { audioOverrides }),
    };

    const requestBody = snakecaseKeys(camelCaseRequest) as ModelSummarizeRequest;

    const response = await fetchModelService(`${modelServiceUrl}/api/summarize`, {
      method: "POST",
      timeoutMs: MODEL_SERVICE_TIMEOUTS.summarize,
      body: requestBody,
    });

    const modelDuration = Date.now() - modelStartTime;

    if (!response.ok) {
      modelServiceCounter.add(1, {
        endpoint: "/api/summarize",
        status: response.status,
      });
      modelServiceDuration.record(modelDuration, {
        endpoint: "/api/summarize",
        status: response.status,
      });

      const errorText = await response.text();
      throw new Error(`Model service error (${response.status}): ${errorText}`);
    }

    modelServiceCounter.add(1, {
      endpoint: "/api/summarize",
      status: response.status,
    });
    modelServiceDuration.record(modelDuration, {
      endpoint: "/api/summarize",
      status: response.status,
    });

    await job.updateProgress(50);

    const modelResponse = (await response.json()) as ModelSummarizeResponse;

    await job.updateProgress(70);

    const savedSummary = await prisma.videoSummary.upsert({
      where: {
        videoId_personaId: {
          videoId,
          personaId,
        },
      },
      update: {
        // Convert text summary to GlossItem[] format
        summary: [{ type: 'text', content: modelResponse.summary }],
        visualAnalysis: modelResponse.visual_analysis,
        audioTranscript: modelResponse.audio_transcript,
        keyFrames: modelResponse.key_frames,
        confidence: modelResponse.confidence,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any for complex objects
        transcriptJson: (modelResponse.transcript_json as any) || undefined,
        audioLanguage: modelResponse.audio_language || undefined,
        speakerCount: modelResponse.speaker_count || undefined,
        audioModelUsed: modelResponse.audio_model_used || undefined,
        visualModelUsed: modelResponse.visual_model_used || undefined,
        fusionStrategy: modelResponse.fusion_strategy || undefined,
        processingTimeAudio: modelResponse.processing_time_audio || undefined,
        processingTimeVisual: modelResponse.processing_time_visual || undefined,
        processingTimeFusion: modelResponse.processing_time_fusion || undefined,
        updatedAt: new Date(),
      },
      create: {
        videoId,
        personaId,
        // Convert text summary to GlossItem[] format
        summary: [{ type: 'text', content: modelResponse.summary }],
        visualAnalysis: modelResponse.visual_analysis,
        audioTranscript: modelResponse.audio_transcript,
        keyFrames: modelResponse.key_frames,
        confidence: modelResponse.confidence,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any for complex objects
        transcriptJson: (modelResponse.transcript_json as any) || undefined,
        audioLanguage: modelResponse.audio_language || undefined,
        speakerCount: modelResponse.speaker_count || undefined,
        audioModelUsed: modelResponse.audio_model_used || undefined,
        visualModelUsed: modelResponse.visual_model_used || undefined,
        fusionStrategy: modelResponse.fusion_strategy || undefined,
        processingTimeAudio: modelResponse.processing_time_audio || undefined,
        processingTimeVisual: modelResponse.processing_time_visual || undefined,
        processingTimeFusion: modelResponse.processing_time_fusion || undefined,
      },
    });

    await job.updateProgress(100);

    return {
      summaryId: savedSummary.id,
      videoId: savedSummary.videoId,
      personaId: savedSummary.personaId,
      summary: savedSummary.summary,
      visualAnalysis: savedSummary.visualAnalysis || undefined,
      audioTranscript: savedSummary.audioTranscript || undefined,
      keyFrames: savedSummary.keyFrames as
        | Array<{ timestamp: number; description: string }>
        | undefined,
      confidence: savedSummary.confidence || undefined,
    };
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

/**
 * Queue for processing claim extraction jobs.
 * Jobs include extracting atomic claims from video summaries using LLMs.
 */
export const claimExtractionQueue = new Queue("claim-extraction", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

/**
 * Queue events for monitoring claim extraction job lifecycle.
 */
const claimQueueEvents = new QueueEvents("claim-extraction", { connection });

claimQueueEvents.on("completed", async ({ jobId, returnvalue }) => {
  console.log(`Claim extraction job ${jobId} completed:`, returnvalue);

  const job = await claimExtractionQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, {
      queue: "claim-extraction",
      status: "completed",
    });
    queueJobDuration.record(duration, {
      queue: "claim-extraction",
      status: "completed",
    });
  }
});

claimQueueEvents.on("failed", async ({ jobId, failedReason }) => {
  console.error(`Claim extraction job ${jobId} failed:`, failedReason);

  const job = await claimExtractionQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, { queue: "claim-extraction", status: "failed" });
    queueJobDuration.record(duration, {
      queue: "claim-extraction",
      status: "failed",
    });
  }
});

/**
 * Job data structure for claim extraction tasks.
 */
export interface ClaimExtractionJobData {
  summaryId: string;
  summaryType: "video" | "collection";
  config: {
    inputSources: {
      includeSummaryText: boolean;
      includeAnnotations: boolean;
      includeOntology: boolean;
      ontologyDepth: "names-only" | "names-and-glosses" | "full-definitions";
    };
    extractionStrategy:
      | "sentence-based"
      | "semantic-units"
      | "hierarchical"
      | "manual";
    maxClaimsPerSummary?: number;
    maxSubclaimDepth?: number;
    minConfidence?: number;
    modelId?: string;
    deduplicateClaims?: boolean;
    mergeSimilarClaims?: boolean;
  };
}

/**
 * Result structure returned by claim extraction jobs.
 */
export interface ClaimExtractionResult {
  summaryId: string;
  summaryType: string;
  totalClaims: number;
  totalSubclaims: number;
  modelUsed: string;
  processingTime: number;
}

/**
 * Response type from model service /api/extract-claims endpoint.
 */
export interface ModelClaimExtractionResponse {
  summary_id: string;
  claims: Array<{
    text: string;
    sentence_index?: number;
    char_start?: number;
    char_end?: number;
    subclaims?: unknown[];
    confidence: number;
    claim_type?: string;
  }>;
  model_used: string;
  processing_time: number;
}

/**
 * Worker for processing claim extraction jobs.
 * Calls the model service API to extract atomic claims from summaries,
 * then saves the results to Prisma database.
 */
export const claimWorker = new Worker<
  ClaimExtractionJobData,
  ClaimExtractionResult
>(
  "claim-extraction",
  async (job): Promise<ClaimExtractionResult> => {
    const { summaryId, summaryType, config } = job.data;

    await job.updateProgress(10);

    // Fetch summary
    const summary =
      summaryType === "video"
        ? await prisma.videoSummary.findUnique({ where: { id: summaryId } })
        : null; // Future: Add collection summary support

    if (!summary) {
      throw new Error(`Summary not found: ${summaryId}`);
    }

    await job.updateProgress(20);

    // Build extraction request. The persisted `summary.summary` is a
    // gloss array (`[{type:"text", content:"..."}, ...]`); the
    // model-service's /api/extract-claims expects a single plain
    // string, so flatten the gloss segments before sending.
    const flattenSummaryGloss = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value
          .map((seg) => {
            if (typeof seg === "string") return seg;
            if (seg && typeof seg === "object" && "content" in seg) {
              return String((seg as { content: unknown }).content ?? "");
            }
            return "";
          })
          .join(" ")
          .trim();
      }
      return "";
    };
    const requestBody: Record<string, unknown> = {
      summary_id: summaryId,
      summary_text: flattenSummaryGloss(summary.summary),
      extraction_strategy: config.extractionStrategy,
      max_claims: config.maxClaimsPerSummary || 50,
      min_confidence: config.minConfidence || 0.5,
    };

    // Add ontology context if requested
    if (config.inputSources.includeOntology && summary.personaId) {
      const { aggregate: ontology, exists } = await readOntologyAggregate(
        prisma,
        summary.personaId,
      );

      if (exists) {
        requestBody.ontology_types = [...ontology.entityTypes, ...ontology.eventTypes];
      }
    }

    // Add annotation context if requested
    if (config.inputSources.includeAnnotations && summary.videoId) {
      const annotations = await readVideoPersonaAnnotations(
        prisma,
        summary.videoId,
        summary.personaId,
        15,
      );

      requestBody.annotations = annotations.map((ann) => ({
        name: ann.label,
        type: ann.type,
      }));
    }

    // Call model service
    const modelServiceUrl = appConfig.modelService.url;
    const modelStartTime = Date.now();

    await job.updateProgress(30);

    const response = await fetchModelService(`${modelServiceUrl}/api/extract-claims`, {
      method: "POST",
      timeoutMs: MODEL_SERVICE_TIMEOUTS.extractClaims,
      body: requestBody,
    });

    const modelDuration = Date.now() - modelStartTime;

    if (!response.ok) {
      modelServiceCounter.add(1, {
        endpoint: "/api/extract-claims",
        status: response.status,
      });
      modelServiceDuration.record(modelDuration, {
        endpoint: "/api/extract-claims",
        status: response.status,
      });

      const errorText = await response.text();
      throw new Error(`Model service error (${response.status}): ${errorText}`);
    }

    modelServiceCounter.add(1, {
      endpoint: "/api/extract-claims",
      status: response.status,
    });
    modelServiceDuration.record(modelDuration, {
      endpoint: "/api/extract-claims",
      status: response.status,
    });

    await job.updateProgress(50);

    const modelResponse =
      (await response.json()) as ModelClaimExtractionResponse;

    await job.updateProgress(60);

    // Persist claims into the layers store under the summary's claim-span layer.
    const summaryCtx: ClaimSummaryContext = {
      id: summary.id,
      videoId: summary.videoId,
      projectId: summary.projectId,
      createdBy: summary.createdBy,
    };

    async function saveClaim(
      claimData: (typeof modelResponse.claims)[0],
      parentClaimId?: string,
    ): Promise<string> {
      const claimId = randomUUID();
      const now = new Date().toISOString();
      const claim: StoredClaim = {
        id: claimId,
        summaryId,
        summaryType,
        text: claimData.text,
        gloss: [],
        parentClaimId: parentClaimId ?? null,
        textSpans: claimData.char_start
          ? [
              {
                sentenceIndex: claimData.sentence_index,
                charStart: claimData.char_start,
                charEnd: claimData.char_end,
              },
            ]
          : null,
        timeSpans: null,
        confidence: claimData.confidence,
        modelUsed: modelResponse.model_used,
        extractionStrategy: config.extractionStrategy,
        createdBy: summaryCtx.createdBy,
        projectId: summaryCtx.projectId,
        createdAt: now,
        updatedAt: now,
      };
      await writeClaim(prisma, summaryCtx, claim);

      // Recursively save subclaims
      if (claimData.subclaims && claimData.subclaims.length > 0) {
        for (const subclaimData of claimData.subclaims as (typeof modelResponse.claims)[0][]) {
          await saveClaim(subclaimData, claimId);
        }
      }

      return claimId;
    }

    // Save all root claims
    for (const claimData of modelResponse.claims) {
      await saveClaim(claimData);
    }

    await job.updateProgress(80);

    // Rebuild the denormalized claim tree from the layers store.
    const { claims: flatClaims } = await readSummaryClaims(prisma, summaryId);
    const allClaims = nestClaims(flatClaims);

    const countClaims = (claims: StoredClaimNode[]): number => {
      let count = claims.length;
      for (const claim of claims) {
        if (claim.subclaims && claim.subclaims.length > 0) {
          count += countClaims(claim.subclaims);
        }
      }
      return count;
    };

    const totalClaims = countClaims(allClaims);

    const claimsJson = {
      version: "1.0",
      claims: allClaims,
      metadata: {
        extractedAt: new Date().toISOString(),
        totalClaims,
        totalSubclaims: totalClaims - allClaims.length,
        maxDepth: config.maxSubclaimDepth || 3,
      },
    };

    if (summaryType === "video") {
      await prisma.videoSummary.update({
        where: { id: summaryId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
          claimsJson: claimsJson as any,
          claimsExtractedAt: new Date(),
        },
      });
    }

    await job.updateProgress(100);

    return {
      summaryId,
      summaryType,
      totalClaims,
      totalSubclaims: totalClaims - allClaims.length,
      modelUsed: modelResponse.model_used,
      processingTime: modelResponse.processing_time,
    };
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60000,
    },
  },
);

/**
 * Queue for processing claim synthesis jobs.
 * Jobs include synthesizing narrative summaries from claim hierarchies using LLMs.
 */
export const claimSynthesisQueue = new Queue("claim-synthesis", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

/**
 * Queue events for monitoring claim synthesis job lifecycle.
 */
const synthesisQueueEvents = new QueueEvents("claim-synthesis", { connection });

synthesisQueueEvents.on("completed", async ({ jobId, returnvalue }) => {
  console.log(`Claim synthesis job ${jobId} completed:`, returnvalue);

  const job = await claimSynthesisQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, {
      queue: "claim-synthesis",
      status: "completed",
    });
    queueJobDuration.record(duration, {
      queue: "claim-synthesis",
      status: "completed",
    });
  }
});

synthesisQueueEvents.on("failed", async ({ jobId, failedReason }) => {
  console.error(`Claim synthesis job ${jobId} failed:`, failedReason);

  const job = await claimSynthesisQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn
      ? job.finishedOn - (job.processedOn || job.timestamp)
      : 0;
    queueJobCounter.add(1, { queue: "claim-synthesis", status: "failed" });
    queueJobDuration.record(duration, {
      queue: "claim-synthesis",
      status: "failed",
    });
  }
});

/**
 * Job data structure for claim synthesis tasks.
 */
export interface ClaimSynthesisJobData {
  summaryId: string;
  summaryType: "video" | "collection";
  config: {
    synthesisStrategy:
      | "hierarchical"
      | "chronological"
      | "narrative"
      | "analytical";
    maxLength?: number;
    includeConflicts?: boolean;
    includeCitations?: boolean;
  };
}

/**
 * Result structure returned by claim synthesis jobs.
 */
export interface ClaimSynthesisResult {
  summaryId: string;
  summaryType: string;
  summaryGloss: Prisma.JsonValue;
  modelUsed: string;
  processingTime: number;
  claimsUsed: number;
}

/**
 * Response type from model service /api/synthesize-summary endpoint.
 */
export interface ModelSynthesisResponse {
  summary_id: string;
  summary_gloss: unknown[];
  model_used: string;
  processing_time: number;
  claims_used: number;
  synthesis_metadata: Record<string, unknown>;
}

/**
 * Worker for processing claim synthesis jobs.
 * Calls the model service API to synthesize summaries from claim hierarchies,
 * then updates the VideoSummary in the database.
 */
export const synthesisWorker = new Worker<
  ClaimSynthesisJobData,
  ClaimSynthesisResult
>(
  "claim-synthesis",
  async (job): Promise<ClaimSynthesisResult> => {
    const { summaryId, summaryType, config } = job.data;

    await job.updateProgress(10);

    // Fetch summary and persona; claims are reconstructed from the layers store.
    const summary =
      summaryType === "video"
        ? await prisma.videoSummary.findUnique({
            where: { id: summaryId },
            include: { persona: true },
          })
        : null; // Future: Add collection summary support

    if (!summary) {
      throw new Error(`Summary not found: ${summaryId}`);
    }

    const { claims: flatClaims } = await readSummaryClaims(prisma, summaryId);
    const rootClaims = nestClaims(flatClaims);

    if (rootClaims.length === 0) {
      throw new Error(`No claims found for summary: ${summaryId}`);
    }

    await job.updateProgress(20);

    const camelCaseRequestBody = {
      summaryId,
      claimSources: [
        {
          sourceId: summary.videoId,
          sourceType: "video",
          claims: rootClaims,
          metadata: {
            persona: summary.persona.name,
          },
        },
      ],
      synthesisStrategy: config.synthesisStrategy || "hierarchical",
      maxLength: config.maxLength || 500,
      includeConflicts: config.includeConflicts ?? true,
      includeCitations: config.includeCitations ?? false,
      ...(summary.persona && {
        personaContext: {
          role: summary.persona.role,
          informationNeed: summary.persona.informationNeed,
        },
      }),
    };

    const { aggregate: ontology, exists: ontologyExists } = await readOntologyAggregate(
      prisma,
      summary.personaId,
    );

    if (ontologyExists) {
      Object.assign(camelCaseRequestBody, {
        ontologyContext: {
          types: [...ontology.entityTypes, ...ontology.eventTypes],
        },
      });
    }

    const requestBody = snakecaseKeys(camelCaseRequestBody, { deep: true });

    // Call model service
    const modelServiceUrl = appConfig.modelService.url;
    const modelStartTime = Date.now();

    await job.updateProgress(30);

    const response = await fetchModelService(`${modelServiceUrl}/api/synthesize-summary`, {
      method: "POST",
      timeoutMs: MODEL_SERVICE_TIMEOUTS.synthesize,
      body: requestBody,
    });

    const modelDuration = Date.now() - modelStartTime;

    if (!response.ok) {
      modelServiceCounter.add(1, {
        endpoint: "/api/synthesize-summary",
        status: response.status,
      });
      modelServiceDuration.record(modelDuration, {
        endpoint: "/api/synthesize-summary",
        status: response.status,
      });

      const errorText = await response.text();
      throw new Error(`Model service error (${response.status}): ${errorText}`);
    }

    modelServiceCounter.add(1, {
      endpoint: "/api/synthesize-summary",
      status: response.status,
    });
    modelServiceDuration.record(modelDuration, {
      endpoint: "/api/synthesize-summary",
      status: response.status,
    });

    await job.updateProgress(70);

    const modelResponse = (await response.json()) as ModelSynthesisResponse;

    await job.updateProgress(80);

    // Update summary with synthesized text
    if (summaryType === "video") {
      await prisma.videoSummary.update({
        where: { id: summaryId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
          summary: modelResponse.summary_gloss as any,
          updatedAt: new Date(),
        },
      });
    }

    await job.updateProgress(100);

    return {
      summaryId,
      summaryType,
      summaryGloss: modelResponse.summary_gloss as Prisma.JsonValue,
      modelUsed: modelResponse.model_used,
      processingTime: modelResponse.processing_time,
      claimsUsed: modelResponse.claims_used,
    };
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60000,
    },
  },
);

/**
 * Graceful shutdown handler for queue connections.
 * Closes workers, queue events, and Prisma client cleanly.
 */
export async function closeQueues(): Promise<void> {
  await videoWorker.close();
  await claimWorker.close();
  await synthesisWorker.close();
  await queueEvents.close();
  await claimQueueEvents.close();
  await synthesisQueueEvents.close();
  await videoSummarizationQueue.close();
  await claimExtractionQueue.close();
  await claimSynthesisQueue.close();
  // Only quit connection if it's still open, ignore if already closed
  try {
    if (
      connection.status === "ready" ||
      connection.status === "connecting" ||
      connection.status === "connect"
    ) {
      await connection.quit();
    }
  } catch (error) {
    // Ignore errors if connection is already closed
    if (
      error instanceof Error &&
      !error.message.includes("Connection is closed")
    ) {
      throw error;
    }
  }
  await prisma.$disconnect();
}
