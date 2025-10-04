import { useEffect, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { generateId } from './utils/uuid'
import Layout from './components/Layout'
import VideoBrowser from './components/VideoBrowser'
import AnnotationWorkspace from './components/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import Settings from './pages/Settings'
import { AppDispatch } from './store/store'
import { setPersonas, setPersonaOntologies, setActivePersona } from './store/personaSlice'
import { api } from './services/api'

function App() {
  const dispatch = useDispatch<AppDispatch>()

  const loadOntology = useCallback(async () => {
    try {
      const ontology = await api.getOntology()

      // Convert old format to new multi-persona format if needed
      if (ontology) {
        if (ontology.personas && ontology.personaOntologies) {
          // New format
          dispatch(setPersonas(ontology.personas))
          dispatch(setPersonaOntologies(ontology.personaOntologies))
          if (ontology.personas.length > 0) {
            dispatch(setActivePersona(ontology.personas[0].id))
          }
        } else if ((ontology as any).persona) {
          // Old format - convert to new
          const oldOntology = ontology as any
          const persona = {
            ...oldOntology.persona,
            name: oldOntology.persona.role,
          }
          const personaOntology = {
            id: generateId(),
            personaId: persona.id,
            entities: oldOntology.entities || [],
            roles: oldOntology.roles || [],
            events: oldOntology.events || [],
            relationTypes: [],
            relations: [],
            createdAt: ontology.createdAt,
            updatedAt: ontology.updatedAt,
          }
          dispatch(setPersonas([persona]))
          dispatch(setPersonaOntologies([personaOntology]))
          dispatch(setActivePersona(persona.id))
        } else {
          // Create default persona
          const defaultPersona = {
            id: generateId(),
            name: 'Default Persona',
            role: 'Analyst',
            informationNeed: 'General information extraction',
            details: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          const defaultOntology = {
            id: generateId(),
            personaId: defaultPersona.id,
            entities: [],
            roles: [],
            events: [],
            relationTypes: [],
            relations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          dispatch(setPersonas([defaultPersona]))
          dispatch(setPersonaOntologies([defaultOntology]))
          dispatch(setActivePersona(defaultPersona.id))
        }
      }
    } catch (error) {
      console.error('Failed to load ontology:', error)
    }
  }, [dispatch])

  useEffect(() => {
    loadOntology()
  }, [loadOntology])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<VideoBrowser />} />
        <Route path="annotate/:videoId" element={<AnnotationWorkspace />} />
        <Route path="ontology" element={<OntologyWorkspace />} />
        <Route path="objects" element={<ObjectWorkspace />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App