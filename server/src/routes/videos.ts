import { Router } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { VideoMetadata, VideoSummary } from '../models/types.js'
import { videoSummaryModel } from '../models/VideoSummary.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const router = Router()

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data')

router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.info.json'))
    
    const videos: VideoMetadata[] = []
    
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8')
        const data = JSON.parse(content)
        
        const videoFile = file.replace('.info.json', '.mp4')
        const hasVideo = files.includes(videoFile)
        
        if (hasVideo || data.formats) {
          videos.push({
            id: data.id,
            title: data.title || 'Untitled',
            description: data.description || '',
            duration: data.duration || 0,
            width: data.width || 1280,
            height: data.height || 720,
            fps: data.fps || 30,
            format: data.ext || 'mp4',
            uploader: data.uploader || '',
            uploader_id: data.uploader_id,
            uploader_url: data.uploader_url,
            uploadDate: data.upload_date || '',
            upload_date: data.upload_date,
            timestamp: data.timestamp,
            tags: data.tags || [],
            thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || '',
            thumbnails: data.thumbnails,
            filePath: hasVideo ? path.join(DATA_DIR, videoFile) : '',
            formats: data.formats,
            webpage_url: data.webpage_url,
            channel_id: data.channel_id,
            like_count: data.like_count,
            repost_count: data.repost_count,
            comment_count: data.comment_count,
          })
        }
      } catch (error) {
        console.error(`Error parsing ${file}:`, error)
      }
    }
    
    res.json(videos)
  } catch (error) {
    console.error('Error loading videos:', error)
    res.status(500).json({ error: 'Failed to load videos' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR)
    const infoFile = files.find(f => f.includes(`[${req.params.id}]`) && f.endsWith('.info.json'))
    
    if (!infoFile) {
      return res.status(404).json({ error: 'Video not found' })
    }
    
    const content = await fs.readFile(path.join(DATA_DIR, infoFile), 'utf-8')
    const data = JSON.parse(content)
    
    const videoFile = infoFile.replace('.info.json', '.mp4')
    const hasVideo = files.includes(videoFile)
    
    const video: VideoMetadata = {
      id: data.id,
      title: data.title || 'Untitled',
      description: data.description || '',
      duration: data.duration || 0,
      width: data.width || 1280,
      height: data.height || 720,
      fps: data.fps || 30,
      format: data.ext || 'mp4',
      uploader: data.uploader || '',
      uploader_id: data.uploader_id,
      uploader_url: data.uploader_url,
      uploadDate: data.upload_date || '',
      upload_date: data.upload_date,
      timestamp: data.timestamp,
      tags: data.tags || [],
      thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || '',
      thumbnails: data.thumbnails,
      filePath: hasVideo ? path.join(DATA_DIR, videoFile) : '',
      formats: data.formats,
      webpage_url: data.webpage_url,
      channel_id: data.channel_id,
      like_count: data.like_count,
      repost_count: data.repost_count,
      comment_count: data.comment_count,
    }
    
    res.json(video)
  } catch (error) {
    console.error('Error loading video:', error)
    res.status(500).json({ error: 'Failed to load video' })
  }
})

router.get('/:id/stream', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR)
    const videoFile = files.find(f => f.includes(`[${req.params.id}]`) && f.endsWith('.mp4'))
    
    if (!videoFile) {
      return res.status(404).json({ error: 'Video file not found' })
    }
    
    const videoPath = path.join(DATA_DIR, videoFile)
    const stat = await fs.stat(videoPath)
    const fileSize = stat.size
    const range = req.headers.range
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = (end - start) + 1
      const createReadStream = (await import('fs')).createReadStream
      const stream = createReadStream(videoPath, { start, end })
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      }
      res.writeHead(206, head)
      stream.pipe(res)
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      }
      res.writeHead(200, head)
      const createReadStream = (await import('fs')).createReadStream
      createReadStream(videoPath).pipe(res)
    }
  } catch (error) {
    console.error('Error streaming video:', error)
    res.status(500).json({ error: 'Failed to stream video' })
  }
})

// Video Summary endpoints
router.get('/:videoId/summaries', async (req, res) => {
  try {
    const summaries = videoSummaryModel.getAllForVideo(req.params.videoId)
    res.json(summaries)
  } catch (error) {
    console.error('Error loading video summaries:', error)
    res.status(500).json({ error: 'Failed to load video summaries' })
  }
})

router.get('/:videoId/summaries/:personaId', async (req, res) => {
  try {
    const summary = videoSummaryModel.getForPersona(
      req.params.videoId, 
      req.params.personaId
    )
    
    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' })
    }
    
    res.json(summary)
  } catch (error) {
    console.error('Error loading video summary:', error)
    res.status(500).json({ error: 'Failed to load video summary' })
  }
})

router.post('/:videoId/summaries', async (req, res) => {
  try {
    const summary: VideoSummary = req.body
    
    // Validate required fields
    if (!summary.videoId || !summary.personaId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    // Ensure videoId matches URL param
    summary.videoId = req.params.videoId
    
    const savedSummary = videoSummaryModel.save(summary)
    res.json(savedSummary)
  } catch (error) {
    console.error('Error creating video summary:', error)
    res.status(500).json({ error: 'Failed to create video summary' })
  }
})

router.put('/:videoId/summaries/:summaryId', async (req, res) => {
  try {
    const summary: VideoSummary = req.body
    
    // Ensure IDs match
    summary.videoId = req.params.videoId
    summary.id = req.params.summaryId
    
    const savedSummary = videoSummaryModel.save(summary)
    res.json(savedSummary)
  } catch (error) {
    console.error('Error updating video summary:', error)
    res.status(500).json({ error: 'Failed to update video summary' })
  }
})

router.delete('/:videoId/summaries/:summaryId', async (req, res) => {
  try {
    const deleted = videoSummaryModel.delete(
      req.params.videoId,
      req.params.summaryId
    )
    
    if (!deleted) {
      return res.status(404).json({ error: 'Summary not found' })
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting video summary:', error)
    res.status(500).json({ error: 'Failed to delete video summary' })
  }
})

export default router