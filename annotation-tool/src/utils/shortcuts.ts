// Keyboard shortcut definitions and utilities

export type ModifierKey = 'cmd' | 'ctrl' | 'alt' | 'shift'
export type ShortcutContext = 'global' | 'workspace' | 'dialog' | 'videoBrowser' | 'ontologyWorkspace' | 'objectWorkspace' | 'settings'

export interface ShortcutDefinition {
  key: string
  modifiers: ModifierKey[]
  action: string // Action identifier
  description: string
  context: ShortcutContext | ShortcutContext[]
  enabled?: boolean
  sequence?: string[] // For multi-key shortcuts like "g p"
}

// Get the appropriate modifier key for the current OS
export const getOSModifier = (): 'cmd' | 'ctrl' => {
  const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  return isMac ? 'cmd' : 'ctrl'
}

// Format shortcut for display
export const formatShortcut = (shortcut: ShortcutDefinition): string => {
  const osModifier = getOSModifier()
  const modifiers = shortcut.modifiers.map(mod => {
    if (mod === 'cmd' || mod === 'ctrl') {
      return osModifier === 'cmd' ? '⌘' : 'Ctrl'
    }
    if (mod === 'alt') return navigator.userAgent.toUpperCase().indexOf('MAC') >= 0 ? '⌥' : 'Alt'
    if (mod === 'shift') return '⇧'
    return mod
  })
  
  if (shortcut.sequence) {
    return shortcut.sequence.map(k => k.toUpperCase()).join(' then ')
  }
  
  return [...modifiers, shortcut.key.toUpperCase()].join('+')
}

// Check if a keyboard event matches a shortcut definition
export const matchesShortcut = (
  event: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean => {
  // Handle sequence shortcuts separately
  if (shortcut.sequence) {
    return false // Will be handled by sequence tracker
  }
  
  // Check key
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false
  }
  
  // Check modifiers
  const osModifier = getOSModifier()
  for (const modifier of shortcut.modifiers) {
    if (modifier === 'cmd' && osModifier === 'cmd' && !event.metaKey) return false
    if (modifier === 'ctrl' && osModifier === 'ctrl' && !event.ctrlKey) return false
    if (modifier === 'ctrl' && osModifier === 'cmd' && !event.ctrlKey) return false // Explicit ctrl on Mac
    if (modifier === 'alt' && !event.altKey) return false
    if (modifier === 'shift' && !event.shiftKey) return false
  }
  
  return true
}

// Global shortcuts available everywhere
export const globalShortcuts: ShortcutDefinition[] = [
  {
    key: '1',
    modifiers: [getOSModifier()],
    action: 'navigate.videoBrowser',
    description: 'Go to Video Browser',
    context: 'global',
  },
  {
    key: '2',
    modifiers: [getOSModifier()],
    action: 'navigate.ontologyBuilder',
    description: 'Go to Ontology Builder',
    context: 'global',
  },
  {
    key: '3',
    modifiers: [getOSModifier()],
    action: 'navigate.objectBuilder',
    description: 'Go to Object Builder',
    context: 'global',
  },
  {
    key: ',',
    modifiers: [getOSModifier()],
    action: 'navigate.settings',
    description: 'Go to Settings',
    context: 'global',
  },
  {
    key: 'o',
    modifiers: [getOSModifier()],
    action: 'navigate.toggle',
    description: 'Toggle between annotation and current workspace',
    context: 'global',
  },
  {
    key: 's',
    modifiers: [getOSModifier()],
    action: 'file.save',
    description: 'Save',
    context: 'global',
  },
  {
    key: 'e',
    modifiers: [getOSModifier()],
    action: 'file.export',
    description: 'Export',
    context: 'global',
  },
  {
    key: '?',
    modifiers: [],
    action: 'help.show',
    description: 'Show keyboard shortcuts',
    context: 'global',
  },
  {
    key: 'Escape',
    modifiers: [],
    action: 'dialog.close',
    description: 'Close current dialog',
    context: 'dialog',
  },
]

// Video Browser shortcuts
export const videoBrowserShortcuts: ShortcutDefinition[] = [
  {
    key: '/',
    modifiers: [],
    action: 'search.focus',
    description: 'Focus search',
    context: 'videoBrowser',
  },
  {
    key: 'Enter',
    modifiers: [],
    action: 'video.open',
    description: 'Open annotation workspace',
    context: 'videoBrowser',
  },
  {
    key: ' ',
    modifiers: [],
    action: 'video.preview',
    description: 'Preview video',
    context: 'videoBrowser',
  },
  {
    key: 'ArrowLeft',
    modifiers: [],
    action: 'navigate.left',
    description: 'Navigate left',
    context: 'videoBrowser',
  },
  {
    key: 'ArrowRight',
    modifiers: [],
    action: 'navigate.right',
    description: 'Navigate right',
    context: 'videoBrowser',
  },
  {
    key: 'ArrowUp',
    modifiers: [],
    action: 'navigate.up',
    description: 'Navigate up',
    context: 'videoBrowser',
  },
  {
    key: 'ArrowDown',
    modifiers: [],
    action: 'navigate.down',
    description: 'Navigate down',
    context: 'videoBrowser',
  },
]

// Ontology Workspace shortcuts
export const ontologyWorkspaceShortcuts: ShortcutDefinition[] = [
  {
    key: 'n',
    modifiers: [getOSModifier()],
    action: 'type.new',
    description: 'New type (context-aware)',
    context: 'ontologyWorkspace',
  },
  {
    key: 'Tab',
    modifiers: [],
    action: 'tab.next',
    description: 'Next tab',
    context: 'ontologyWorkspace',
  },
  {
    key: 'Tab',
    modifiers: ['shift'],
    action: 'tab.previous',
    description: 'Previous tab',
    context: 'ontologyWorkspace',
  },
  {
    key: 'Enter',
    modifiers: [],
    action: 'item.edit',
    description: 'Edit selected item',
    context: 'ontologyWorkspace',
  },
  {
    key: 'Delete',
    modifiers: [],
    action: 'item.delete',
    description: 'Delete selected item',
    context: 'ontologyWorkspace',
  },
  {
    key: 'd',
    modifiers: [getOSModifier()],
    action: 'type.duplicate',
    description: 'Duplicate selected type',
    context: 'ontologyWorkspace',
  },
  {
    key: '/',
    modifiers: [],
    action: 'search.focus',
    description: 'Focus search',
    context: 'ontologyWorkspace',
  },
  {
    key: 'g',
    modifiers: [],
    sequence: ['g', 'p'],
    action: 'navigate.personaBrowser',
    description: 'Go to persona browser',
    context: 'ontologyWorkspace',
  },
  {
    key: 's',
    modifiers: [getOSModifier(), 'shift'],
    action: 'ontology.suggestTypes',
    description: 'Suggest types with AI',
    context: 'ontologyWorkspace',
  },
]

// Object Workspace shortcuts
export const objectWorkspaceShortcuts: ShortcutDefinition[] = [
  {
    key: 'n',
    modifiers: [getOSModifier()],
    action: 'object.new',
    description: 'New object (context-aware)',
    context: 'objectWorkspace',
  },
  {
    key: 'Tab',
    modifiers: [],
    action: 'tab.next',
    description: 'Next tab',
    context: 'objectWorkspace',
  },
  {
    key: 'Tab',
    modifiers: ['shift'],
    action: 'tab.previous',
    description: 'Previous tab',
    context: 'objectWorkspace',
  },
  {
    key: 'Enter',
    modifiers: [],
    action: 'item.edit',
    description: 'Edit selected item',
    context: 'objectWorkspace',
  },
  {
    key: 'Delete',
    modifiers: [],
    action: 'item.delete',
    description: 'Delete selected item',
    context: 'objectWorkspace',
  },
  {
    key: 'd',
    modifiers: [getOSModifier()],
    action: 'object.duplicate',
    description: 'Duplicate selected object',
    context: 'objectWorkspace',
  },
  {
    key: '/',
    modifiers: [],
    action: 'search.focus',
    description: 'Focus search',
    context: 'objectWorkspace',
  },
  {
    key: 'c',
    modifiers: [],
    action: 'collection.open',
    description: 'Open collection builder',
    context: 'objectWorkspace',
  },
  {
    key: 't',
    modifiers: [],
    action: 'time.open',
    description: 'Open time builder',
    context: 'objectWorkspace',
  },
]

// Get all shortcuts for a given context
export const getShortcutsForContext = (
  context: ShortcutContext
): ShortcutDefinition[] => {
  const allShortcuts = [
    ...globalShortcuts,
    ...videoBrowserShortcuts,
    ...ontologyWorkspaceShortcuts,
    ...objectWorkspaceShortcuts,
  ]
  
  return allShortcuts.filter(shortcut => {
    if (Array.isArray(shortcut.context)) {
      return shortcut.context.includes(context) || shortcut.context.includes('global')
    }
    return shortcut.context === context || shortcut.context === 'global'
  })
}

// Sequence tracking for multi-key shortcuts
export class ShortcutSequenceTracker {
  private sequence: string[] = []
  private timer: number | null = null
  private readonly timeout = 1000 // Reset after 1 second
  
  addKey(key: string): string[] {
    this.sequence.push(key.toLowerCase())
    
    // Reset timer
    if (this.timer) clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.reset(), this.timeout)
    
    return [...this.sequence]
  }
  
  reset(): void {
    this.sequence = []
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }
  
  matchesSequence(sequence: string[]): boolean {
    if (this.sequence.length !== sequence.length) return false
    return this.sequence.every((key, i) => key === sequence[i].toLowerCase())
  }
}