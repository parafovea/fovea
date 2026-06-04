import { useState, useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { useLocation } from 'react-router-dom'
import { commandRegistry } from '@lib/commands/command-registry'
import { formatKeybinding } from '@lib/commands/commands'

export default function KeyboardShortcutHint() {
  const location = useLocation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)

  // Get the most relevant commands for the current context
  const getRelevantCommands = () => {
    const allCommands = commandRegistry.getCommands()
    const commands = []

    // Always show command palette and help
    commands.push(allCommands.find(c => c.id === 'commandPalette.toggle'))
    commands.push(allCommands.find(c => c.id === 'help.show'))

    // Add context-specific commands based on route
    if (location.pathname === '/') {
      commands.push(allCommands.find(c => c.id === 'search.focus'))
      commands.push(allCommands.find(c => c.id === 'video.open'))
    } else if (location.pathname === '/ontology') {
      commands.push(allCommands.find(c => c.id === 'ontology.newType'))
      commands.push(allCommands.find(c => c.id === 'ontology.nextTab'))
    } else if (location.pathname === '/objects') {
      commands.push(allCommands.find(c => c.id === 'object.new'))
      commands.push(allCommands.find(c => c.id === 'object.nextTab'))
    } else if (location.pathname.startsWith('/annotate')) {
      commands.push(allCommands.find(c => c.id === 'video.playPause'))
      commands.push(allCommands.find(c => c.id === 'annotation.addKeyframe'))
      commands.push(allCommands.find(c => c.id === 'timeline.toggle'))
    }

    return commands.filter(Boolean).slice(0, 4) // Show max 4 commands
  }

  const commands = getRelevantCommands() || []

  // Auto-collapse after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(false)
    }, 10000)

    return () => clearTimeout(timer)
  }, [location.pathname]) // Reset timer on route change

  if (isDismissed || commands.length === 0) {
    return null
  }

  return (
    <div
      role="complementary"
      aria-label="Keyboard shortcuts hint"
      className="fixed bottom-4 left-4 z-[1200] max-w-[400px] pointer-events-none"
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <div className="relative rounded-lg border bg-card p-4 shadow-lg pointer-events-auto">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsDismissed(true)}
              className="absolute top-1 right-1"
              aria-label="Dismiss keyboard shortcuts hint"
            >
              <X className="size-4" />
            </Button>

            <div className="flex items-center gap-2 mb-2">
              <Keyboard className="size-4 text-primary" />
              <span className="text-xs font-bold">
                Keyboard Shortcuts
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {commands.map((command, index) => {
                if (!command || !command.keybinding) return null
                const keybinding = Array.isArray(command.keybinding) ? command.keybinding[0] : command.keybinding
                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="font-mono bg-muted px-1 py-0.5 rounded text-[0.7rem]">
                      {formatKeybinding(keybinding)}
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {command.description || command.title}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {!isExpanded && (
        <div
          className="rounded-lg border bg-card p-2 shadow-md cursor-pointer pointer-events-auto hover:bg-accent"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center gap-1">
            <Keyboard className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Press ? for shortcuts
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
