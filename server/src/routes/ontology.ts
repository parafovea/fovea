import { Router } from 'express'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Ontology } from '../models/types.js'
import ontologySchema from '../schemas/ontology.schema.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const router = Router()

const ONTOLOGY_FILE = path.join(__dirname, '..', '..', 'ontology.json')
const ajv = new (Ajv as any)({ strict: false, validateFormats: false })
addFormats(ajv)

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
  
  // Pre-generate IDs for roles to reference them in events
  const carrierRoleId = generateId()
  const cargoRoleId = generateId()
  const originRoleId = generateId()
  const destinationRoleId = generateId()
  const vehicleRoleId = generateId()
  const operatorRoleId = generateId()
  const inspectorRoleId = generateId()
  const locationRoleId = generateId()
  
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
      entities: [
        // Companies
        {
          id: generateId(),
          name: 'Company',
          gloss: [{ 
            type: 'text', 
            content: 'A business entity involved in shipping, logistics, or transportation'
          }],
          examples: ['Maersk', 'FedEx', 'Union Pacific', 'DHL', 'COSCO'],
          createdAt: now,
          updatedAt: now,
        },
        // Vehicles
        {
          id: generateId(),
          name: 'Ship',
          gloss: [{ 
            type: 'text', 
            content: 'A large watercraft designed for maritime transport of cargo across oceans and seas'
          }],
          examples: ['cargo ship', 'container ship', 'tanker', 'bulk carrier'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Truck',
          gloss: [{ 
            type: 'text', 
            content: 'A motor vehicle designed for transporting cargo on roads'
          }],
          examples: ['semi-truck', 'lorry', 'container truck', 'flatbed truck'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Train',
          gloss: [{ 
            type: 'text', 
            content: 'A connected series of rail vehicles for transporting freight'
          }],
          examples: ['freight train', 'cargo train', 'container train'],
          createdAt: now,
          updatedAt: now,
        },
        // Infrastructure
        {
          id: generateId(),
          name: 'Port',
          gloss: [{ 
            type: 'text', 
            content: 'A maritime facility where ships dock to load and unload cargo'
          }],
          examples: ['seaport', 'harbor', 'container terminal'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Rail_Yard',
          gloss: [{ 
            type: 'text', 
            content: 'A railway facility for sorting, storing, and transferring rail freight'
          }],
          examples: ['freight yard', 'intermodal terminal', 'marshalling yard'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Warehouse',
          gloss: [{ 
            type: 'text', 
            content: 'A commercial building for storage of goods and materials'
          }],
          examples: ['distribution center', 'storage facility', 'depot'],
          createdAt: now,
          updatedAt: now,
        },
        // Cargo
        {
          id: generateId(),
          name: 'Container',
          gloss: [{ 
            type: 'text', 
            content: 'A large standardized metal box for efficient cargo transport'
          }],
          examples: ['20-foot container', '40-foot container', 'refrigerated container', 'ISO container'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Goods',
          gloss: [{ 
            type: 'text', 
            content: 'Physical products or materials being transported or stored'
          }],
          examples: ['bulk cargo', 'palletized goods', 'raw materials', 'finished products'],
          createdAt: now,
          updatedAt: now,
        },
        // Equipment
        {
          id: generateId(),
          name: 'Crane',
          gloss: [{ 
            type: 'text', 
            content: 'A large machine for lifting and moving heavy containers and cargo'
          }],
          examples: ['gantry crane', 'container crane', 'mobile crane'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Forklift',
          gloss: [{ 
            type: 'text', 
            content: 'A powered industrial truck for lifting and moving materials'
          }],
          examples: ['reach stacker', 'container handler'],
          createdAt: now,
          updatedAt: now,
        },
        // Identifiers
        {
          id: generateId(),
          name: 'Company_Logo',
          gloss: [{ 
            type: 'text', 
            content: 'A graphic symbol or emblem identifying a company'
          }],
          examples: ['Maersk logo', 'shipping line logo', 'trucking company logo'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Label',
          gloss: [{ 
            type: 'text', 
            content: 'Text or markings providing identification or information about cargo'
          }],
          examples: ['shipping label', 'hazmat label', 'destination tag', 'container number'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      roles: [
        {
          id: carrierRoleId,
          name: 'Carrier',
          gloss: [{ 
            type: 'text', 
            content: 'The entity responsible for transporting goods from one location to another'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['shipping company', 'trucking company', 'rail operator'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: cargoRoleId,
          name: 'Cargo',
          gloss: [{ 
            type: 'text', 
            content: 'The goods or materials being transported'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['containers', 'bulk goods', 'pallets'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: originRoleId,
          name: 'Origin',
          gloss: [{ 
            type: 'text', 
            content: 'The starting location of a transport operation'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['port of origin', 'loading facility'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: destinationRoleId,
          name: 'Destination',
          gloss: [{ 
            type: 'text', 
            content: 'The ending location of a transport operation'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['destination port', 'delivery location'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: vehicleRoleId,
          name: 'Vehicle',
          gloss: [{ 
            type: 'text', 
            content: 'The transport vehicle involved in the operation'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['ship', 'truck', 'train'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: operatorRoleId,
          name: 'Operator',
          gloss: [{ 
            type: 'text', 
            content: 'The person or entity operating equipment or vehicles'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['crane operator', 'truck driver', 'forklift operator'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: inspectorRoleId,
          name: 'Inspector',
          gloss: [{ 
            type: 'text', 
            content: 'The person or entity performing inspection'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['customs officer', 'safety inspector'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: locationRoleId,
          name: 'Location',
          gloss: [{ 
            type: 'text', 
            content: 'The place where an event occurs'
          }],
          allowedFillerTypes: ['entity'],
          examples: ['port', 'warehouse', 'rail yard'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      events: [
        {
          id: generateId(),
          name: 'Loading',
          gloss: [{ 
            type: 'text', 
            content: 'The process of placing cargo onto a transport vehicle'
          }],
          roles: [
            { roleTypeId: cargoRoleId, optional: false },
            { roleTypeId: vehicleRoleId, optional: false },
            { roleTypeId: locationRoleId, optional: true },
            { roleTypeId: operatorRoleId, optional: true },
          ],
          examples: ['container loading', 'truck loading', 'ship loading'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Unloading',
          gloss: [{ 
            type: 'text', 
            content: 'The process of removing cargo from a transport vehicle'
          }],
          roles: [
            { roleTypeId: cargoRoleId, optional: false },
            { roleTypeId: vehicleRoleId, optional: false },
            { roleTypeId: locationRoleId, optional: true },
            { roleTypeId: operatorRoleId, optional: true },
          ],
          examples: ['container unloading', 'offloading', 'discharge'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Arrival',
          gloss: [{ 
            type: 'text', 
            content: 'A transport vehicle reaching its intended location'
          }],
          roles: [
            { roleTypeId: vehicleRoleId, optional: false },
            { roleTypeId: destinationRoleId, optional: false },
            { roleTypeId: carrierRoleId, optional: true },
          ],
          examples: ['ship arrival', 'truck arrival', 'train arrival'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Departure',
          gloss: [{ 
            type: 'text', 
            content: 'A transport vehicle leaving a location'
          }],
          roles: [
            { roleTypeId: vehicleRoleId, optional: false },
            { roleTypeId: originRoleId, optional: false },
            { roleTypeId: carrierRoleId, optional: true },
          ],
          examples: ['ship departure', 'truck departure', 'train departure'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Transfer',
          gloss: [{ 
            type: 'text', 
            content: 'Moving cargo from one transport mode to another'
          }],
          roles: [
            { roleTypeId: cargoRoleId, optional: false },
            { roleTypeId: originRoleId, optional: false },
            { roleTypeId: destinationRoleId, optional: false },
            { roleTypeId: locationRoleId, optional: true },
          ],
          examples: ['intermodal transfer', 'ship-to-rail transfer', 'transloading'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Inspection',
          gloss: [{ 
            type: 'text', 
            content: 'Official examination of cargo or vehicles for compliance or security'
          }],
          roles: [
            { roleTypeId: inspectorRoleId, optional: false },
            { roleTypeId: cargoRoleId, optional: true },
            { roleTypeId: vehicleRoleId, optional: true },
            { roleTypeId: locationRoleId, optional: true },
          ],
          examples: ['customs inspection', 'security check', 'cargo verification'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'Counting',
          gloss: [{ 
            type: 'text', 
            content: 'Determining the quantity of containers or cargo units'
          }],
          roles: [
            { roleTypeId: cargoRoleId, optional: false },
            { roleTypeId: locationRoleId, optional: true },
          ],
          examples: ['container count', 'pallet count', 'unit tally'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      relationTypes: [
        {
          id: generateId(),
          name: 'owns',
          gloss: [{ 
            type: 'text', 
            content: 'Ownership relationship between a company and assets'
          }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          examples: ['Maersk owns container ship', 'FedEx owns delivery truck'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'has_logo',
          gloss: [{ 
            type: 'text', 
            content: 'Associates a company with its visual identifier'
          }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          examples: ['Maersk has_logo seven-pointed star', 'FedEx has_logo purple and orange text'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'operates_at',
          gloss: [{ 
            type: 'text', 
            content: 'Indicates where a company conducts operations'
          }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          examples: ['shipping company operates_at port', 'trucking company operates_at warehouse'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'transports',
          gloss: [{ 
            type: 'text', 
            content: 'Indicates what goods a carrier transports'
          }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          examples: ['ship transports containers', 'truck transports pallets'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: generateId(),
          name: 'located_at',
          gloss: [{ 
            type: 'text', 
            content: 'Spatial relationship indicating where something is positioned'
          }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          examples: ['container located_at port', 'goods located_at warehouse'],
          createdAt: now,
          updatedAt: now,
        },
      ],
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
  return uuidv4()
}

async function saveOntology() {
  if (!currentOntology) return
  await fs.writeFile(ONTOLOGY_FILE, JSON.stringify(currentOntology, null, 2))
}

router.get('/', async (_req, res) => {
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
    
    // Validate ontology using the full schema with definitions
    const validateOntology = ajv.compile(ontologySchema)
    
    // Wrap in export format for validation
    const exportData = {
      ontology,
      annotations: [],
      videos: [],
      exportDate: new Date().toISOString(),
      exportVersion: '1.0.0'
    }
    
    const valid = validateOntology(exportData)
    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validateOntology.errors, null, 2))
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
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
    currentOntology!.updatedAt = new Date().toISOString()
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
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
    
    currentOntology!.updatedAt = new Date().toISOString()
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
    if (!personaOntology) {
      return res.status(404).json({ error: 'Persona ontology not found' })
    }
    
    personaOntology.entities = personaOntology.entities.filter(e => e.id !== req.params.id)
    currentOntology!.updatedAt = new Date().toISOString()
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
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
    currentOntology!.updatedAt = new Date().toISOString()
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
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
    
    currentOntology!.updatedAt = new Date().toISOString()
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
    const personaOntology = currentOntology!.personaOntologies.find(po => po.personaId === personaId)
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
    currentOntology!.updatedAt = new Date().toISOString()
    await saveOntology()
    
    res.json(event)
  } catch (error) {
    console.error('Error adding event:', error)
    res.status(500).json({ error: 'Failed to add event' })
  }
})

router.post('/validate', async (req, res) => {
  try {
    const validateOntology = ajv.compile(ontologySchema)
    
    // Wrap in export format for validation
    const exportData = {
      ontology: req.body,
      annotations: [],
      videos: [],
      exportDate: new Date().toISOString(),
      exportVersion: '1.0.0'
    }
    
    const valid = validateOntology(exportData)
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