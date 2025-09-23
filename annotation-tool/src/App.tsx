import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Box } from '@mui/material'
import { useDispatch } from 'react-redux'
import Layout from './components/Layout'
import VideoBrowser from './components/VideoBrowser'
import AnnotationWorkspace from './components/AnnotationWorkspace'
import OntologyBuilder from './components/OntologyBuilder'
import { AppDispatch } from './store/store'
import { setOntology, setLoading, setError } from './store/ontologySlice'
import { setPersonas, setPersonaOntologies, setActivePersona } from './store/personaSlice'
import { api } from './services/api'

function App() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    loadOntology()
  }, [])

  const loadOntology = async () => {
    dispatch(setLoading(true))
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
        } else if (ontology.persona) {
          // Old format - convert to new
          const persona = {
            ...ontology.persona,
            name: ontology.persona.role,
          }
          const personaOntology = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            personaId: persona.id,
            entities: ontology.entities || [],
            roles: ontology.roles || [],
            events: ontology.events || [],
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
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: 'Default Persona',
            role: 'Analyst',
            informationNeed: 'General information extraction',
            details: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          const defaultOntology = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        
        // Keep old format for backward compatibility
        dispatch(setOntology(ontology))
      }
    } catch (error) {
      console.error('Failed to load ontology:', error)
      dispatch(setError('Failed to load ontology'))
    } finally {
      dispatch(setLoading(false))
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<VideoBrowser />} />
          <Route path="annotate/:videoId" element={<AnnotationWorkspace />} />
          <Route path="ontology" element={<OntologyBuilder />} />
        </Route>
      </Routes>
    </Box>
  )
}

export default App