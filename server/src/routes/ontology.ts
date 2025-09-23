import { Router } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Ontology, Persona } from '../models/types.js'
import ontologySchema from '../schemas/ontology.schema.json' assert { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const router = Router()

const ONTOLOGY_FILE = path.join(__dirname, '..', '..', 'ontology.json')
const ajv = new Ajv()
addFormats(ajv)
const validate = ajv.compile(ontologySchema)

let currentOntology: Ontology | null = null

async function loadOntology() {
  try {
    const data = await fs.readFile(ONTOLOGY_FILE, 'utf-8')
    currentOntology = JSON.parse(data)
  } catch (error) {
    currentOntology = createDefaultOntology()
  }
  return currentOntology
}

function createDefaultOntology(): Ontology {
  const now = new Date().toISOString()
  return {
    id: generateId(),
    version: '0.1.0',
    persona: {
      id: generateId(),
      role: 'Tactically-Oriented Analyst',
      informationNeed: 'Imports and exports of goods via ship, truck, or rail',
      details: 'The information need includes the arrival or departure of ships, trucks, trains, container counts, types, and company logos.',
      createdAt: now,
      updatedAt: now,
    },
    entities: [],
    roles: [],
    events: [],
    createdAt: now,
    updatedAt: now,
    description: 'Default ontology for video annotation',
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

async function saveOntology() {
  if (!currentOntology) return
  await fs.writeFile(ONTOLOGY_FILE, JSON.stringify(currentOntology, null, 2))
}

router.get('/', async (req, res) => {
  try {
    const ontology = await loadOntology()
    res.json(ontology)
  } catch (error) {
    console.error('Error loading ontology:', error)
    res.status(500).json({ error: 'Failed to load ontology' })
  }
})

router.put('/', async (req, res) => {
  try {
    const ontology = req.body
    
    const exportData = {
      ontology,
      annotations: [],
      videos: [],
      exportDate: new Date().toISOString(),
      exportVersion: '1.0.0',
    }
    
    const valid = validate(exportData)
    if (!valid) {
      return res.status(400).json({ 
        error: 'Invalid ontology format',
        details: validate.errors 
      })
    }
    
    currentOntology = ontology
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(currentOntology)
  } catch (error) {
    console.error('Error saving ontology:', error)
    res.status(500).json({ error: 'Failed to save ontology' })
  }
})

router.post('/entities', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    const entity = {
      ...req.body,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.entities.push(entity)
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(entity)
  } catch (error) {
    console.error('Error adding entity:', error)
    res.status(500).json({ error: 'Failed to add entity' })
  }
})

router.put('/entities/:id', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    const index = currentOntology.entities.findIndex(e => e.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Entity not found' })
    }
    
    currentOntology.entities[index] = {
      ...req.body,
      id: req.params.id,
      createdAt: currentOntology.entities[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(currentOntology.entities[index])
  } catch (error) {
    console.error('Error updating entity:', error)
    res.status(500).json({ error: 'Failed to update entity' })
  }
})

router.delete('/entities/:id', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    currentOntology.entities = currentOntology.entities.filter(e => e.id !== req.params.id)
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting entity:', error)
    res.status(500).json({ error: 'Failed to delete entity' })
  }
})

router.post('/roles', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    const role = {
      ...req.body,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.roles.push(role)
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(role)
  } catch (error) {
    console.error('Error adding role:', error)
    res.status(500).json({ error: 'Failed to add role' })
  }
})

router.put('/roles/:id', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    const index = currentOntology.roles.findIndex(r => r.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Role not found' })
    }
    
    currentOntology.roles[index] = {
      ...req.body,
      id: req.params.id,
      createdAt: currentOntology.roles[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(currentOntology.roles[index])
  } catch (error) {
    console.error('Error updating role:', error)
    res.status(500).json({ error: 'Failed to update role' })
  }
})

router.post('/events', async (req, res) => {
  try {
    if (!currentOntology) {
      currentOntology = await loadOntology()
    }
    
    const event = {
      ...req.body,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.events.push(event)
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(event)
  } catch (error) {
    console.error('Error adding event:', error)
    res.status(500).json({ error: 'Failed to add event' })
  }
})

router.post('/validate', async (req, res) => {
  try {
    const valid = validate(req.body)
    if (valid) {
      res.json({ valid: true })
    } else {
      res.status(400).json({ 
        valid: false,
        errors: validate.errors 
      })
    }
  } catch (error) {
    console.error('Error validating ontology:', error)
    res.status(500).json({ error: 'Failed to validate ontology' })
  }
})

export default router