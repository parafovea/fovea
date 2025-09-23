import { Router } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Annotation } from '../models/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const router = Router()

const ANNOTATIONS_FILE = path.join(__dirname, '..', '..', 'annotations.json')

let annotations: Record<string, Annotation[]> = {}

async function loadAnnotations() {
  try {
    const data = await fs.readFile(ANNOTATIONS_FILE, 'utf-8')
    annotations = JSON.parse(data)
  } catch (error) {
    annotations = {}
  }
  return annotations
}

async function saveAnnotations() {
  await fs.writeFile(ANNOTATIONS_FILE, JSON.stringify(annotations, null, 2))
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

router.get('/:videoId', async (req, res) => {
  try {
    await loadAnnotations()
    const videoAnnotations = annotations[req.params.videoId] || []
    res.json(videoAnnotations)
  } catch (error) {
    console.error('Error loading annotations:', error)
    res.status(500).json({ error: 'Failed to load annotations' })
  }
})

router.post('/', async (req, res) => {
  try {
    await loadAnnotations()
    
    const annotation: Annotation = {
      ...req.body,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    if (!annotations[annotation.videoId]) {
      annotations[annotation.videoId] = []
    }
    
    annotations[annotation.videoId].push(annotation)
    await saveAnnotations()
    
    res.json(annotation)
  } catch (error) {
    console.error('Error adding annotation:', error)
    res.status(500).json({ error: 'Failed to add annotation' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    await loadAnnotations()
    
    const { videoId } = req.body
    if (!annotations[videoId]) {
      return res.status(404).json({ error: 'Video annotations not found' })
    }
    
    const index = annotations[videoId].findIndex(a => a.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Annotation not found' })
    }
    
    annotations[videoId][index] = {
      ...req.body,
      id: req.params.id,
      createdAt: annotations[videoId][index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    
    await saveAnnotations()
    res.json(annotations[videoId][index])
  } catch (error) {
    console.error('Error updating annotation:', error)
    res.status(500).json({ error: 'Failed to update annotation' })
  }
})

router.delete('/:videoId/:id', async (req, res) => {
  try {
    await loadAnnotations()
    
    if (!annotations[req.params.videoId]) {
      return res.status(404).json({ error: 'Video annotations not found' })
    }
    
    annotations[req.params.videoId] = annotations[req.params.videoId].filter(
      a => a.id !== req.params.id
    )
    
    await saveAnnotations()
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting annotation:', error)
    res.status(500).json({ error: 'Failed to delete annotation' })
  }
})

router.post('/export', async (req, res) => {
  try {
    await loadAnnotations()
    
    const allAnnotations: Annotation[] = []
    for (const videoId in annotations) {
      allAnnotations.push(...annotations[videoId])
    }
    
    const exportData = allAnnotations.map(ann => JSON.stringify(ann)).join('\n')
    
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Content-Disposition', 'attachment; filename="annotations.jsonl"')
    res.send(exportData)
  } catch (error) {
    console.error('Error exporting annotations:', error)
    res.status(500).json({ error: 'Failed to export annotations' })
  }
})

export default router