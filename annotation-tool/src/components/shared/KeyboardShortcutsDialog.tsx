/**
 * Keyboard shortcuts help dialog.
 * Displays all available keyboard shortcuts organized by context.
 */

import { useMemo } from 'react'

import { Keyboard } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { commandRegistry, Command } from '@lib/commands/command-registry'
import { formatKeybinding } from '@lib/commands/commands'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onClose: () => void
  currentContext?: 'videoBrowser' | 'ontologyWorkspace' | 'objectWorkspace' | 'annotationWorkspace' | 'settings'
}

function ShortcutTable({ commands }: { commands: Command[] }): JSX.Element {
  if (commands.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No shortcuts available
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">Shortcut</TableHead>
            <TableHead className="font-bold">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {commands
            .filter(cmd => cmd.keybinding)
            .map((command) => (
              <TableRow key={command.id}>
                <TableCell>
                  <kbd className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {Array.isArray(command.keybinding)
                      ? formatKeybinding(command.keybinding[0])
                      : formatKeybinding(command.keybinding!)}
                  </kbd>
                </TableCell>
                <TableCell>{command.description || command.title}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function KeyboardShortcutsDialog({
  open,
  onClose,
  currentContext,
}: KeyboardShortcutsDialogProps): JSX.Element {
  const defaultTab = useMemo(() => {
    if (currentContext === 'ontologyWorkspace') return 'ontology'
    if (currentContext === 'objectWorkspace') return 'object'
    if (currentContext === 'annotationWorkspace') return 'annotation'
    return 'global'
  }, [currentContext])

  const commandsByCategory = useMemo(() => {
    const allCommands = commandRegistry.getCommands() || []

    return {
      global: allCommands.filter(cmd => cmd.category === 'global' || cmd.category === 'navigation' || cmd.category === 'file'),
      video: allCommands.filter(cmd => cmd.category === 'video'),
      annotation: allCommands.filter(cmd => cmd.category === 'annotation'),
      ontology: allCommands.filter(cmd => cmd.category === 'ontology' || cmd.category === 'persona'),
      object: allCommands.filter(cmd => cmd.category === 'object'),
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl min-h-[60vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="ontology">Ontology Builder</TabsTrigger>
            <TabsTrigger value="object">World Builder</TabsTrigger>
            <TabsTrigger value="annotation">Annotation Workspace</TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="space-y-2 pt-2">
            <p className="text-sm font-medium text-muted-foreground">
              These shortcuts work everywhere in the application
            </p>
            <ShortcutTable commands={commandsByCategory.global} />
          </TabsContent>

          <TabsContent value="ontology" className="space-y-2 pt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Available in the Ontology Builder workspace (including persona browser)
            </p>
            <ShortcutTable commands={commandsByCategory.ontology} />
          </TabsContent>

          <TabsContent value="object" className="space-y-2 pt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Available in the World Builder workspace
            </p>
            <ShortcutTable commands={commandsByCategory.object} />
          </TabsContent>

          <TabsContent value="annotation" className="space-y-4 pt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Available in the Annotation Workspace (video annotation)
            </p>
            <div>
              <h4 className="mb-2 text-sm font-bold">Video Playback</h4>
              <ShortcutTable commands={commandsByCategory.video} />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-bold">Annotation Controls</h4>
              <ShortcutTable commands={commandsByCategory.annotation} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
