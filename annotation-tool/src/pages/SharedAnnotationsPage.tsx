/**
 * Shared resources page.
 *
 * Shows resources shared with the current user and resources the user
 * has shared with others, with fork and revoke actions.
 */

import { useState, useMemo } from 'react'
import { Copy, Trash2, FileText, BookOpen, CheckSquare, User, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useReceivedShares, useSentShares, useForkShare, useRevokeShare } from '@store/queries/useSharing'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  annotation: 'Annotation',
  summary: 'Summary',
  claim: 'Claim',
  persona: 'Persona',
  world_state: 'World State',
}

function ResourceTypeIcon({ type }: { type: string }): JSX.Element {
  switch (type) {
    case 'annotation': return <FileText className="size-4" />
    case 'summary': return <BookOpen className="size-4" />
    case 'claim': return <CheckSquare className="size-4" />
    case 'persona': return <User className="size-4" />
    case 'world_state': return <Globe className="size-4" />
    default: return <FileText className="size-4" />
  }
}

const FILTER_OPTIONS = ['all', 'annotation', 'summary', 'claim', 'persona', 'world_state'] as const

interface ReceivedShare {
  id: string
  resourceType: string
  resourceId: string
  sharedByUserId: string
  sharedByUser: { id: string; username: string; displayName: string }
  permissionLevel: string
  expiresAt: string | null
  createdAt: string
}

interface SentShare {
  id: string
  resourceType: string
  resourceId: string
  sharedWithUserId: string | null
  sharedWithUser?: { id: string; username: string; displayName: string }
  sharedWithGroupId: string | null
  sharedWithGroup?: { id: string; name: string; slug: string }
  permissionLevel: string
  expiresAt: string | null
  createdAt: string
}

export default function SharedAnnotationsPage(): JSX.Element {
  const { data: received = [], isLoading: receivedLoading, error: receivedError } = useReceivedShares()
  const { data: sent = [], isLoading: sentLoading, error: sentError } = useSentShares()
  const forkShare = useForkShare()
  const revokeShare = useRevokeShare()
  const pageAnchor = useTourAnchor('shared-annotations-page')

  const [filter, setFilter] = useState<string>('all')

  const filteredReceived = useMemo(() => {
    const list = received as ReceivedShare[]
    if (filter === 'all') return list
    return list.filter((s) => s.resourceType === filter)
  }, [received, filter])

  const isLoading = receivedLoading || sentLoading
  const hasError = receivedError || sentError

  if (isLoading) {
    return (
      <div className="mx-auto max-w-screen-lg px-4">
        <div className="flex justify-center py-12">
          <Spinner className="size-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-screen-lg px-4" ref={pageAnchor}>
      <div className="py-6">
        <h1 className="mb-4 text-2xl font-bold">Shared With Me</h1>

        {hasError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>Failed to load shared resources.</AlertDescription>
          </Alert>
        )}

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList variant="line" className="mb-4 w-full justify-start">
            {FILTER_OPTIONS.map((opt) => (
              <TabsTrigger key={opt} value={opt}>
                {opt === 'all' ? 'All' : RESOURCE_TYPE_LABELS[opt] + 's'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Received shares table */}
          {filteredReceived.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No shared resources to display.</p>
            </div>
          ) : (
            <div className="mb-8 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Shared By</TableHead>
                    <TableHead>Permission</TableHead>
                    <TableHead>Shared</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceived.map((share) => (
                    <TableRow key={share.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ResourceTypeIcon type={share.resourceType} />
                          {RESOURCE_TYPE_LABELS[share.resourceType] ?? share.resourceType}
                        </div>
                      </TableCell>
                      <TableCell>{share.sharedByUser.displayName}</TableCell>
                      <TableCell>
                        <Badge variant={share.permissionLevel === 'forkable' ? 'default' : 'secondary'}>
                          {share.permissionLevel === 'forkable' ? 'Forkable' : 'Read-only'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(share.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        {share.permissionLevel === 'forkable' && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => forkShare.mutate(share.id)}
                                  disabled={forkShare.isPending}
                                />
                              }
                            >
                              <Copy className="size-4" />
                            </TooltipTrigger>
                            <TooltipContent>Fork to your workspace</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Tabs>

        <Separator className="my-8" />

        {/* Sent shares */}
        <h2 className="mb-4 text-xl font-semibold">My Shared Resources</h2>

        {(sent as SentShare[]).length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">You have not shared any resources.</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Shared With</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Shared</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sent as SentShare[]).map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ResourceTypeIcon type={share.resourceType} />
                        {RESOURCE_TYPE_LABELS[share.resourceType] ?? share.resourceType}
                      </div>
                    </TableCell>
                    <TableCell>
                      {share.sharedWithUser?.displayName ??
                        share.sharedWithGroup?.name ??
                        'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {share.permissionLevel === 'forkable' ? 'Forkable' : 'Read-only'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(share.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive"
                              onClick={() => revokeShare.mutate(share.id)}
                              disabled={revokeShare.isPending}
                            />
                          }
                        >
                          <Trash2 className="size-4" />
                        </TooltipTrigger>
                        <TooltipContent>Revoke share</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
