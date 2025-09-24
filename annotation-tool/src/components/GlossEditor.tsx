import { useState, useRef, useEffect, KeyboardEvent } from 'react'
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
import { GlossItem } from '../models/types'

interface GlossEditorProps {
  gloss: GlossItem[]
  onChange: (gloss: GlossItem[]) => void
  availableTypes?: ('entity' | 'role' | 'event' | 'relation')[]
  personaId?: string | null
}

interface TypeOption {
  id: string
  name: string
  type: 'entity' | 'role' | 'event'
  personaId?: string | null
}

export default function GlossEditor({ gloss, onChange, availableTypes, personaId }: GlossEditorProps) {
  const { personaOntologies } = useSelector((state: RootState) => state.persona)
  const activeOntology = personaOntologies.find(o => o.personaId === personaId)
  
  const [inputValue, setInputValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteAnchor, setAutocompleteAnchor] = useState<null | HTMLElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [cursorPosition, setCursorPosition] = useState(0)

  // Get all available types (excluding relations as per requirement)
  const allTypes: TypeOption[] = [
    ...((!availableTypes || availableTypes.includes('entity')) ? 
      (activeOntology?.entities.map(e => ({ id: e.id, name: e.name, type: 'entity' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('role')) ? 
      (activeOntology?.roles.map(r => ({ id: r.id, name: r.name, type: 'role' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('event')) ? 
      (activeOntology?.events.map(e => ({ id: e.id, name: e.name, type: 'event' as const, personaId })) || []) : []),
  ]

  // Filter types based on search query
  const filteredTypes = searchQuery 
    ? allTypes.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allTypes

  // Group filtered types by type
  const groupedTypes = {
    entity: filteredTypes.filter(t => t.type === 'entity'),
    role: filteredTypes.filter(t => t.type === 'role'),
    event: filteredTypes.filter(t => t.type === 'event'),
  }

  // Convert gloss items to display string
  const glossToString = (glossItems: GlossItem[]): string => {
    return glossItems.map(item => {
      if (item.type === 'text') {
        return item.content
      } else {
        const typeObj = allTypes.find(t => t.id === item.content)
        return typeObj ? `@${typeObj.name}` : `@[${item.content}]`
      }
    }).join('')
  }

  // Parse string to gloss items
  const stringToGloss = (text: string): GlossItem[] => {
    const items: GlossItem[] = []
    let currentText = ''
    let i = 0
    
    while (i < text.length) {
      if (text[i] === '@') {
        // Save any accumulated text
        if (currentText) {
          items.push({ type: 'text', content: currentText })
          currentText = ''
        }
        
        // Find the end of the type reference
        let j = i + 1
        while (j < text.length && text[j] !== ' ' && text[j] !== '@') {
          j++
        }
        
        const typeName = text.slice(i + 1, j)
        const typeObj = allTypes.find(t => t.name === typeName)
        
        if (typeObj) {
          items.push({
            type: 'typeRef',
            content: typeObj.id,
            refType: typeObj.type,
            refPersonaId: typeObj.personaId
          })
        } else {
          // If type not found, treat as text
          currentText += text.slice(i, j)
        }
        
        i = j
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
  }, [gloss, allTypes]) // Re-run when gloss or available types change

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setInputValue(value)
    setCursorPosition(cursorPos)
    
    // Check if @ was typed
    const lastChar = value[cursorPos - 1]
    if (lastChar === '@') {
      setShowAutocomplete(true)
      setAutocompleteAnchor(e.target)
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (showAutocomplete) {
      // Update search query if autocomplete is open
      const atIndex = value.lastIndexOf('@', cursorPos - 1)
      if (atIndex !== -1) {
        const query = value.slice(atIndex + 1, cursorPos)
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

  const insertTypeReference = (typeObj: TypeOption) => {
    const beforeAt = inputValue.lastIndexOf('@', cursorPosition - 1)
    const beforeText = inputValue.slice(0, beforeAt)
    const afterText = inputValue.slice(cursorPosition)
    
    const newValue = `${beforeText}@${typeObj.name} ${afterText}`
    setInputValue(newValue)
    
    const newGloss = stringToGloss(newValue)
    onChange(newGloss)
    
    setShowAutocomplete(false)
    setSearchQuery('')
    
    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const newPos = beforeText.length + typeObj.name.length + 2
        inputRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete) return
    
    const allFilteredTypes = [...groupedTypes.entity, ...groupedTypes.role, ...groupedTypes.event]
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % allFilteredTypes.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + allFilteredTypes.length) % allFilteredTypes.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allFilteredTypes[selectedIndex]) {
        insertTypeReference(allFilteredTypes[selectedIndex])
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
        return <span key={index}>{item.content}</span>
      } else {
        const typeObj = allTypes.find(t => t.id === item.content)
        const displayName = typeObj ? typeObj.name : item.content
        return (
          <Chip
            key={index}
            label={`${item.refType}: ${displayName}`}
            size="small"
            color="primary"
            sx={{ mx: 0.5, verticalAlign: 'middle' }}
          />
        )
      }
    })
  }

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Gloss Definition
      </Typography>
      
      <TextField
        inputRef={inputRef}
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your gloss definition. Use @ to reference entities, roles, or events."
        variant="outlined"
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
              {groupedTypes.entity.length > 0 && (
                <>
                  <ListSubheader>Entities</ListSubheader>
                  {groupedTypes.entity.map((type, idx) => {
                    const globalIdx = idx
                    return (
                      <ListItem
                        key={type.id}
                        onClick={() => insertTypeReference(type)}
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
                  <ListSubheader>Roles</ListSubheader>
                  {groupedTypes.role.map((type, idx) => {
                    const globalIdx = groupedTypes.entity.length + idx
                    return (
                      <ListItem
                        key={type.id}
                        onClick={() => insertTypeReference(type)}
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
                  <ListSubheader>Events</ListSubheader>
                  {groupedTypes.event.map((type, idx) => {
                    const globalIdx = groupedTypes.entity.length + groupedTypes.role.length + idx
                    return (
                      <ListItem
                        key={type.id}
                        onClick={() => insertTypeReference(type)}
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
        Tip: Type @ to insert references to entities, roles, or events. Use arrow keys to navigate suggestions.
      </Typography>
    </Box>
  )
}