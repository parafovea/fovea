import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatShortcut,
  matchesShortcut,
  getShortcutsForContext,
  annotationWorkspaceShortcuts,
  ShortcutSequenceTracker,
  type ShortcutDefinition
} from './shortcuts'

describe('shortcuts utility', () => {
  describe('formatShortcut', () => {
    it('should format simple key shortcut', () => {
      const shortcut: ShortcutDefinition = {
        key: 't',
        modifiers: [],
        action: 'timeline.toggle',
        description: 'Toggle timeline',
        context: 'annotationWorkspace'
      }

      const result = formatShortcut(shortcut)
      expect(result).toBe('T')
    })

    it('should format shortcut with modifiers', () => {
      const shortcut: ShortcutDefinition = {
        key: 's',
        modifiers: ['cmd'],
        action: 'file.save',
        description: 'Save',
        context: 'global'
      }

      const result = formatShortcut(shortcut)
      // Result depends on OS, should include modifier
      expect(result).toMatch(/[⌘Ctrl]\+S/)
    })

    it('should format sequence shortcuts', () => {
      const shortcut: ShortcutDefinition = {
        key: 'g',
        modifiers: [],
        sequence: ['g', 'p'],
        action: 'navigate.personaBrowser',
        description: 'Go to persona browser',
        context: 'ontologyWorkspace'
      }

      const result = formatShortcut(shortcut)
      expect(result).toBe('G then P')
    })
  })

  describe('matchesShortcut', () => {
    it('should match simple key press', () => {
      const shortcut: ShortcutDefinition = {
        key: 't',
        modifiers: [],
        action: 'timeline.toggle',
        description: 'Toggle timeline',
        context: 'annotationWorkspace'
      }

      const event = new KeyboardEvent('keydown', { key: 't' })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('should not match different key', () => {
      const shortcut: ShortcutDefinition = {
        key: 't',
        modifiers: [],
        action: 'timeline.toggle',
        description: 'Toggle timeline',
        context: 'annotationWorkspace'
      }

      const event = new KeyboardEvent('keydown', { key: 'x' })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })

    it('should match key with modifiers', () => {
      const shortcut: ShortcutDefinition = {
        key: 's',
        modifiers: ['shift'],
        action: 'file.saveAs',
        description: 'Save As',
        context: 'global'
      }

      const event = new KeyboardEvent('keydown', { key: 's', shiftKey: true })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('should not match if modifier missing', () => {
      const shortcut: ShortcutDefinition = {
        key: 's',
        modifiers: ['shift'],
        action: 'file.saveAs',
        description: 'Save As',
        context: 'global'
      }

      const event = new KeyboardEvent('keydown', { key: 's', shiftKey: false })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })

    it('should be case-insensitive', () => {
      const shortcut: ShortcutDefinition = {
        key: 't',
        modifiers: [],
        action: 'timeline.toggle',
        description: 'Toggle timeline',
        context: 'annotationWorkspace'
      }

      const event = new KeyboardEvent('keydown', { key: 'T' })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('should not match sequence shortcuts directly', () => {
      const shortcut: ShortcutDefinition = {
        key: 'g',
        modifiers: [],
        sequence: ['g', 'p'],
        action: 'navigate.personaBrowser',
        description: 'Go to persona browser',
        context: 'ontologyWorkspace'
      }

      const event = new KeyboardEvent('keydown', { key: 'g' })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })
  })

  describe('getShortcutsForContext', () => {
    it('should return global and context-specific shortcuts', () => {
      const shortcuts = getShortcutsForContext('annotationWorkspace')

      // Should include global shortcuts like '?'
      expect(shortcuts.some(s => s.key === '?' && s.context === 'global')).toBe(true)

      // Should include annotation workspace shortcuts
      expect(shortcuts.some(s => s.key === 't' && s.context === 'annotationWorkspace')).toBe(true)
    })

    it('should not return shortcuts from other contexts', () => {
      const shortcuts = getShortcutsForContext('annotationWorkspace')

      // Should not include ontology workspace specific shortcuts
      expect(shortcuts.some(s => s.context === 'ontologyWorkspace' && s.context !== 'global')).toBe(false)
    })
  })

  describe('annotationWorkspaceShortcuts', () => {
    it('should include timeline toggle shortcut', () => {
      const timelineToggle = annotationWorkspaceShortcuts.find(s => s.action === 'timeline.toggle')

      expect(timelineToggle).toBeDefined()
      expect(timelineToggle?.key).toBe('t')
      expect(timelineToggle?.modifiers).toEqual([])
      expect(timelineToggle?.description).toBe('Toggle timeline view')
    })

    it('should include video playback shortcuts', () => {
      const playPause = annotationWorkspaceShortcuts.find(s => s.action === 'video.playPause')
      const prevFrame = annotationWorkspaceShortcuts.find(s => s.action === 'video.previousFrame')
      const nextFrame = annotationWorkspaceShortcuts.find(s => s.action === 'video.nextFrame')

      expect(playPause).toBeDefined()
      expect(playPause?.key).toBe(' ')

      expect(prevFrame).toBeDefined()
      expect(prevFrame?.key).toBe('ArrowLeft')

      expect(nextFrame).toBeDefined()
      expect(nextFrame?.key).toBe('ArrowRight')
    })

    it('should have all shortcuts with annotationWorkspace context', () => {
      annotationWorkspaceShortcuts.forEach(shortcut => {
        expect(shortcut.context).toBe('annotationWorkspace')
      })
    })
  })

  describe('ShortcutSequenceTracker', () => {
    let tracker: ShortcutSequenceTracker

    beforeEach(() => {
      tracker = new ShortcutSequenceTracker()
    })

    it('should track key sequence', () => {
      const sequence1 = tracker.addKey('g')
      expect(sequence1).toEqual(['g'])

      const sequence2 = tracker.addKey('p')
      expect(sequence2).toEqual(['g', 'p'])
    })

    it('should match complete sequence', () => {
      tracker.addKey('g')
      tracker.addKey('p')

      expect(tracker.matchesSequence(['g', 'p'])).toBe(true)
    })

    it('should not match incomplete sequence', () => {
      tracker.addKey('g')

      expect(tracker.matchesSequence(['g', 'p'])).toBe(false)
    })

    it('should not match wrong sequence', () => {
      tracker.addKey('g')
      tracker.addKey('x')

      expect(tracker.matchesSequence(['g', 'p'])).toBe(false)
    })

    it('should reset sequence', () => {
      tracker.addKey('g')
      tracker.addKey('p')

      tracker.reset()

      expect(tracker.matchesSequence(['g', 'p'])).toBe(false)
    })

    it('should be case-insensitive', () => {
      tracker.addKey('G')
      tracker.addKey('P')

      expect(tracker.matchesSequence(['g', 'p'])).toBe(true)
    })
  })
})
