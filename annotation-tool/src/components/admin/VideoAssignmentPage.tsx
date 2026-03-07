/**
 * Admin video assignment management page.
 * Provides manual video assignment, assignment rule management, and bulk operations.
 *
 * @module
 */

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Send,
  ListChecks,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
import { ConfirmDialog } from '../shared/ConfirmDialog'

interface AssignmentRule {
  id: string
  name: string
  target: string
  conditions: string
  active: boolean
  createdAt: string
}

interface RuleFormData {
  name: string
  target: string
  conditions: string
  active: boolean
}

interface EvaluationResult {
  ruleId: string
  matchedVideos: number
  targetUsers: number
}

const assignmentKeys = {
  rules: ['admin', 'assignment-rules'] as const,
  ruleList: () => [...assignmentKeys.rules, 'list'] as const,
}

/**
 * Fetches all assignment rules from the admin API.
 *
 * @returns Array of assignment rules
 */
async function fetchRules(): Promise<AssignmentRule[]> {
  const response = await fetch('/api/admin/assignment-rules', { credentials: 'include' })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to fetch assignment rules')
  }
  return response.json()
}

/**
 * Admin video assignment management page.
 * Provides three sections: manual assignment, assignment rules CRUD, and bulk operations.
 */
export function VideoAssignmentPage(): JSX.Element {
  const queryClient = useQueryClient()
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: assignmentKeys.ruleList(),
    queryFn: fetchRules,
    staleTime: 2 * 60 * 1000,
  })

  // Manual assignment state
  const [videoIds, setVideoIds] = useState('')
  const [assignTarget, setAssignTarget] = useState('')
  const [assignResult, setAssignResult] = useState<string | null>(null)

  // Rule CRUD state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null)
  const [ruleFormData, setRuleFormData] = useState<RuleFormData>({
    name: '',
    target: '',
    conditions: '',
    active: true,
  })

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingRule, setDeletingRule] = useState<AssignmentRule | null>(null)

  // Evaluation state
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null)

  // Bulk operations state
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const manualAssign = useMutation({
    mutationFn: async ({ videoIds, target }: { videoIds: string[]; target: string }) => {
      const response = await fetch('/api/admin/video-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoIds, target }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to assign videos')
      }
      return response.json()
    },
    onSuccess: (data) => {
      setAssignResult(`Assigned ${data.count ?? 0} video(s) successfully.`)
      setVideoIds('')
      setAssignTarget('')
    },
    onError: (err: Error) => {
      setAssignResult(`Assignment failed: ${err.message}`)
    },
  })

  const createRule = useMutation({
    mutationFn: async (data: RuleFormData) => {
      const response = await fetch('/api/admin/assignment-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to create rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.ruleList() })
      handleCloseRuleDialog()
    },
  })

  const updateRule = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RuleFormData }) => {
      const response = await fetch(`/api/admin/assignment-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to update rule')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.ruleList() })
      handleCloseRuleDialog()
    },
  })

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/assignment-rules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to delete rule')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.ruleList() })
      setDeleteConfirmOpen(false)
      setDeletingRule(null)
    },
  })

  const evaluateRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await fetch(`/api/admin/assignment-rules/${ruleId}/evaluate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to evaluate rule')
      }
      return response.json() as Promise<EvaluationResult>
    },
    onSuccess: (data) => {
      setEvaluationResult(data)
    },
  })

  const applyAllRules = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/assignment-rules/apply-all', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to apply rules')
      }
      return response.json()
    },
    onSuccess: (data) => {
      setBulkResult(`Applied all rules: ${data.assignmentsCreated ?? 0} new assignment(s) created.`)
    },
    onError: (err: Error) => {
      setBulkResult(`Bulk apply failed: ${err.message}`)
    },
  })

  const handleOpenCreateRule = () => {
    setEditingRule(null)
    setRuleFormData({ name: '', target: '', conditions: '', active: true })
    setRuleDialogOpen(true)
  }

  const handleOpenEditRule = (rule: AssignmentRule) => {
    setEditingRule(rule)
    setRuleFormData({
      name: rule.name,
      target: rule.target,
      conditions: rule.conditions,
      active: rule.active,
    })
    setRuleDialogOpen(true)
  }

  const handleCloseRuleDialog = () => {
    setRuleDialogOpen(false)
    setEditingRule(null)
    setRuleFormData({ name: '', target: '', conditions: '', active: true })
  }

  const handleSubmitRule = () => {
    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, data: ruleFormData })
    } else {
      createRule.mutate(ruleFormData)
    }
  }

  const handleManualAssign = () => {
    const ids = videoIds.split(',').map((id) => id.trim()).filter(Boolean)
    if (ids.length > 0 && assignTarget) {
      manualAssign.mutate({ videoIds: ids, target: assignTarget })
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load assignment rules: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Section 1: Manual Assignment */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-1">
          Manual Assignment
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Assign specific videos to a project or user by ID.
        </p>
        <div className="flex gap-4 items-start">
          <div className="flex-grow space-y-2">
            <Label htmlFor="video-ids">Video IDs</Label>
            <Input
              id="video-ids"
              value={videoIds}
              onChange={(e) => setVideoIds(e.target.value)}
              placeholder="Comma-separated UUIDs"
            />
            <p className="text-sm text-muted-foreground">Enter one or more video UUIDs separated by commas</p>
          </div>
          <div className="min-w-[260px] space-y-2">
            <Label htmlFor="assign-target">Target (Project/User ID)</Label>
            <Input
              id="assign-target"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
            />
          </div>
          <Button
            className="mt-7"
            onClick={handleManualAssign}
            disabled={!videoIds || !assignTarget || manualAssign.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            Assign
          </Button>
        </div>
        {assignResult && (
          <Alert variant={assignResult.startsWith('Assigned') ? 'default' : 'destructive'} className="mt-4">
            <AlertDescription>{assignResult}</AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      {/* Section 2: Assignment Rules */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Assignment Rules</h3>
          <Button onClick={handleOpenCreateRule}>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  No assignment rules defined
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{rule.target}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap block">
                      {rule.conditions}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.active ? 'secondary' : 'outline'}>
                      {rule.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(rule.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => evaluateRule.mutate(rule.id)}
                      aria-label="evaluate rule"
                      title="Dry-run evaluation"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditRule(rule)} aria-label="edit rule">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setDeletingRule(rule); setDeleteConfirmOpen(true) }}
                      aria-label="delete rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {evaluationResult && (
          <Alert className="mt-4">
            <AlertDescription>
              Evaluation result: {evaluationResult.matchedVideos} video(s) matched, {evaluationResult.targetUsers} target user(s).
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      {/* Section 3: Bulk Operations */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-1">
          Bulk Operations
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Apply all active assignment rules at once. This evaluates each active rule and creates assignments for matching videos.
        </p>
        <Button
          onClick={() => applyAllRules.mutate()}
          disabled={applyAllRules.isPending}
        >
          <ListChecks className="mr-2 h-4 w-4" />
          {applyAllRules.isPending ? 'Applying...' : 'Apply All Rules'}
        </Button>
        {bulkResult && (
          <Alert
            variant={bulkResult.startsWith('Applied') ? 'default' : 'destructive'}
            className="mt-4"
          >
            <AlertDescription>{bulkResult}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Rule Create/Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={(isOpen) => !isOpen && handleCloseRuleDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Name *</Label>
              <Input
                id="rule-name"
                value={ruleFormData.name}
                onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-target">Target *</Label>
              <Input
                id="rule-target"
                value={ruleFormData.target}
                onChange={(e) => setRuleFormData({ ...ruleFormData, target: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">Project or user ID to assign matched videos to</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-conditions">Conditions *</Label>
              <Textarea
                id="rule-conditions"
                value={ruleFormData.conditions}
                onChange={(e) => setRuleFormData({ ...ruleFormData, conditions: e.target.value })}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">JSON condition expression for matching videos</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="rule-active"
                checked={ruleFormData.active}
                onCheckedChange={(checked) => setRuleFormData({ ...ruleFormData, active: checked })}
              />
              <Label htmlFor="rule-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseRuleDialog}>Cancel</Button>
            <Button
              onClick={handleSubmitRule}
              disabled={!ruleFormData.name || !ruleFormData.target || !ruleFormData.conditions || createRule.isPending || updateRule.isPending}
            >
              {editingRule ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Rule"
        message={`Are you sure you want to delete rule "${deletingRule?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={() => { if (deletingRule) deleteRule.mutate(deletingRule.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingRule(null) }}
        loading={deleteRule.isPending}
      />
    </div>
  )
}
