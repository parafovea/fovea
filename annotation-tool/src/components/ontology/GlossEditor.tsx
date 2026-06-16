import { useState, useRef, useEffect, KeyboardEvent, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { usePersonaOntology, useWorld, useAnnotations } from '@store/queries'
import { GlossItem, TimeInstant, getAnnotationTimeBounds, Claim } from '@models/types'

interface GlossEditorProps {
  gloss: GlossItem[]
  onChange: (gloss: GlossItem[]) => void
  availableTypes?: ('entity' | 'role' | 'event' | 'relation')[]
  personaId?: string | null
  disabled?: boolean
  videoId?: string | null  // For annotation references
  includeAnnotations?: boolean  // Whether to allow ^ references
  includeClaims?: boolean  // Whether to allow $ references
  claims?: Claim[]  // Available claims for $ references
  label?: string  // Optional label for the editor (defaults to 'Gloss Definition')
}

interface TypeOption {
  id: string
  name: string
  type: 'entity' | 'role' | 'event' | 'relation'
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

interface ClaimOption {
  id: string
  name: string
  type: 'claim'
}

export default function GlossEditor({
  gloss,
  onChange,
  availableTypes,
  personaId,
  disabled = false,
  videoId = null,
  includeAnnotations = false,
  includeClaims = false,
  claims = [],
  label = 'Gloss Definition'
}: GlossEditorProps) {
  // TanStack Query hooks for data fetching
  const { data: activeOntology } = usePersonaOntology(personaId)
  const { data: world } = useWorld()
  const entities = useMemo(() => world?.entities ?? [], [world?.entities])
  const events = useMemo(() => world?.events ?? [], [world?.events])
  const times = useMemo(() => world?.times ?? [], [world?.times])
  const { data: annotations = [] } = useAnnotations(videoId)

  const [inputValue, setInputValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [autocompleteMode, setAutocompleteMode] = useState<'types' | 'objects' | 'annotations' | 'claims'>('types')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const popperRef = useRef<HTMLDivElement>(null)
  // Tracks the gloss we most recently emitted via onChange. When the
  // `gloss` prop re-arrives via the parent's React-Query auto-save
  // re-render and structurally matches what we just sent up, we suppress
  // the re-sync into `inputValue` to avoid clobbering whatever the user
  // typed in the meantime. Without this guard, a fast typist (or
  // Playwright's keyboard simulation, which fires keystrokes faster than
  // the cache-invalidation cycle settles) loses characters because the
  // gloss-prop effect overwrites the local state with the round-tripped
  // serialization of the older parent value.
  const lastEmittedGlossRef = useRef<GlossItem[] | null>(null)
  const emitChange = useCallback((newGloss: GlossItem[]) => {
    lastEmittedGlossRef.current = newGloss
    onChange(newGloss)
  }, [onChange])
  const [cursorPosition, setCursorPosition] = useState(0)

  // Get all available types
  const allTypes: TypeOption[] = useMemo(() => [
    ...((!availableTypes || availableTypes.includes('entity')) ?
      (activeOntology?.entities.map(e => ({ id: e.id, name: e.name, type: 'entity' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('role')) ?
      (activeOntology?.roles.map(r => ({ id: r.id, name: r.name, type: 'role' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('event')) ?
      (activeOntology?.events.map(e => ({ id: e.id, name: e.name, type: 'event' as const, personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('relation')) ?
      (activeOntology?.relationTypes.map(r => ({ id: r.id, name: r.name, type: 'relation' as const, personaId })) || []) : []),
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
      name: `Time: ${t.type === 'instant' ? (t as TimeInstant).timestamp || 'instant' : 'interval'}`,
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

    // Add time info to distinguish annotations (derived from keyframes)
    const bounds = getAnnotationTimeBounds(ann)
    const timeStr = bounds ? `@${bounds.startTime.toFixed(1)}s` : ''

    return {
      id: ann.id,
      name: `${name}${timeStr}`,
      type: 'annotation' as const
    }
  }) : [], [includeAnnotations, annotations, entities, events, allTypes])

  // Resolve a claim's gloss to plain text for display
  const resolveClaimText = useCallback((claim: { gloss: GlossItem[] }): string => {
    return claim.gloss
      .map(item => {
        if (item.type === 'text') return item.content
        if (item.type === 'typeRef') {
          const t = allTypes.find(t => t.id === item.content)
          return t ? t.name : item.content
        }
        if (item.type === 'objectRef') {
          const o = allObjects.find(o => o.id === item.content)
          return o ? o.name : item.content
        }
        if (item.type === 'claimRef') {
          const ref = claims.find(c => c.id === item.content)
          if (ref) {
            // Resolve one level deep, reusing type/object resolution
            return ref.gloss
              .map(g => {
                if (g.type === 'text') return g.content
                if (g.type === 'typeRef') {
                  const t = allTypes.find(t => t.id === g.content)
                  return t ? t.name : g.content
                }
                if (g.type === 'objectRef') {
                  const o = allObjects.find(o => o.id === g.content)
                  return o ? o.name : g.content
                }
                return g.content
              })
              .join('')
              .slice(0, 40)
          }
          return item.content
        }
        return item.content
      })
      .join('')
      .slice(0, 80)
  }, [allTypes, allObjects, claims])

  // Get all available claims (if enabled)
  const allClaims: ClaimOption[] = useMemo(() => includeClaims ? claims.map(claim => ({
    id: claim.id,
    name: resolveClaimText(claim) || 'Claim',
    type: 'claim' as const
  })) : [], [includeClaims, claims, resolveClaimText])

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

  // Filter claims based on search query
  const filteredClaims = searchQuery
    ? allClaims.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allClaims

  // Group filtered types by type
  const groupedTypes = {
    entity: filteredTypes.filter(t => t.type === 'entity'),
    role: filteredTypes.filter(t => t.type === 'role'),
    event: filteredTypes.filter(t => t.type === 'event'),
    relation: filteredTypes.filter(t => t.type === 'relation'),
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
      } else if (item.type === 'claimRef') {
        const claim = allClaims.find(c => c.id === item.content)
        return claim ? `$\`${claim.name}\`` : `$[${item.content}]`
      }
      return ''
    }).join('')
  }, [allTypes, allObjects, allAnnotations, allClaims])

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
      } else if (text[i] === '$' && includeClaims) {
        // Handle claim reference
        if (currentText) {
          items.push({ type: 'text', content: currentText })
          currentText = ''
        }

        // Check if it's a backtick-delimited reference
        if (text[i + 1] === '`') {
          const endBacktick = text.indexOf('`', i + 2)
          if (endBacktick !== -1) {
            const claimName = text.slice(i + 2, endBacktick)
            const claim = allClaims.find(c => c.name === claimName)

            if (claim) {
              items.push({
                type: 'claimRef',
                content: claim.id,
                refType: 'claim'
              })
              i = endBacktick + 1
            } else {
              // No match, treat as text
              currentText += text.slice(i, endBacktick + 1)
              i = endBacktick + 1
            }
          } else {
            // No closing backtick, treat as text
            currentText += '$`'
            i += 2
          }
        } else {
          // No backtick, treat as text
          currentText += '$'
          i++
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

  // Initialize input value from gloss. Skip the re-sync when the
  // incoming gloss is the same payload we just emitted via onChange —
  // the parent's React Query auto-save fans out a re-render carrying
  // back the gloss we sent up, and re-stringifying it here would clobber
  // any keystrokes the user has typed in the interval between our
  // emitChange call and the parent's settle.
  useEffect(() => {
    if (lastEmittedGlossRef.current && JSON.stringify(gloss) === JSON.stringify(lastEmittedGlossRef.current)) {
      return
    }
    setInputValue(glossToString(gloss))
  }, [gloss, glossToString])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setInputValue(value)
    setCursorPosition(cursorPos)

    // Check if #, @, or ^ was typed
    const lastChar = value[cursorPos - 1]
    if (lastChar === '#') {
      setShowAutocomplete(true)
      setAutocompleteMode('types')

      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastChar === '@') {
      setShowAutocomplete(true)
      setAutocompleteMode('objects')

      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastChar === '^' && includeAnnotations) {
      setShowAutocomplete(true)
      setAutocompleteMode('annotations')

      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastChar === '$' && includeClaims) {
      setShowAutocomplete(true)
      setAutocompleteMode('claims')

      setSearchQuery('')
      setSelectedIndex(0)
    } else if (showAutocomplete) {
      // Update search query if autocomplete is open
      const charMap = { types: '#', objects: '@', annotations: '^', claims: '$' }
      const char = charMap[autocompleteMode]
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
    emitChange(newGloss)
  }

  const insertReference = (item: TypeOption | ObjectOption | AnnotationOption | ClaimOption) => {
    const charMap = { types: '#', objects: '@', annotations: '^', claims: '$' }
    const char = charMap[autocompleteMode]
    const beforeChar = inputValue.lastIndexOf(char, cursorPosition - 1)
    const beforeText = inputValue.slice(0, beforeChar)
    const afterText = inputValue.slice(cursorPosition)

    const newValue = `${beforeText}${char}\`${item.name}\` ${afterText}`
    setInputValue(newValue)

    const newGloss = stringToGloss(newValue)
    emitChange(newGloss)

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete) return

    const allFilteredItems = autocompleteMode === 'types'
      ? [...groupedTypes.entity, ...groupedTypes.role, ...groupedTypes.event, ...groupedTypes.relation]
      : autocompleteMode === 'objects'
      ? [...groupedObjects.entities, ...groupedObjects.locations, ...groupedObjects.events, ...groupedObjects.times]
      : autocompleteMode === 'claims'
      ? filteredClaims
      : filteredAnnotations

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % allFilteredItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + allFilteredItems.length) % allFilteredItems.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (allFilteredItems[selectedIndex]) {
        insertReference(allFilteredItems[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false)
      setSearchQuery('')
    }
  }

  // Close autocomplete on click outside. In demo mode the tour engine
  // drives the workspace from a fixed StepCard overlay and a full-
  // screen SpotlightOverlay backdrop; either of those receiving a
  // mousedown would close the popup on the engine's own Next press
  // and unmount the gloss-autocomplete-popup anchor the next step
  // depends on. The popup's only legitimate dismissal paths in demo
  // mode are Escape and clicking inside the textarea itself, which
  // GlossEditor's onKeyDown / focus handlers already cover; the
  // document-level mousedown close is wholesale suppressed for
  // VITE_DEMO_PUBLIC=1.
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_PUBLIC === '1') return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (
        popperRef.current &&
        !popperRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Render gloss preview
  const renderGlossPreview = () => {
    const getBadgeStyle = (type: string) => {
      switch (type) {
        case 'typeRef':       return { variant: 'outline' as const, className: 'text-primary border-primary italic' }
        case 'objectRef':     return { variant: 'secondary' as const, className: '' }
        case 'annotationRef': return { variant: 'outline' as const, className: 'text-orange-600 border-orange-600' }
        case 'claimRef':      return { variant: 'outline' as const, className: 'text-blue-600 border-blue-600' }
        default:              return { variant: 'outline' as const, className: '' }
      }
    }

    return gloss.map((item, index) => {
      if (item.type === 'text') {
        const content = item.content.replace(/ /g, '\u00A0')
        return <span key={index}>{content}</span>
      }

      let displayName = item.content
      if (item.type === 'typeRef') {
        const typeObj = allTypes.find(t => t.id === item.content)
        if (typeObj) displayName = typeObj.name
      } else if (item.type === 'objectRef') {
        const obj = allObjects.find(o => o.id === item.content)
        if (obj) displayName = obj.name
      } else if (item.type === 'claimRef') {
        const claim = allClaims.find(c => c.id === item.content)
        if (claim) displayName = claim.name
      }

      const badgeProps = getBadgeStyle(item.type)
      return (
        <Badge
          key={index}
          variant={badgeProps.variant}
          className={cn('mx-1 align-middle', badgeProps.className)}
        >
          {displayName}
        </Badge>
      )
    })
  }

  const renderAutocompleteList = (
    items: Array<TypeOption | ObjectOption | AnnotationOption | ClaimOption>,
    sectionLabel: string,
    startIndex: number
  ) => {
    if (items.length === 0) return null
    return (
      <>
        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">{sectionLabel}</div>
        {items.map((item, idx) => {
          const globalIdx = startIndex + idx
          return (
            <div
              key={item.id}
              onClick={() => insertReference(item)}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer hover:bg-accent',
                selectedIndex === globalIdx && 'bg-accent'
              )}
            >
              {item.name}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div data-tour-id="gloss-editor">
      <Label className="mb-2">{label}</Label>
      <div className="relative">
        <Textarea
          ref={inputRef}
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={includeAnnotations
            ? "Type your gloss definition. Use #`name` for types, @`name` for objects, and ^`name` for annotations."
            : "Type your gloss definition. Use #`name` for types and @`name` for objects."}
          className="mb-4 min-h-20"
          aria-label={label}
        />

        {showAutocomplete && (
          <div
            ref={popperRef}
            data-tour-id="gloss-autocomplete-popup"
            className="absolute z-50 max-h-72 overflow-auto min-w-[250px] rounded-lg border bg-popover text-popover-foreground shadow-md"
            style={{ top: '100%', left: 0 }}
          >
            {autocompleteMode === 'types' ? (
              <>
                {renderAutocompleteList(groupedTypes.entity, 'Entity Types', 0)}
                {renderAutocompleteList(groupedTypes.role, 'Role Types', groupedTypes.entity.length)}
                {renderAutocompleteList(groupedTypes.event, 'Event Types', groupedTypes.entity.length + groupedTypes.role.length)}
                {renderAutocompleteList(groupedTypes.relation, 'Relation Types', groupedTypes.entity.length + groupedTypes.role.length + groupedTypes.event.length)}
                {filteredTypes.length === 0 && (
                  <div className="px-3 py-2">
                    <p className="text-sm">No types found</p>
                    <p className="text-xs text-muted-foreground">Type to search or ESC to close</p>
                  </div>
                )}
              </>
            ) : autocompleteMode === 'objects' ? (
              <>
                {renderAutocompleteList(groupedObjects.entities, 'Entities', 0)}
                {renderAutocompleteList(groupedObjects.locations, 'Locations', groupedObjects.entities.length)}
                {renderAutocompleteList(groupedObjects.events, 'Events', groupedObjects.entities.length + groupedObjects.locations.length)}
                {renderAutocompleteList(groupedObjects.times, 'Times', groupedObjects.entities.length + groupedObjects.locations.length + groupedObjects.events.length)}
                {filteredObjects.length === 0 && (
                  <div className="px-3 py-2">
                    <p className="text-sm">No objects found</p>
                    <p className="text-xs text-muted-foreground">Type to search or ESC to close</p>
                  </div>
                )}
              </>
            ) : autocompleteMode === 'annotations' ? (
              <>
                {filteredAnnotations.length > 0 ? (
                  renderAutocompleteList(filteredAnnotations, 'Annotations', 0)
                ) : (
                  <div className="px-3 py-2">
                    <p className="text-sm">No annotations found</p>
                    <p className="text-xs text-muted-foreground">Type to search or ESC to close</p>
                  </div>
                )}
              </>
            ) : autocompleteMode === 'claims' ? (
              <>
                {filteredClaims.length > 0 ? (
                  renderAutocompleteList(filteredClaims, 'Claims', 0)
                ) : (
                  <div className="px-3 py-2">
                    <p className="text-sm">No claims found</p>
                    <p className="text-xs text-muted-foreground">Type to search or ESC to close</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4" data-tour-id="gloss-preview">
        <p className="text-xs text-muted-foreground mb-1">
          Preview:
        </p>
        <div className="min-h-6">
          {gloss.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No gloss definition yet.
            </p>
          ) : (
            renderGlossPreview()
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Tip: Type # for types, @ for objects{includeClaims ? ', $ for claims' : ''}. References are wrapped in backticks (e.g., @`John Smith`). Use arrow keys to navigate suggestions.
      </p>
    </div>
  )
}
