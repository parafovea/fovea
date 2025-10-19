/**
 * Command definitions for all keyboard shortcuts and actions.
 * This file registers all commands with the command registry.
 *
 * Commands are organized by category:
 * - Global: Available everywhere
 * - Navigation: Workspace and page navigation
 * - File: Save, export, import
 * - Video: Playback controls
 * - Annotation: Annotation workspace actions
 * - Ontology: Ontology builder actions
 * - Object: Object builder actions
 */

import { Command } from './command-registry.js'

/**
 * Detect platform for modifier keys.
 */
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0

/**
 * Get the appropriate modifier key for the current platform.
 * Returns 'mod' which react-hotkeys-hook converts to Cmd on Mac, Ctrl elsewhere.
 */
export const getModifier = (): 'mod' => 'mod'

/**
 * Global commands available everywhere.
 */
export const globalCommands: Omit<Command, 'execute'>[] = [
  {
    id: 'navigate.videoBrowser',
    title: 'Go to Video Browser',
    category: 'navigation',
    keybinding: 'mod+1',
    description: 'Navigate to video browser page'
  },
  {
    id: 'navigate.ontologyBuilder',
    title: 'Go to Ontology Builder',
    category: 'navigation',
    keybinding: 'mod+2',
    description: 'Navigate to ontology builder workspace'
  },
  {
    id: 'navigate.objectBuilder',
    title: 'Go to Object Builder',
    category: 'navigation',
    keybinding: 'mod+3',
    description: 'Navigate to object builder workspace'
  },
  {
    id: 'navigate.settings',
    title: 'Go to Settings',
    category: 'navigation',
    keybinding: 'mod+comma',
    description: 'Navigate to settings page'
  },
  {
    id: 'navigate.toggle',
    title: 'Toggle Workspace',
    category: 'navigation',
    keybinding: 'mod+o',
    description: 'Toggle between annotation and current workspace'
  },
  {
    id: 'file.save',
    title: 'Save',
    category: 'file',
    keybinding: 'mod+s',
    description: 'Save current work'
  },
  {
    id: 'file.export',
    title: 'Export',
    category: 'file',
    keybinding: 'mod+e',
    description: 'Export data'
  },
  {
    id: 'help.show',
    title: 'Show Keyboard Shortcuts',
    category: 'global',
    keybinding: 'shift+/',
    description: 'Open keyboard shortcuts help dialog'
  },
  {
    id: 'commandPalette.toggle',
    title: 'Open Command Palette',
    category: 'global',
    keybinding: 'mod+shift+p',
    description: 'Open command palette (VS Code style)'
  },
  {
    id: 'dialog.close',
    title: 'Close Dialog',
    category: 'global',
    keybinding: 'escape',
    when: 'dialogOpen',
    description: 'Close current dialog or modal'
  }
]

/**
 * Video playback commands.
 */
export const videoCommands: Omit<Command, 'execute'>[] = [
  {
    id: 'video.playPause',
    title: 'Play/Pause Video',
    category: 'video',
    keybinding: 'space',
    when: 'annotationWorkspaceActive && !inputFocused && !dialogOpen',
    description: 'Toggle video playback'
  },
  {
    id: 'video.nextFrame',
    title: 'Next Frame',
    category: 'video',
    keybinding: 'right',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Advance 1 frame forward'
  },
  {
    id: 'video.previousFrame',
    title: 'Previous Frame',
    category: 'video',
    keybinding: 'left',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Go back 1 frame'
  },
  {
    id: 'video.nextFrame10',
    title: 'Jump 10 Frames Forward',
    category: 'video',
    keybinding: 'shift+right',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Advance 10 frames forward'
  },
  {
    id: 'video.previousFrame10',
    title: 'Jump 10 Frames Backward',
    category: 'video',
    keybinding: 'shift+left',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Go back 10 frames'
  },
  {
    id: 'video.nextKeyframe',
    title: 'Jump to Next Keyframe',
    category: 'video',
    keybinding: 'mod+right',
    when: 'annotationWorkspaceActive && !inputFocused && hasKeyframes',
    description: 'Jump to next keyframe in timeline'
  },
  {
    id: 'video.previousKeyframe',
    title: 'Jump to Previous Keyframe',
    category: 'video',
    keybinding: 'mod+left',
    when: 'annotationWorkspaceActive && !inputFocused && hasKeyframes',
    description: 'Jump to previous keyframe in timeline'
  },
  {
    id: 'video.jumpToStart',
    title: 'Jump to Start',
    category: 'video',
    keybinding: 'home',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Jump to frame 0'
  },
  {
    id: 'video.jumpToEnd',
    title: 'Jump to End',
    category: 'video',
    keybinding: 'end',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Jump to last frame'
  },
  {
    id: 'video.toggleMute',
    title: 'Toggle Mute',
    category: 'video',
    keybinding: 'm',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Mute/unmute video audio'
  },
  {
    id: 'video.toggleFullscreen',
    title: 'Toggle Fullscreen',
    category: 'video',
    keybinding: 'f',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Enter/exit fullscreen mode'
  }
]

/**
 * Annotation workspace commands.
 */
export const annotationCommands: Omit<Command, 'execute'>[] = [
  {
    id: 'timeline.toggle',
    title: 'Toggle Timeline',
    category: 'annotation',
    keybinding: 't',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Show/hide timeline view'
  },
  {
    id: 'annotation.addKeyframe',
    title: 'Add Keyframe',
    category: 'annotation',
    keybinding: 'k',
    when: 'annotationWorkspaceActive && !inputFocused && annotationSelected',
    description: 'Add keyframe at current frame'
  },
  {
    id: 'annotation.copyPreviousKeyframe',
    title: 'Copy Previous Keyframe',
    category: 'annotation',
    keybinding: 'c',
    when: 'annotationWorkspaceActive && !inputFocused && annotationSelected',
    description: 'Copy bounding box from previous keyframe to current frame'
  },
  {
    id: 'annotation.toggleVisibility',
    title: 'Toggle Visibility',
    category: 'annotation',
    keybinding: 'v',
    when: 'annotationWorkspaceActive && !inputFocused && annotationSelected',
    description: 'Toggle annotation visibility at current frame'
  },
  {
    id: 'annotation.deleteKeyframe',
    title: 'Delete Keyframe',
    category: 'annotation',
    keybinding: 'delete',
    when: 'annotationWorkspaceActive && !inputFocused && keyframeSelected',
    description: 'Remove keyframe at current frame'
  },
  {
    id: 'annotation.new',
    title: 'New Annotation',
    category: 'annotation',
    keybinding: 'n',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Start drawing new annotation'
  },
  {
    id: 'annotation.cancel',
    title: 'Cancel Drawing',
    category: 'annotation',
    keybinding: 'escape',
    when: 'annotationWorkspaceActive && drawingMode',
    description: 'Cancel current annotation drawing'
  },
  {
    id: 'annotation.confirm',
    title: 'Confirm Annotation',
    category: 'annotation',
    keybinding: 'enter',
    when: 'annotationWorkspaceActive && drawingMode',
    description: 'Confirm and save current annotation'
  },
  {
    id: 'annotation.delete',
    title: 'Delete Annotation',
    category: 'annotation',
    keybinding: 'delete',
    when: 'annotationWorkspaceActive && annotationSelected && !keyframeSelected',
    description: 'Delete selected annotation'
  },
  {
    id: 'annotation.next',
    title: 'Next Annotation',
    category: 'annotation',
    keybinding: 'tab',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Select next annotation'
  },
  {
    id: 'annotation.previous',
    title: 'Previous Annotation',
    category: 'annotation',
    keybinding: 'shift+tab',
    when: 'annotationWorkspaceActive && !inputFocused',
    description: 'Select previous annotation'
  },
  {
    id: 'timeline.zoomIn',
    title: 'Zoom In Timeline',
    category: 'annotation',
    keybinding: ['plus', 'equals'],
    when: 'annotationWorkspaceActive && timelineVisible',
    description: 'Zoom in timeline view'
  },
  {
    id: 'timeline.zoomOut',
    title: 'Zoom Out Timeline',
    category: 'annotation',
    keybinding: 'minus',
    when: 'annotationWorkspaceActive && timelineVisible',
    description: 'Zoom out timeline view'
  }
]

/**
 * Ontology builder commands.
 */
export const ontologyCommands: Omit<Command, 'execute'>[] = [
  {
    id: 'ontology.newType',
    title: 'New Type',
    category: 'ontology',
    keybinding: 'mod+n',
    when: 'ontologyWorkspaceActive && !inputFocused',
    description: 'Create new type (context-aware)'
  },
  {
    id: 'ontology.editType',
    title: 'Edit Type',
    category: 'ontology',
    keybinding: 'enter',
    when: 'ontologyWorkspaceActive && typeSelected && !inputFocused',
    description: 'Edit selected type'
  },
  {
    id: 'ontology.deleteType',
    title: 'Delete Type',
    category: 'ontology',
    keybinding: 'delete',
    when: 'ontologyWorkspaceActive && typeSelected && !inputFocused',
    description: 'Delete selected type'
  },
  {
    id: 'ontology.duplicateType',
    title: 'Duplicate Type',
    category: 'ontology',
    keybinding: 'mod+d',
    when: 'ontologyWorkspaceActive && typeSelected && !inputFocused',
    description: 'Duplicate selected type'
  },
  {
    id: 'ontology.search',
    title: 'Search Types',
    category: 'ontology',
    keybinding: 'mod+f',
    when: 'ontologyWorkspaceActive',
    description: 'Focus search field'
  },
  {
    id: 'ontology.suggestTypes',
    title: 'Suggest Types with AI',
    category: 'ontology',
    keybinding: 'mod+shift+s',
    when: 'ontologyWorkspaceActive && !inputFocused',
    description: 'Generate type suggestions using AI'
  },
  {
    id: 'ontology.nextTab',
    title: 'Next Tab',
    category: 'ontology',
    keybinding: 'tab',
    when: 'ontologyWorkspaceActive && !inputFocused',
    description: 'Switch to next type tab'
  },
  {
    id: 'ontology.previousTab',
    title: 'Previous Tab',
    category: 'ontology',
    keybinding: 'shift+tab',
    when: 'ontologyWorkspaceActive && !inputFocused',
    description: 'Switch to previous type tab'
  }
]

/**
 * Object builder commands.
 */
export const objectCommands: Omit<Command, 'execute'>[] = [
  {
    id: 'object.new',
    title: 'New Object',
    category: 'object',
    keybinding: 'mod+n',
    when: 'objectWorkspaceActive && !inputFocused',
    description: 'Create new object (context-aware)'
  },
  {
    id: 'object.edit',
    title: 'Edit Object',
    category: 'object',
    keybinding: 'enter',
    when: 'objectWorkspaceActive && objectSelected && !inputFocused',
    description: 'Edit selected object'
  },
  {
    id: 'object.delete',
    title: 'Delete Object',
    category: 'object',
    keybinding: 'delete',
    when: 'objectWorkspaceActive && objectSelected && !inputFocused',
    description: 'Delete selected object'
  },
  {
    id: 'object.duplicate',
    title: 'Duplicate Object',
    category: 'object',
    keybinding: 'mod+d',
    when: 'objectWorkspaceActive && objectSelected && !inputFocused',
    description: 'Duplicate selected object'
  },
  {
    id: 'object.search',
    title: 'Search Objects',
    category: 'object',
    keybinding: 'mod+f',
    when: 'objectWorkspaceActive',
    description: 'Focus search field'
  },
  {
    id: 'object.openCollectionBuilder',
    title: 'Open Collection Builder',
    category: 'object',
    keybinding: 'c',
    when: 'objectWorkspaceActive && !inputFocused',
    description: 'Open entity/event collection builder'
  },
  {
    id: 'object.openTimeBuilder',
    title: 'Open Time Builder',
    category: 'object',
    keybinding: 't',
    when: 'objectWorkspaceActive && !inputFocused',
    description: 'Open temporal object builder'
  },
  {
    id: 'object.nextTab',
    title: 'Next Tab',
    category: 'object',
    keybinding: 'tab',
    when: 'objectWorkspaceActive && !inputFocused',
    description: 'Switch to next object tab'
  },
  {
    id: 'object.previousTab',
    title: 'Previous Tab',
    category: 'object',
    keybinding: 'shift+tab',
    when: 'objectWorkspaceActive && !inputFocused',
    description: 'Switch to previous object tab'
  }
]

/**
 * All command definitions.
 */
export const allCommandDefinitions = [
  ...globalCommands,
  ...videoCommands,
  ...annotationCommands,
  ...ontologyCommands,
  ...objectCommands
]

/**
 * Format keybinding for display.
 *
 * @param keybinding Keybinding string from react-hotkeys-hook
 * @returns Formatted string for display
 *
 * @example
 * ```ts
 * formatKeybinding('mod+s')  // Returns "⌘S" on Mac, "Ctrl+S" elsewhere
 * formatKeybinding('shift+/') // Returns "⇧/"
 * ```
 */
export function formatKeybinding(keybinding: string): string {
  const parts = keybinding.split('+')

  const formatted = parts.map(part => {
    switch (part.toLowerCase()) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl'
      case 'shift':
        return isMac ? '⇧' : 'Shift'
      case 'alt':
        return isMac ? '⌥' : 'Alt'
      case 'ctrl':
        return 'Ctrl'
      case 'meta':
        return isMac ? '⌘' : 'Win'
      case 'space':
        return 'Space'
      case 'enter':
        return 'Enter'
      case 'escape':
        return 'Esc'
      case 'delete':
        return 'Del'
      case 'backspace':
        return 'Backspace'
      case 'tab':
        return 'Tab'
      case 'home':
        return 'Home'
      case 'end':
        return 'End'
      case 'pageup':
        return 'PgUp'
      case 'pagedown':
        return 'PgDn'
      case 'left':
        return '←'
      case 'right':
        return '→'
      case 'up':
        return '↑'
      case 'down':
        return '↓'
      case 'plus':
      case 'equals':
        return '+'
      case 'minus':
        return '-'
      case 'comma':
        return ','
      default:
        return part.toUpperCase()
    }
  })

  return formatted.join(isMac ? '' : '+')
}
