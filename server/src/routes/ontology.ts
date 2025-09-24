import { Router } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Ontology, Persona, PersonaOntology } from '../models/types.js'
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
  const personaId = generateId()
  const personaOntologyId = generateId()
  
  return {
    id: generateId(),
    version: '0.1.0',
    personas: [{
      id: personaId,
      name: 'Default Analyst',
      role: 'Tactically-Oriented Analyst',
      informationNeed: 'Imports and exports of goods via ship, truck, or rail',
      details: 'The information need includes the arrival or departure of ships, trucks, trains, container counts, types, and company logos.',
      createdAt: now,
      updatedAt: now,
    }],
    personaOntologies: [{
      id: personaOntologyId,
      personaId: personaId,
      entities: [],
      roles: [],
      events: [],
      relationTypes: [],
      relations: [],
      createdAt: now,
      updatedAt: now,
    }],
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
    
    // Validate ontology directly (no wrapper)
    const ontologyDef = ontologySchema.definitions?.ontology
    if (!ontologyDef) {
      return res.status(500).json({ error: 'Schema definition not found' })
    }
    
    const validateOntology = ajv.compile(ontologyDef)
    const valid = validateOntology(ontology)
    if (!valid) {
      return res.status(400).json({ 
        error: 'Invalid ontology format',
        details: validateOntology.errors 
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
    
    const { personaId, ...entityData } = req.body
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    const entity = {
      ...entityData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    personaOntology.entities.push(entity)
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
    
    const { personaId, ...entityData } = req.body
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    const index = personaOntology.entities.findIndex(e => e.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Entity not found' })
    }
    
    personaOntology.entities[index] = {
      ...entityData,
      id: req.params.id,
      createdAt: personaOntology.entities[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(personaOntology.entities[index])
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
    
    const { personaId } = req.query
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    personaOntology.entities = personaOntology.entities.filter(e => e.id !== req.params.id)
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
    
    const { personaId, ...roleData } = req.body
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    const role = {
      ...roleData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    personaOntology.roles.push(role)
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
    
    const { personaId, ...roleData } = req.body
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    const index = personaOntology.roles.findIndex(r => r.id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ error: 'Role not found' })
    }
    
    personaOntology.roles[index] = {
      ...roleData,
      id: req.params.id,
      createdAt: personaOntology.roles[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    
    currentOntology.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(personaOntology.roles[index])
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
    
    const { personaId, ...eventData } = req.body
    
    // Find the persona ontology
    const personaOntology = currentOntology.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    const event = {
      ...eventData,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    personaOntology.events.push(event)
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
    // Validate ontology directly (no wrapper)
    const ontologyDef = ontologySchema.definitions?.ontology
    if (!ontologyDef) {
      return res.status(500).json({ error: 'Schema definition not found' })
    }
    
    const validateOntology = ajv.compile(ontologyDef)
    const valid = validateOntology(req.body)
    if (valid) {
      res.json({ valid: true })
    } else {
      res.status(400).json({ 
        valid: false,
        errors: validateOntology.errors 
      })
    }
  } catch (error) {
    console.error('Error validating ontology:', error)
    res.status(500).json({ error: 'Failed to validate ontology' })
  }
})

export default router