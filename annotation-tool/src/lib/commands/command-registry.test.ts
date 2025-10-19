/**
 * Unit tests for Command Registry.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CommandRegistry } from './command-registry.js'

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  describe('register', () => {
    it('registers a command', () => {
      const command = {
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: () => {}
      }

      registry.register(command)

      expect(registry.getCommand('test.command')).toEqual(command)
    })

    it('returns a disposable', () => {
      const command = {
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: () => {}
      }

      const disposable = registry.register(command)

      expect(disposable).toHaveProperty('dispose')
      expect(typeof disposable.dispose).toBe('function')
    })

    it('allows unregistering via disposable', () => {
      const command = {
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: () => {}
      }

      const disposable = registry.register(command)
      disposable.dispose()

      expect(registry.getCommand('test.command')).toBeUndefined()
    })
  })

  describe('execute', () => {
    it('executes a command', async () => {
      let executed = false

      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: () => { executed = true }
      })

      await registry.execute('test.command')

      expect(executed).toBe(true)
    })

    it('passes arguments to command', async () => {
      let receivedArgs: any

      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: (args) => { receivedArgs = args }
      })

      await registry.execute('test.command', { foo: 'bar' })

      expect(receivedArgs).toEqual({ foo: 'bar' })
    })

    it('does not execute if canExecute returns false', async () => {
      let executed = false

      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        canExecute: () => false,
        execute: () => { executed = true }
      })

      await registry.execute('test.command')

      expect(executed).toBe(false)
    })

    it('does not execute if when clause evaluates to false', async () => {
      let executed = false

      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        when: 'testContext',
        execute: () => { executed = true }
      })

      registry.setContext('testContext', false)
      await registry.execute('test.command')

      expect(executed).toBe(false)
    })

    it('executes if when clause evaluates to true', async () => {
      let executed = false

      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        when: 'testContext',
        execute: () => { executed = true }
      })

      registry.setContext('testContext', true)
      await registry.execute('test.command')

      expect(executed).toBe(true)
    })
  })

  describe('getCommands', () => {
    it('returns all commands', () => {
      registry.register({
        id: 'test.command1',
        title: 'Test Command 1',
        category: 'global' as const,
        execute: () => {}
      })

      registry.register({
        id: 'test.command2',
        title: 'Test Command 2',
        category: 'video' as const,
        execute: () => {}
      })

      const commands = registry.getCommands()
      expect(commands).toHaveLength(2)
    })

    it('filters by category', () => {
      registry.register({
        id: 'test.command1',
        title: 'Test Command 1',
        category: 'global' as const,
        execute: () => {}
      })

      registry.register({
        id: 'test.command2',
        title: 'Test Command 2',
        category: 'video' as const,
        execute: () => {}
      })

      const globalCommands = registry.getCommands('global')
      expect(globalCommands).toHaveLength(1)
      expect(globalCommands[0].id).toBe('test.command1')
    })
  })

  describe('evaluateWhenClause', () => {
    it('evaluates simple context', () => {
      registry.setContext('testContext', true)
      expect(registry.evaluateWhenClause('testContext')).toBe(true)

      registry.setContext('testContext', false)
      expect(registry.evaluateWhenClause('testContext')).toBe(false)
    })

    it('evaluates negation', () => {
      registry.setContext('testContext', true)
      expect(registry.evaluateWhenClause('!testContext')).toBe(false)

      registry.setContext('testContext', false)
      expect(registry.evaluateWhenClause('!testContext')).toBe(true)
    })

    it('evaluates AND conditions', () => {
      registry.setContext('context1', true)
      registry.setContext('context2', true)
      expect(registry.evaluateWhenClause('context1 && context2')).toBe(true)

      registry.setContext('context2', false)
      expect(registry.evaluateWhenClause('context1 && context2')).toBe(false)
    })

    it('evaluates OR conditions', () => {
      registry.setContext('context1', true)
      registry.setContext('context2', false)
      expect(registry.evaluateWhenClause('context1 || context2')).toBe(true)

      registry.setContext('context1', false)
      expect(registry.evaluateWhenClause('context1 || context2')).toBe(false)
    })

    it('evaluates complex expressions', () => {
      registry.setContext('active', true)
      registry.setContext('focused', false)
      registry.setContext('busy', false)

      expect(registry.evaluateWhenClause('active && !focused')).toBe(true)
      expect(registry.evaluateWhenClause('active && focused || !busy')).toBe(true)
    })
  })

  describe('context management', () => {
    it('sets and gets context values', () => {
      registry.setContext('testKey', true)
      expect(registry.getContext('testKey')).toBe(true)

      registry.setContext('testKey', false)
      expect(registry.getContext('testKey')).toBe(false)
    })

    it('returns false for unset context', () => {
      expect(registry.getContext('nonexistent')).toBe(false)
    })
  })

  describe('getKeybinding', () => {
    it('returns keybinding as array', () => {
      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        keybinding: 'mod+s',
        execute: () => {}
      })

      expect(registry.getKeybinding('test.command')).toEqual(['mod+s'])
    })

    it('returns multiple keybindings', () => {
      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        keybinding: ['mod+s', 'mod+shift+s'],
        execute: () => {}
      })

      expect(registry.getKeybinding('test.command')).toEqual(['mod+s', 'mod+shift+s'])
    })

    it('returns empty array if no keybinding', () => {
      registry.register({
        id: 'test.command',
        title: 'Test Command',
        category: 'global' as const,
        execute: () => {}
      })

      expect(registry.getKeybinding('test.command')).toEqual([])
    })
  })
})
