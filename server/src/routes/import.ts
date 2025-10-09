import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import { Prisma } from '@prisma/client'
import { ImportHandler } from '../services/import-handler.js'
import { DEFAULT_IMPORT_OPTIONS, ImportOptions } from '../services/import-types.js'

/**
 * TypeBox schemas for import responses.
 */
const WarningSchema = Type.Object({
  line: Type.Number(),
  type: Type.String(),
  message: Type.String()
})

const ErrorSchema = Type.Object({
  line: Type.Number(),
  type: Type.String(),
  message: Type.String()
})

const ConflictSchema = Type.Unknown()

/**
 * Fastify plugin for import-related routes.
 * Provides endpoints for importing annotations from JSON Lines files.
 *
 * Routes:
 * - POST /api/import - Import data from JSON Lines file
 * - POST /api/import/preview - Preview import without committing
 * - GET /api/import/history - Get import history
 */
const importRoute: FastifyPluginAsync = async (fastify) => {
  // Register multipart plugin for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB limit
    }
  })

  /**
   * Import data from JSON Lines file with conflict resolution.
   *
   * @route POST /api/import
   * @body file - Multipart file (JSON Lines format)
   * @body options - Import options JSON string
   * @returns Import result with statistics
   */
  fastify.post('/api/import', {
    schema: {
      description: 'Import data from JSON Lines file',
      tags: ['import'],
      consumes: ['multipart/form-data'],
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          summary: Type.Object({
            totalLines: Type.Number(),
            processedLines: Type.Number(),
            importedItems: Type.Object({
              annotations: Type.Number(),
              totalKeyframes: Type.Number(),
              singleKeyframeSequences: Type.Number()
            }),
            skippedItems: Type.Object({
              annotations: Type.Number()
            })
          }),
          warnings: Type.Array(WarningSchema),
          errors: Type.Array(ErrorSchema),
          conflicts: Type.Array(ConflictSchema)
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const handler = new ImportHandler(fastify.prisma)

    try {
      // Parse multipart data
      const data = await request.file()

      if (!data) {
        reply.code(400)
        return reply.send({
          error: 'Bad Request',
          message: 'No file provided'
        })
      }

      // Read file content
      const fileBuffer = await data.toBuffer()
      const fileContent = fileBuffer.toString('utf-8')

      // Parse options from fields
      const fields = data.fields as Record<string, { value: string }>
      let options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS }

      if (fields.options) {
        try {
          const parsedOptions = JSON.parse(fields.options.value)
          options = { ...DEFAULT_IMPORT_OPTIONS, ...parsedOptions }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          reply.code(400)
          return reply.send({
            error: 'Bad Request',
            message: `Invalid options JSON: ${errorMessage}`
          })
        }
      }

      // Parse JSON Lines
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0)
      const importLines = []

      for (let i = 0; i < lines.length; i++) {
        try {
          const importLine = handler.parseLine(lines[i], i + 1)
          importLines.push(importLine)
        } catch (error) {
          const parseErrorMessage = error instanceof Error ? error.message : 'Unknown parse error'
          reply.code(400)
          return reply.send({
            error: 'Parse Error',
            message: parseErrorMessage
          })
        }
      }

      // Execute import
      const result = await handler.executeImport(importLines, options)

      // Save import history
      if (result.success || !options.transaction.atomic) {
        await fastify.prisma.importHistory.create({
          data: {
            filename: data.filename,
            importOptions: options as unknown as Prisma.InputJsonValue,
            result: result as unknown as Prisma.InputJsonValue,
            success: result.success,
            itemsImported: result.summary.importedItems.annotations,
            itemsSkipped: result.summary.skippedItems.annotations,
            createdAt: new Date()
          }
        })
      }

      return reply.send(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      fastify.log.error(error)
      reply.code(500)
      return reply.send({
        error: 'Internal Server Error',
        message: errorMessage
      })
    }
  })

  /**
   * Preview import without committing to database.
   * Performs parsing, validation, and conflict detection only.
   *
   * @route POST /api/import/preview
   * @body file - Multipart file (JSON Lines format)
   * @returns Import preview with counts and conflicts
   */
  fastify.post('/api/import/preview', {
    schema: {
      description: 'Preview import without committing changes',
      tags: ['import'],
      consumes: ['multipart/form-data'],
      response: {
        200: Type.Object({
          counts: Type.Object({
            annotations: Type.Number(),
            totalKeyframes: Type.Number(),
            singleKeyframeSequences: Type.Number()
          }),
          conflicts: Type.Array(ConflictSchema),
          warnings: Type.Array(Type.String())
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const handler = new ImportHandler(fastify.prisma)

    try {
      // Parse multipart data
      const data = await request.file()

      if (!data) {
        reply.code(400)
        return reply.send({
          error: 'Bad Request',
          message: 'No file provided'
        })
      }

      // Read file content
      const fileBuffer = await data.toBuffer()
      const fileContent = fileBuffer.toString('utf-8')

      // Parse JSON Lines
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0)
      const importLines = []

      for (let i = 0; i < lines.length; i++) {
        try {
          const importLine = handler.parseLine(lines[i], i + 1)
          importLines.push(importLine)
        } catch (error) {
          const parseErrorMessage = error instanceof Error ? error.message : 'Unknown parse error'
          reply.code(400)
          return reply.send({
            error: 'Parse Error',
            message: parseErrorMessage
          })
        }
      }

      // Count items and validate
      const counts = {
        annotations: 0,
        totalKeyframes: 0,
        singleKeyframeSequences: 0
      }

      const warnings: string[] = []

      for (const line of importLines) {
        if (line.type === 'annotation') {
          counts.annotations++

          // Count keyframes
          const sequence = line.data.boundingBoxSequence as { boxes?: Array<{ isKeyframe?: boolean }> } | undefined
          if (sequence && sequence.boxes) {
            const keyframes = sequence.boxes.filter((b) => b.isKeyframe)
            counts.totalKeyframes += keyframes.length

            if (keyframes.length === 1) {
              counts.singleKeyframeSequences++
            }
          }

          // Validate
          const validation = handler.validateLine(line)
          if (!validation.valid) {
            warnings.push(`Line ${line.lineNumber}: ${validation.errors.join(', ')}`)
          }
          for (const warning of validation.warnings) {
            warnings.push(`Line ${line.lineNumber}: ${warning}`)
          }
        }
      }

      // Detect conflicts
      const existingData = await handler.loadExistingData()
      const conflicts = await handler.detectConflicts(importLines, existingData)

      return reply.send({
        counts,
        conflicts,
        warnings
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      fastify.log.error(error)
      reply.code(500)
      return reply.send({
        error: 'Internal Server Error',
        message: errorMessage
      })
    }
  })

  /**
   * Get import history.
   *
   * @route GET /api/import/history
   * @queryparam limit - Maximum number of records to return (default: 50)
   * @queryparam offset - Number of records to skip (default: 0)
   * @returns Array of import history records
   */
  fastify.get('/api/import/history', {
    schema: {
      description: 'Get import history',
      tags: ['import'],
      querystring: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        offset: Type.Optional(Type.Number({ minimum: 0 }))
      }),
      response: {
        200: Type.Object({
          imports: Type.Array(Type.Object({
            id: Type.String(),
            filename: Type.String(),
            success: Type.Boolean(),
            itemsImported: Type.Number(),
            itemsSkipped: Type.Number(),
            createdAt: Type.String()
          })),
          total: Type.Number()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query as {
      limit?: number
      offset?: number
    }

    try {
      const [imports, total] = await Promise.all([
        fastify.prisma.importHistory.findMany({
          select: {
            id: true,
            filename: true,
            success: true,
            itemsImported: true,
            itemsSkipped: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        }),
        fastify.prisma.importHistory.count()
      ])

      return reply.send({
        imports: imports.map(i => ({
          ...i,
          createdAt: i.createdAt.toISOString()
        })),
        total
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      fastify.log.error(error)
      reply.code(500)
      return reply.send({
        error: 'Internal Server Error',
        message: errorMessage
      })
    }
  })
}

export default importRoute
