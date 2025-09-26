import { useState, useEffect, useCallback } from 'react'

// Preference keys for localStorage
const PREF_KEYS = {
  LAST_PERSONA: 'fovea_lastPersona',
  LAST_IMPORT_SOURCE: 'fovea_lastImportSource',
  LAST_IMPORT_MODE: 'fovea_lastImportMode',
  VIDEO_FILTER_STATE: 'fovea_videoFilterState',
  ONTOLOGY_FILTER_STATE: 'fovea_ontologyFilterState',
  OBJECT_FILTER_STATE: 'fovea_objectFilterState',
  WIKIDATA_FILTER: 'fovea_wikidataFilter',
  RECENT_OBJECTS: 'fovea_recentObjects',
  RECENT_ANNOTATIONS: 'fovea_recentAnnotations',
  VIEW_MODE: 'fovea_viewMode',
  SORT_ORDER: 'fovea_sortOrder',
  SHOW_SHORTCUTS_HINT: 'fovea_showShortcutsHint',
} as const

type PreferenceKey = typeof PREF_KEYS[keyof typeof PREF_KEYS]

interface FilterState {
  searchQuery?: string
  selectedTags?: string[]
  wikidataFilter?: 'all' | 'wikidata' | 'manual'
  sortBy?: string
  viewMode?: 'grid' | 'list'
}

interface UsePreferencesReturn {
  // Persona preferences
  lastPersonaId: string | null
  setLastPersonaId: (id: string) => void
  
  // Import preferences
  lastImportSource: string | null
  setLastImportSource: (source: string) => void
  lastImportMode: 'manual' | 'copy' | 'wikidata'
  setLastImportMode: (mode: 'manual' | 'copy' | 'wikidata') => void
  
  // Filter states
  getFilterState: (workspace: 'video' | 'ontology' | 'object') => FilterState
  setFilterState: (workspace: 'video' | 'ontology' | 'object', state: FilterState) => void
  
  // Recent items
  recentObjects: string[]
  addRecentObject: (id: string) => void
  recentAnnotations: string[]
  addRecentAnnotation: (id: string) => void
  
  // UI preferences
  showShortcutsHint: boolean
  setShowShortcutsHint: (show: boolean) => void
  
  // Utility functions
  clearPreference: (key: PreferenceKey) => void
  clearAllPreferences: () => void
}

/**
 * Custom hook for managing user preferences in localStorage
 * Provides smart defaults and remembers user choices across sessions
 */
export function usePreferences(): UsePreferencesReturn {
  // Helper function to safely get from localStorage
  const getStoredValue = <T>(key: string, defaultValue: T): T => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return defaultValue
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  }
  
  // Helper function to safely set to localStorage
  const setStoredValue = <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error(`Failed to save preference ${key}:`, error)
    }
  }
  
  // Persona preferences
  const [lastPersonaId, setLastPersonaIdState] = useState<string | null>(
    getStoredValue(PREF_KEYS.LAST_PERSONA, null)
  )
  
  const setLastPersonaId = useCallback((id: string) => {
    setLastPersonaIdState(id)
    setStoredValue(PREF_KEYS.LAST_PERSONA, id)
  }, [])
  
  // Import preferences
  const [lastImportSource, setLastImportSourceState] = useState<string | null>(
    getStoredValue(PREF_KEYS.LAST_IMPORT_SOURCE, null)
  )
  
  const setLastImportSource = useCallback((source: string) => {
    setLastImportSourceState(source)
    setStoredValue(PREF_KEYS.LAST_IMPORT_SOURCE, source)
  }, [])
  
  const [lastImportMode, setLastImportModeState] = useState<'manual' | 'copy' | 'wikidata'>(
    getStoredValue(PREF_KEYS.LAST_IMPORT_MODE, 'manual')
  )
  
  const setLastImportMode = useCallback((mode: 'manual' | 'copy' | 'wikidata') => {
    setLastImportModeState(mode)
    setStoredValue(PREF_KEYS.LAST_IMPORT_MODE, mode)
  }, [])
  
  // Filter states
  const getFilterState = useCallback((workspace: 'video' | 'ontology' | 'object'): FilterState => {
    const key = workspace === 'video' ? PREF_KEYS.VIDEO_FILTER_STATE :
                workspace === 'ontology' ? PREF_KEYS.ONTOLOGY_FILTER_STATE :
                PREF_KEYS.OBJECT_FILTER_STATE
    return getStoredValue(key, {})
  }, [])
  
  const setFilterState = useCallback((workspace: 'video' | 'ontology' | 'object', state: FilterState) => {
    const key = workspace === 'video' ? PREF_KEYS.VIDEO_FILTER_STATE :
                workspace === 'ontology' ? PREF_KEYS.ONTOLOGY_FILTER_STATE :
                PREF_KEYS.OBJECT_FILTER_STATE
    setStoredValue(key, state)
  }, [])
  
  // Recent items (limit to 10 most recent)
  const [recentObjects, setRecentObjectsState] = useState<string[]>(
    getStoredValue(PREF_KEYS.RECENT_OBJECTS, [])
  )
  
  const addRecentObject = useCallback((id: string) => {
    setRecentObjectsState(prev => {
      const updated = [id, ...prev.filter(i => i !== id)].slice(0, 10)
      setStoredValue(PREF_KEYS.RECENT_OBJECTS, updated)
      return updated
    })
  }, [])
  
  const [recentAnnotations, setRecentAnnotationsState] = useState<string[]>(
    getStoredValue(PREF_KEYS.RECENT_ANNOTATIONS, [])
  )
  
  const addRecentAnnotation = useCallback((id: string) => {
    setRecentAnnotationsState(prev => {
      const updated = [id, ...prev.filter(i => i !== id)].slice(0, 10)
      setStoredValue(PREF_KEYS.RECENT_ANNOTATIONS, updated)
      return updated
    })
  }, [])
  
  // UI preferences
  const [showShortcutsHint, setShowShortcutsHintState] = useState<boolean>(
    getStoredValue(PREF_KEYS.SHOW_SHORTCUTS_HINT, true)
  )
  
  const setShowShortcutsHint = useCallback((show: boolean) => {
    setShowShortcutsHintState(show)
    setStoredValue(PREF_KEYS.SHOW_SHORTCUTS_HINT, show)
  }, [])
  
  // Utility functions
  const clearPreference = useCallback((key: PreferenceKey) => {
    localStorage.removeItem(key)
    // Reset state based on key
    switch (key) {
      case PREF_KEYS.LAST_PERSONA:
        setLastPersonaIdState(null)
        break
      case PREF_KEYS.LAST_IMPORT_SOURCE:
        setLastImportSourceState(null)
        break
      case PREF_KEYS.LAST_IMPORT_MODE:
        setLastImportModeState('manual')
        break
      case PREF_KEYS.RECENT_OBJECTS:
        setRecentObjectsState([])
        break
      case PREF_KEYS.RECENT_ANNOTATIONS:
        setRecentAnnotationsState([])
        break
      case PREF_KEYS.SHOW_SHORTCUTS_HINT:
        setShowShortcutsHintState(true)
        break
    }
  }, [])
  
  const clearAllPreferences = useCallback(() => {
    Object.values(PREF_KEYS).forEach(key => {
      localStorage.removeItem(key)
    })
    // Reset all state
    setLastPersonaIdState(null)
    setLastImportSourceState(null)
    setLastImportModeState('manual')
    setRecentObjectsState([])
    setRecentAnnotationsState([])
    setShowShortcutsHintState(true)
  }, [])
  
  // Sync with localStorage on mount
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === null) {
        // Clear all was called
        clearAllPreferences()
      } else if (Object.values(PREF_KEYS).includes(e.key as PreferenceKey)) {
        // Update specific preference
        switch (e.key) {
          case PREF_KEYS.LAST_PERSONA:
            setLastPersonaIdState(e.newValue ? JSON.parse(e.newValue) : null)
            break
          case PREF_KEYS.LAST_IMPORT_SOURCE:
            setLastImportSourceState(e.newValue ? JSON.parse(e.newValue) : null)
            break
          case PREF_KEYS.LAST_IMPORT_MODE:
            setLastImportModeState(e.newValue ? JSON.parse(e.newValue) : 'manual')
            break
          case PREF_KEYS.RECENT_OBJECTS:
            setRecentObjectsState(e.newValue ? JSON.parse(e.newValue) : [])
            break
          case PREF_KEYS.RECENT_ANNOTATIONS:
            setRecentAnnotationsState(e.newValue ? JSON.parse(e.newValue) : [])
            break
          case PREF_KEYS.SHOW_SHORTCUTS_HINT:
            setShowShortcutsHintState(e.newValue ? JSON.parse(e.newValue) : true)
            break
        }
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [clearAllPreferences])
  
  return {
    lastPersonaId,
    setLastPersonaId,
    lastImportSource,
    setLastImportSource,
    lastImportMode,
    setLastImportMode,
    getFilterState,
    setFilterState,
    recentObjects,
    addRecentObject,
    recentAnnotations,
    addRecentAnnotation,
    showShortcutsHint,
    setShowShortcutsHint,
    clearPreference,
    clearAllPreferences,
  }
}