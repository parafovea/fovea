import { useState, useEffect } from 'react'
import { CircleAlert, Info } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

import { useCorpora, useExportLayers } from '@store/queries'

/**
 * Props for the ExportLayersDialog component.
 *
 * @param open - whether the dialog is open
 * @param onClose - callback when the dialog is closed
 */
interface ExportLayersDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Dialog for exporting a layers corpus as a JSONL artifact.
 *
 * Lists the corpora the caller can read, lets them pick one (or all), and
 * downloads the serialized JSONL the export route returns.
 *
 * @param props - component props
 * @returns the export layers dialog element
 */
export function ExportLayersDialog({ open, onClose }: ExportLayersDialogProps): JSX.Element {
  const { data: corpora = [], isLoading: isLoadingCorpora } = useCorpora()
  const exportLayers = useExportLayers()
  const exporting = exportLayers.isPending

  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Reset selection and error whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setSelected('')
      setError(null)
    }
  }, [open])

  const handleExport = async (): Promise<void> => {
    setError(null)
    try {
      const corpus = corpora.find((c) => c.id === selected)
      if (!corpus) {
        setError('Select a corpus to export')
        return
      }
      await exportLayers.mutateAsync({ corpusId: corpus.id, corpusName: corpus.name })
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed'
      setError(message)
    }
  }

  const selectedCorpus = corpora.find((c) => c.id === selected)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent data-tour-id="export-layers-dialog" className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Corpus</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {exporting && <Progress value={null} />}

          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Export a corpus as a JSON Lines (.jsonl) artifact.
            </AlertDescription>
          </Alert>

          {/* Corpus selector */}
          <div className="space-y-2">
            <Label htmlFor="export-corpus">Corpus</Label>
            {isLoadingCorpora ? (
              <div className="flex items-center gap-2">
                <Spinner />
                <p className="text-sm text-muted-foreground">Loading corpora...</p>
              </div>
            ) : (
              <Select value={selected} onValueChange={(value) => setSelected(value ?? '')}>
                <SelectTrigger id="export-corpus" className="w-full">
                  <SelectValue placeholder="Select a corpus" />
                </SelectTrigger>
                <SelectContent>
                  {corpora.map((corpus) => (
                    <SelectItem key={corpus.id} value={corpus.id}>
                      {corpus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Selected corpus detail */}
          {selectedCorpus && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">{selectedCorpus.name}</p>
              {selectedCorpus.description && (
                <p className="mt-1 text-xs text-muted-foreground">{selectedCorpus.description}</p>
              )}
              {selectedCorpus.languages.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Languages: {selectedCorpus.languages.join(', ')}
                </p>
              )}
            </div>
          )}

          {!isLoadingCorpora && corpora.length === 0 && (
            <Alert>
              <AlertDescription>No corpora available to export.</AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || isLoadingCorpora || !selected}>
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
