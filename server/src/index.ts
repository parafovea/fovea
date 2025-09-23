import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import videoRoutes from './routes/videos.js'
import ontologyRoutes from './routes/ontology.js'
import annotationRoutes from './routes/annotations.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/videos', videoRoutes)
app.use('/api/ontology', ontologyRoutes)
app.use('/api/annotations', annotationRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

async function initializeDataDirectory() {
  const dataDir = join(dirname(__dirname), '..', 'data')
  try {
    await fs.access(dataDir)
    console.log(`Data directory found at: ${dataDir}`)
  } catch {
    console.log('Data directory not found, will use sample data')
  }
}

app.listen(PORT, async () => {
  await initializeDataDirectory()
  console.log(`Server running on http://localhost:${PORT}`)
})