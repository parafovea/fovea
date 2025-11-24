import { useState, useRef, useEffect, KeyboardEvent, useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import {
  Box,
  TextField,
  Typography,
  Paper,
  Popper,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  ClickAwayListener,
  Chip,
} from '@mui/material'
import { RootState } from '../store/store'
import { selectAnnotations } from '../store/annotationSlice'
import { GlossItem } from '../models/types'

interface GlossEditorProps {
  gloss: GlossItem[]
  onChange: (gloss: GlossItem[]) => void
  availableTypes?: ('entity' | 'role' | 'event' | 'relation')[]
  personaId?: string | null
  disabled?: boolean
  videoId?: string | null  // For annotation references
  includeAnnotations?: boolean  // Whether to allow ^ references
  label?: string  // Optional label for the editor (defaults to 'Gloss Definition')
}

interface TypeOption {
  id: string
  name: string
  type: 'entity' | 'role' | 'event'
  personaId?: string | null
}

interface ObjectOption {
  id: string
  name: string
  type: 'entity-object' | 'event-object' | 'time-object' | 'location-object'
}

interface AnnotationOption {
  id: string
  name: string
  type: 'annotation'
}

export default function GlossEditor({ 
  gloss, 
  onChange, 
  availableTypes, 
  personaId, 
  disabled = false, 
  videoId = null,
  includeAnnotations = false,
  label = 'Gloss Definition'
}: GlossEditorProps) {
  const { personaOntologies } = useSelector((state: RootState) => state.persona)
  const { entities, events, times } = useSelector((state: RootState) => state.world)
  const annotations = useSelector((state: RootState) => {
    if (!videoId) return []
    return selectAnnotations(state, videoId)
  }, (a, b) => a === b || (a.length === 0 && b.length === 0))
  const activeOntology = personaOntologies.find(o => o.personaId === personaId)
  
  const [inputValue, setInputValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteAnchor, setAutocompleteAnchor] = useState<null | HTMLElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [autocompleteMode, setAutocompleteMode] = useState<'types' | 'objects' | 'annotations'>('types')
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursorPosition, setCursorPosition] = useState(0)

  // Get all available types (excluding relations as per requirement)
  const allTypes: TypeOption[] = useMemo(() => [
    ...((!availableTypes || availableTypes.includes('entity')) ?
      (activeOntology?.entities.map(e => ({ id: e.id, name: e.name, type: 'entity' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('role')) ?
      (activeOntology?.roles.map(r => ({ id: r.id, name: r.name, type: 'role' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('event')) ?
      (activeOntology?.events.map(e => ({ id: e.id, name: e.name, type: 'event' as const, personaId })) || []) : []),
  ], [availableTypes, activeOntology, personaId])

  // Get all available objects
  const allObjects: ObjectOption[] = useMemo(() => [
    ...entities.filter(e => !('locationType' in e)).map(e => ({
      id: e.id,
      name: e.name,
      type: 'entity-object' as const
    })),
    ...entities.filter(e => 'locationType' in e).map(l => ({
      id: l.id,
      name: l.name,
      type: 'location-object' as const
    })),
    ...events.map(e => ({
      id: e.id,
      name: e.name,
      type: 'event-object' as const
    })),
    ...times.map(t => ({
      id: t.id,
      name: `Time: ${t.type === 'instant' ? (t as any).timestamp || 'instant' : 'interval'}`,
      type: 'time-object' as const
    })),
  ], [entities, events, times])

  // Get all available annotations (if enabled)
  const allAnnotations: AnnotationOption[] = useMemo(() => includeAnnotations ? annotations.map(ann => {
    let name = 'Annotation'

    // Get name from linked object or type
    if ('linkedEntityId' in ann && ann.linkedEntityId) {
      const entity = entities.find(e => e.id === ann.linkedEntityId)
      if (entity) name = entity.name
    } else if ('linkedEventId' in ann && ann.linkedEventId) {
      const event = events.find(e => e.id === ann.linkedEventId)
      if (event) name = event.name
    } else if ('linkedLocationId' in ann && ann.linkedLocationId) {
      const location = entities.find(e => e.id === ann.linkedLocationId)
      if (location) name = location.name
    } else if ('typeId' in ann && ann.typeId) {
      const type = allTypes.find(t => t.id === ann.typeId)
      if (type) name = type.name
    }

    // Add time info to distinguish annotations
    const timeStr = ann.timeSpan ? `@${ann.timeSpan.startTime.toFixed(1)}s` : ''

    return {
      id: ann.id,
      name: `${name}${timeStr}`,
      type: 'annotation' as const
    }
  }) : [], [includeAnnotations, annotations, entities, events, allTypes])

  // Filter types based on search query
  const filteredTypes = searchQuery 
    ? allTypes.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allTypes

  // Filter objects based on search query
  const filteredObjects = searchQuery
    ? allObjects.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allObjects

  // Filter annotations based on search query
  const filteredAnnotations = searchQuery
    ? allAnnotations.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allAnnotations

  // Group filtered types by type
  const groupedTypes = {
    entity: filteredTypes.filter(t => t.type === 'entity'),
    role: filteredTypes.filter(t => t.type === 'role'),
    event: filteredTypes.filter(t => t.type === 'event'),
  }

  // Group filtered objects by type
  const groupedObjects = {
    entities: filteredObjects.filter(o => o.type === 'entity-object'),
    locations: filteredObjects.filter(o => o.type === 'location-object'),
    events: filteredObjects.filter(o => o.type === 'event-object'),
    times: filteredObjects.filter(o => o.type === 'time-object'),
  }

  // Convert gloss items to display string
  const glossToString = useCallback((glossItems: GlossItem[]): string => {
    return glossItems.map(item => {
      if (item.type === 'text') {
        return item.content
      } else if (item.type === 'typeRef') {
        const typeObj = allTypes.find(t => t.id === item.content)
        return typeObj ? `#\`${typeObj.name}\`` : `#[${item.content}]`
      } else if (item.type === 'objectRef') {
        const obj = allObjects.find(o => o.id === item.content)
        return obj ? `@\`${obj.name}\`` : `@[${item.content}]`
      } else if (item.type === 'annotationRef') {
        const ann = allAnnotations.find(a => a.id === item.content)
        return ann ? `^\`${ann.name}\`` : `^[${item.content}]`
      }
      return ''
    }).join('')
  }, [allTypes, allObjects, allAnnotations])

  // Parse string to gloss items
  const stringToGloss = (text: string): GlossItem[] => {
    const items: GlossItem[] = []
    let currentText = ''
    let i = 0
    
    while (i < text.length) {
      if (text[i] === '#') {
        // Handle type reference
        if (currentText) {
          items.push({ type: 'text', content: currentText })
          currentText = ''
        }
        
        // Check if it's a backtick-delimited reference
        if (text[i + 1] === '`') {
          const endBacktick = text.indexOf('`', i + 2)
          if (endBacktick !== -1) {
            const typeName = text.slice(i + 2, endBacktick)
            const typeObj = allTypes.find(t => t.name === typeName)
            
            if (typeObj) {
              items.push({
                type: 'typeRef',
                content: typeObj.id,
                refType: typeObj.type,
                refPersonaId: typeObj.personaId
              })
              i = endBacktick + 1
            } else {
              // No match, treat as text
              currentText += text.slice(i, endBacktick + 1)
              i = endBacktick + 1
            }
          } else {
            // No closing backtick, treat as text
            currentText += '#`'
            i += 2
          }
        } else {
          // Legacy parsing without backticks - try to match multi-word names
          let j = i + 1
          // Find the end of the type name - look for next # or @ or end of string
          while (j < text.length && text[j] !== '#' && text[j] !== '@') {
            j++
          }
          
          // Try to find the longest matching type name
          let matched = false
          let bestMatch = null
          let bestMatchEnd = i + 1
          
          // Check all possible endpoints for matches
          for (let endPos = i + 1; endPos <= j; endPos++) {
            const typeName = text.slice(i + 1, endPos).trim()
            const typeObj = allTypes.find(t => t.name === typeName)
            
            if (typeObj) {
              bestMatch = typeObj
              bestMatchEnd = endPos
              matched = true
            }
          }
          
          if (matched && bestMatch) {
            items.push({
              type: 'typeRef',
              content: bestMatch.id,
              refType: bestMatch.type,
              refPersonaId: bestMatch.personaId
            })
            i = bestMatchEnd
          } else {
            currentText += '#'
            i++
          }
        }
      } else if (text[i] === '^' && includeAnnotations) {
        // Handle annotation reference
        if (currentText) {
          items.push({ type: 'text', content: currentText })
          currentText = ''
        }
        
        // Check if it's a backtick-delimited reference
        if (text[i + 1] === '`') {
          const endBacktick = text.indexOf('`', i + 2)
          if (endBacktick !== -1) {
            const annName = text.slice(i + 2, endBacktick)
            const ann = allAnnotations.find(a => a.name === annName)
            
            if (ann) {
              items.push({
                type: 'annotationRef',
                content: ann.id,
                refType: 'annotation'
              })
              i = endBacktick + 1
            } else {
              // No match, treat as text
              currentText += text.slice(i, endBacktick + 1)
              i = endBacktick + 1
            }
          } else {
            // No closing backtick, treat as text
            currentText += '^`'
            i += 2
          }
        } else {
          // No backtick, treat as text
          currentText += '^'
          i++
        }
      } else if (text[i] === '@') {
        // Handle object reference
        if (currentText) {
          items.push({ type: 'text', content: currentText })
          currentText = ''
        }
        
        // Check if it's a backtick-delimited reference
        if (text[i + 1] === '`') {
          const endBacktick = text.indexOf('`', i + 2)
          if (endBacktick !== -1) {
            const objName = text.slice(i + 2, endBacktick)
            const obj = allObjects.find(o => o.name === objName)
            
            if (obj) {
              items.push({
                type: 'objectRef',
                content: obj.id,
                refType: obj.type
              })
              i = endBacktick + 1
            } else {
              // No match, treat as text
              currentText += text.slice(i, endBacktick + 1)
              i = endBacktick + 1
            }
          } else {
            // No closing backtick, treat as text
            currentText += '@`'
            i += 2
          }
        } else {
          // Legacy parsing without backticks - try to match multi-word names
          let j = i + 1
          // Find the end of the object name - look for next # or @ or end of string
          while (j < text.length && text[j] !== '#' && text[j] !== '@') {
            j++
          }
          
          // Try to find the longest matching object name
          let matched = false
          let bestMatch = null
          let bestMatchEnd = i + 1
          
          // Check all possible endpoints for matches
          for (let endPos = i + 1; endPos <= j; endPos++) {
            const objName = text.slice(i + 1, endPos).trim()
            const obj = allObjects.find(o => o.name === objName)
            
            if (obj) {
              bestMatch = obj
              bestMatchEnd = endPos
              matched = true
            }
          }
          
          if (matched && bestMatch) {
            items.push({
              type: 'objectRef',
              content: bestMatch.id,
              refType: bestMatch.type
            })
            i = bestMatchEnd
          } else {
            currentText += '@'
            i++
          }
        }
      } else {
        currentText += text[i]
        i++
      }
    }
    
    // Add any remaining text
    if (currentText) {
      items.push({ type: 'text', content: currentText })
    }
    
    return items
  }

  // Initialize input value from gloss
  useEffect(() => {
    setInputValue(glossToString(gloss))
  }, [gloss, glossToString]) // Re-run when gloss or glossToString changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setInputValue(value)
    setCursorPosition(cursorPos)
    
    // Check if #, @, or ^ was typed
    const lastChar = value[cursorPos - 1]
    if (lastChar === '#') {
      setShowAutocomplete(true)
      setAutocompleteMode('types')
      setAutocompleteAnchor(e.target)
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastChar === '@') {
      setShowAutocomplete(true)
      setAutocompleteMode('objects')
      setAutocompleteAnchor(e.target)
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastChar === '^' && includeAnnotations) {
      setShowAutocomplete(true)
      setAutocompleteMode('annotations')
      setAutocompleteAnchor(e.target)
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (showAutocomplete) {
      // Update search query if autocomplete is open
      const char = autocompleteMode === 'types' ? '#' : (autocompleteMode === 'objects' ? '@' : '^')
      const charIndex = value.lastIndexOf(char, cursorPos - 1)
      if (charIndex !== -1) {
        const query = value.slice(charIndex + 1, cursorPos)
        setSearchQuery(query)
        setSelectedIndex(0)
      } else {
        setShowAutocomplete(false)
      }
    }
    
    // Update gloss items
    const newGloss = stringToGloss(value)
    onChange(newGloss)
  }

  const insertReference = (item: TypeOption | ObjectOption | AnnotationOption) => {
    const char = autocompleteMode === 'types' ? '#' : (autocompleteMode === 'objects' ? '@' : '^')
    const beforeChar = inputValue.lastIndexOf(char, cursorPosition - 1)
    const beforeText = inputValue.slice(0, beforeChar)
    const afterText = inputValue.slice(cursorPosition)
    
    const newValue = `${beforeText}${char}\`${item.name}\` ${afterText}`
    setInputValue(newValue)
    
    const newGloss = stringToGloss(newValue)
    onChange(newGloss)
    
    setShowAutocomplete(false)
    setSearchQuery('')
    
    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const newPos = beforeText.length + item.name.length + 4 // +4 for @`` and space
        inputRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete) return
    
    const allFilteredItems = autocompleteMode === 'types' 
      ? [...groupedTypes.entity, ...groupedTypes.role, ...groupedTypes.event]
      : autocompleteMode === 'objects'
      ? [...groupedObjects.entities, ...groupedObjects.locations, ...groupedObjects.events, ...groupedObjects.times]
      : filteredAnnotations
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % allFilteredItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + allFilteredItems.length) % allFilteredItems.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allFilteredItems[selectedIndex]) {
        insertReference(allFilteredItems[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false)
      setSearchQuery('')
    }
  }

  // Render gloss preview
  const renderGlossPreview = () => {
    return gloss.map((item, index) => {
      if (item.type === 'text') {
        // Replace spaces with non-breaking spaces to make them visible
        // But preserve regular spaces for normal text flow
        const content = item.content.replace(/ /g, '\u00A0')
        return <span key={index}>{content}</span>
      } else if (item.type === 'typeRef') {
        const typeObj = allTypes.find(t => t.id === item.content)
        const displayName = typeObj ? typeObj.name : item.content
        return (
          <Chip
            key={index}
            label={displayName}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ mx: 0.5, verticalAlign: 'middle', fontStyle: 'italic' }}
          />
        )
      } else if (item.type === 'objectRef') {
        const obj = allObjects.find(o => o.id === item.content)
        const displayName = obj ? obj.name : item.content
        return (
          <Chip
            key={index}
            label={displayName}
            size="small"
            color="secondary"
            variant="filled"
            sx={{ mx: 0.5, verticalAlign: 'middle' }}
          />
        )
      }
      return null
    })
  }

  return (
    <Box>
      <TextField
        label={label}
        inputRef={inputRef}
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        disabled={disabled}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={includeAnnotations
          ? "Type your gloss definition. Use #`name` for types, @`name` for objects, and ^`name` for annotations."
          : "Type your gloss definition. Use #`name` for types and @`name` for objects."}
        variant="outlined"
        InputLabelProps={{ shrink: true }}
        InputProps={{
          inputProps: {
            'aria-label': label
          }
        }}
        sx={{ mb: 2 }}
      />

      <ClickAwayListener onClickAway={() => setShowAutocomplete(false)}>
        <Popper 
          open={showAutocomplete} 
          anchorEl={autocompleteAnchor}
          placement="bottom-start"
          style={{ zIndex: 1300 }}
        >
          <Paper elevation={8} sx={{ maxHeight: 300, overflow: 'auto', minWidth: 250 }}>
            <List dense>
              {autocompleteMode === 'types' ? (
                <>
                  {groupedTypes.entity.length > 0 && (
                    <>
                      <ListSubheader>Entity Types</ListSubheader>
                      {groupedTypes.entity.map((type, idx) => {
                        const globalIdx = idx
                        return (
                          <ListItem
                            key={type.id}
                            onClick={() => insertReference(type)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={type.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {groupedTypes.role.length > 0 && (
                    <>
                      <ListSubheader>Role Types</ListSubheader>
                      {groupedTypes.role.map((type, idx) => {
                        const globalIdx = groupedTypes.entity.length + idx
                        return (
                          <ListItem
                            key={type.id}
                            onClick={() => insertReference(type)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={type.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {groupedTypes.event.length > 0 && (
                    <>
                      <ListSubheader>Event Types</ListSubheader>
                      {groupedTypes.event.map((type, idx) => {
                        const globalIdx = groupedTypes.entity.length + groupedTypes.role.length + idx
                        return (
                          <ListItem
                            key={type.id}
                            onClick={() => insertReference(type)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={type.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {filteredTypes.length === 0 && (
                    <ListItem>
                      <ListItemText 
                        primary="No types found" 
                        secondary="Type to search or ESC to close"
                      />
                    </ListItem>
                  )}
                </>
              ) : autocompleteMode === 'objects' ? (
                <>
                  {groupedObjects.entities.length > 0 && (
                    <>
                      <ListSubheader>Entities</ListSubheader>
                      {groupedObjects.entities.map((obj, idx) => {
                        const globalIdx = idx
                        return (
                          <ListItem
                            key={obj.id}
                            onClick={() => insertReference(obj)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={obj.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {groupedObjects.locations.length > 0 && (
                    <>
                      <ListSubheader>Locations</ListSubheader>
                      {groupedObjects.locations.map((obj, idx) => {
                        const globalIdx = groupedObjects.entities.length + idx
                        return (
                          <ListItem
                            key={obj.id}
                            onClick={() => insertReference(obj)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={obj.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {groupedObjects.events.length > 0 && (
                    <>
                      <ListSubheader>Events</ListSubheader>
                      {groupedObjects.events.map((obj, idx) => {
                        const globalIdx = groupedObjects.entities.length + groupedObjects.locations.length + idx
                        return (
                          <ListItem
                            key={obj.id}
                            onClick={() => insertReference(obj)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={obj.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {groupedObjects.times.length > 0 && (
                    <>
                      <ListSubheader>Times</ListSubheader>
                      {groupedObjects.times.map((obj, idx) => {
                        const globalIdx = groupedObjects.entities.length + groupedObjects.locations.length + groupedObjects.events.length + idx
                        return (
                          <ListItem
                            key={obj.id}
                            onClick={() => insertReference(obj)}
                            sx={{
                              backgroundColor: selectedIndex === globalIdx ? 'action.selected' : undefined,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <ListItemText primary={obj.name} />
                          </ListItem>
                        )
                      })}
                    </>
                  )}
                  
                  {filteredObjects.length === 0 && (
                    <ListItem>
                      <ListItemText 
                        primary="No objects found" 
                        secondary="Type to search or ESC to close"
                      />
                    </ListItem>
                  )}
                </>
              ) : autocompleteMode === 'annotations' ? (
                // Annotations mode
                <>
                  {filteredAnnotations.length > 0 ? (
                    <>
                      <ListSubheader>Annotations</ListSubheader>
                      {filteredAnnotations.map((ann, idx) => (
                        <ListItem
                          key={ann.id}
                          onClick={() => insertReference(ann)}
                          sx={{
                            backgroundColor: selectedIndex === idx ? 'action.selected' : undefined,
                            cursor: 'pointer',
                            '&:hover': {
                              backgroundColor: 'action.hover',
                            }
                          }}
                        >
                          <ListItemText primary={ann.name} />
                        </ListItem>
                      ))}
                    </>
                  ) : (
                    <ListItem>
                      <ListItemText 
                        primary="No annotations found" 
                        secondary="Type to search or ESC to close"
                      />
                    </ListItem>
                  )}
                </>
              ) : null}
            </List>
          </Paper>
        </Popper>
      </ClickAwayListener>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Preview:
        </Typography>
        <Box sx={{ minHeight: 24 }}>
          {gloss.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No gloss definition yet.
            </Typography>
          ) : (
            renderGlossPreview()
          )}
        </Box>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Tip: Type # for types or @ for objects. References are wrapped in backticks (e.g., @`John Smith`). Use arrow keys to navigate suggestions.
      </Typography>
    </Box>
  )
}