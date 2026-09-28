import { PrismaClient, Prisma, type Media } from '@prisma/client'

/**
 * Repository for all Media database access in the layers store. Media rows
 * describe audio/video/image/document sources that expressions attach to.
 *
 * This class owns every Prisma call for the Media model. It performs no
 * authorization: callers (the route handlers) decide who may invoke a method
 * and what the resulting filter should be. Methods return raw Prisma model
 * types and propagate Prisma errors to their callers.
 *
 * @example
 * ```typescript
 * const repo = new MediaRepository(fastify.prisma)
 * const media = await repo.findById(id)
 * ```
 */
export class MediaRepository {
  /**
   * Creates a new MediaRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a media row by id.
   *
   * @param id - Media UUID
   * @returns the media, or null if not found
   */
  async findById(id: string): Promise<Media | null> {
    return this.prisma.media.findUnique({ where: { id } })
  }

  /**
   * Lists media rows matching a read-scope filter, paginated and newest-first.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param skip - offset
   * @param take - page size
   * @returns the accessible media rows
   */
  async findAccessible(
    readScope: Prisma.MediaWhereInput,
    skip: number,
    take: number
  ): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: readScope,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  }

  /**
   * Counts media rows matching a read-scope filter.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @returns the total number of accessible media rows
   */
  async countAccessible(readScope: Prisma.MediaWhereInput): Promise<number> {
    return this.prisma.media.count({ where: readScope })
  }

  /**
   * Creates a media row from unchecked input (so callers set scope columns such
   * as projectId / createdByUserId directly rather than via relation connect).
   *
   * @param data - Prisma unchecked create input
   * @returns the created media
   */
  async create(data: Prisma.MediaUncheckedCreateInput): Promise<Media> {
    return this.prisma.media.create({ data })
  }

  /**
   * Updates a media row by id.
   *
   * @param id - Media UUID
   * @param data - Prisma unchecked update input
   * @returns the updated media
   */
  async update(id: string, data: Prisma.MediaUncheckedUpdateInput): Promise<Media> {
    return this.prisma.media.update({ where: { id }, data })
  }

  /**
   * Deletes a media row by id.
   *
   * @param id - Media UUID
   */
  async delete(id: string): Promise<void> {
    await this.prisma.media.delete({ where: { id } })
  }
}
