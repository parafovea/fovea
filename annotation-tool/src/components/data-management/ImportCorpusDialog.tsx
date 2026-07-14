import { useState, useCallback, useEffect } from 'react'
import { Upload, FileText, CircleAlert, CheckCircle, X, Info } from 'lucide-react'
import { toast } from 'sonner'

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
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useImportCorpus } from '@store/queries'
import type {
  CorpusImportFormat,
  ImportCorpusResult,
} from '@store/queries/useCorpus'

/**
 * Props for the ImportCorpusDialog component.
 *
 * @param open - whether the dialog is open
 * @param onClose - callback when the dialog is closed
 */
interface ImportCorpusDialogProps {
  open: boolean
  onClose: () => void
}

/** Human-readable labels for the supported interchange formats. */
const FORMAT_LABELS: Record<CorpusImportFormat, string> = {
  'layers-jsonl': 'Layers JSONL',
  bead: 'Bead',
}

/** Format a byte count as a human-readable size. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
}

/** Order the per-NSID import counts, largest first, for the result summary. */
function nsidBreakdown(byNsid: Record<string, number>): Array<{ nsid: string; count: number }> {
  return Object.entries(byNsid)
    .map(([nsid, count]) => ({ nsid, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Dialog for importing a bead or layers JSONL corpus.
 *
 * Accepts a `.jsonl` upload and an interchange format, sends the raw text to the
 * import route, and shows progress plus a summary of the normalized records the
 * server persisted (total count, source label, and a per-NSID breakdown).
 *
 * @param props - component props
 * @returns the import corpus dialog element
 */
export function ImportCorpusDialog({ open, onClose }: ImportCorpusDialogProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<CorpusImportFormat>('layers-jsonl')
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportCorpusResult | null>(null)

  const importCorpus = useImportCorpus()
  const importing = importCorpus.isPending

  // Reset transient state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setFile(null)
      setFormat('layers-jsonl')
      setError(null)
      setResult(null)
    }
  }, [open])

  const selectFile = useCallback((candidate: File): void => {
    if (!candidate.name.endsWith('.jsonl')) {
      setError('Only .jsonl files are accepted')
      return
    }
    setError(null)
    setResult(null)
    setFile(candidate)
  }, [])

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const dropped = e.dataTransfer.files
    if (dropped && dropped.length > 0) {
      selectFile(dropped[0])
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      selectFile(e.target.files[0])
    }
  }

  const handleRemoveFile = (): void => {
    setFile(null)
    setError(null)
    setResult(null)
  }

  const handleImport = async (): Promise<void> => {
    if (!file) return
    setError(null)
    try {
      const payload = await file.text()
      const importResult = await importCorpus.mutateAsync({
        format,
        payload,
        filename: file.name,
      })
      setResult(importResult)
      toast.success(`Imported ${importResult.persisted} records`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import corpus'
      setError(message)
    }
  }

  const summary = result ? nsidBreakdown(result.byNsid) : []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent data-tour-id="import-corpus-dialog" className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Corpus</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {importing && <Progress value={null} />}

          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Upload a JSON Lines (.jsonl) corpus and choose its format. The records are
              normalized and persisted server-side.
            </AlertDescription>
          </Alert>

          {/* Format selector */}
          <div className="space-y-2">
            <Label htmlFor="corpus-format">Format</Label>
            <Select value={format} onValueChange={(value) => { if (value) setFormat(value as CorpusImportFormat) }}>
              <SelectTrigger id="corpus-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="layers-jsonl">{FORMAT_LABELS['layers-jsonl']}</SelectItem>
                <SelectItem value="bead">{FORMAT_LABELS.bead}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File upload area */}
          <div>
            <Label className="mb-2">Select File</Label>
            {!file ? (
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'mt-2 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  dragActive
                    ? 'border-primary bg-muted/50'
                    : 'border-border bg-card hover:border-primary hover:bg-muted/50',
                )}
                onClick={() => document.getElementById('import-corpus-file-input')?.click()}
              >
                <Upload className="mx-auto mb-4 size-12 text-muted-foreground" />
                <p className="text-sm">Drag and drop a .jsonl corpus here</p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
                <input
                  id="import-corpus-file-input"
                  type="file"
                  accept=".jsonl"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card p-3">
                <FileText className="size-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={handleRemoveFile} disabled={importing}>
                  <X className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Result summary */}
          {result && (
            <>
              <Separator />
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle className="size-5 text-green-600" />
                  <h3 className="text-sm font-medium">Import Successful</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{result.persisted}</p>
                    <p className="text-xs text-muted-foreground">Records Imported</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="truncate text-lg font-semibold">{result.source}</p>
                    <p className="text-xs text-muted-foreground">Source</p>
                  </div>
                </div>
                {summary.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {summary.map(({ nsid, count }) => (
                      <div key={nsid} className="flex justify-between py-0.5 text-sm">
                        <span className="truncate font-mono text-xs">{nsid}</span>
                        <span className="text-muted-foreground">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleImport} disabled={!file || importing || result !== null}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
