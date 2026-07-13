/**
 * Browses and creates document expressions.
 *
 * Renders a searchable, responsive grid of document cards backed by
 * `useDocuments`, plus a create dialog that turns pasted text into a new
 * document expression via `useCreateDocument`. Opening a card navigates to the
 * document's annotation page.
 *
 * @module
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, PackageOpen, PackagePlus, Plus, Search } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useCreateDocument, useDocuments } from '@store/queries'
import { useDialog } from '@store/zustand/dialogStore'

import { DocumentCard } from './DocumentCard'
import { documentTitle } from './documentTitle'

/**
 * Renders the document browser: a search box, a create button, and a card grid.
 *
 * @returns the browser element
 */
export function DocumentBrowser(): JSX.Element {
  const navigate = useNavigate()
  const { data, isLoading } = useDocuments()
  const createDocument = useCreateDocument()
  const importCorpusDialog = useDialog('importCorpus')
  const exportLayersDialog = useDialog('exportLayers')

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const documents = useMemo(() => data?.items ?? [], [data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return documents
    return documents.filter(
      (document) =>
        documentTitle(document).toLowerCase().includes(term) ||
        (document.text ?? '').toLowerCase().includes(term),
    )
  }, [documents, search])

  const handleCreate = () => {
    if (text.trim().length === 0) return
    createDocument.mutate(
      { text, title: title.trim() || undefined },
      {
        onSuccess: (expression) => {
          setCreateOpen(false)
          setTitle('')
          setText('')
          navigate(`/documents/${expression.id}`)
        },
      },
    )
  }

  return (
    <div className="space-y-6" data-testid="document-browser">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Documents</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={importCorpusDialog.openDialog}>
            <PackagePlus className="mr-2 size-4" />
            Import corpus
          </Button>
          <Button variant="outline" onClick={exportLayersDialog.openDialog}>
            <PackageOpen className="mr-2 size-4" />
            Export corpus
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            New document
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Search documents by title or text..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="size-8" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold text-muted-foreground">No documents yet</h3>
          <p className="text-sm text-muted-foreground">
            Create a document from pasted text to start annotating token spans.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onOpen={(id) => navigate(`/documents/${id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="document-title">Title (optional)</Label>
              <Input
                id="document-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Untitled document"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-text">Text</Label>
              <Textarea
                id="document-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste the document text to tokenize and annotate..."
                rows={8}
              />
            </div>
            {createDocument.isError && (
              <Alert variant="destructive">
                <AlertDescription>Failed to create the document.</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={text.trim().length === 0 || createDocument.isPending}
            >
              {createDocument.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
