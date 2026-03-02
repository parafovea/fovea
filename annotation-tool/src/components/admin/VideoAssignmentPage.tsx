/**
 * Admin video assignment management page.
 * Provides manual video assignment, assignment rule management, and bulk operations.
 *
 * @module
 */

import { useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Divider,
  Paper,
  FormControlLabel,
  Switch,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as EvaluateIcon,
  Send as AssignIcon,
  PlaylistAddCheck as ApplyAllIcon,
} from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../shared/ConfirmDialog'

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
export default function VideoAssignmentPage() {
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
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load assignment rules: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Section 1: Manual Assignment */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Manual Assignment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Assign specific videos to a project or user by ID.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <TextField
            label="Video IDs"
            value={videoIds}
            onChange={(e) => setVideoIds(e.target.value)}
            placeholder="Comma-separated UUIDs"
            size="small"
            sx={{ flexGrow: 1 }}
            helperText="Enter one or more video UUIDs separated by commas"
          />
          <TextField
            label="Target (Project/User ID)"
            value={assignTarget}
            onChange={(e) => setAssignTarget(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          />
          <Button
            variant="contained"
            startIcon={<AssignIcon />}
            onClick={handleManualAssign}
            disabled={!videoIds || !assignTarget || manualAssign.isPending}
            sx={{ mt: '1px' }}
          >
            Assign
          </Button>
        </Box>
        {assignResult && (
          <Alert severity={assignResult.startsWith('Assigned') ? 'success' : 'error'} sx={{ mt: 2 }} onClose={() => setAssignResult(null)}>
            {assignResult}
          </Alert>
        )}
      </Paper>

      <Divider />

      {/* Section 2: Assignment Rules */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Assignment Rules</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateRule}>
            Create Rule
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Conditions</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    No assignment rules defined
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id} hover>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>
                      <Chip label={rule.target} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rule.conditions}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={rule.active ? 'Active' : 'Inactive'}
                        size="small"
                        color={rule.active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{formatDate(rule.createdAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => evaluateRule.mutate(rule.id)}
                        aria-label="evaluate rule"
                        title="Dry-run evaluation"
                      >
                        <EvaluateIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleOpenEditRule(rule)} aria-label="edit rule">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => { setDeletingRule(rule); setDeleteConfirmOpen(true) }}
                        aria-label="delete rule"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {evaluationResult && (
          <Alert severity="info" sx={{ mt: 2 }} onClose={() => setEvaluationResult(null)}>
            Evaluation result: {evaluationResult.matchedVideos} video(s) matched, {evaluationResult.targetUsers} target user(s).
          </Alert>
        )}
      </Box>

      <Divider />

      {/* Section 3: Bulk Operations */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Bulk Operations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Apply all active assignment rules at once. This evaluates each active rule and creates assignments for matching videos.
        </Typography>
        <Button
          variant="contained"
          color="warning"
          startIcon={<ApplyAllIcon />}
          onClick={() => applyAllRules.mutate()}
          disabled={applyAllRules.isPending}
        >
          {applyAllRules.isPending ? 'Applying...' : 'Apply All Rules'}
        </Button>
        {bulkResult && (
          <Alert
            severity={bulkResult.startsWith('Applied') ? 'success' : 'error'}
            sx={{ mt: 2 }}
            onClose={() => setBulkResult(null)}
          >
            {bulkResult}
          </Alert>
        )}
      </Paper>

      {/* Rule Create/Edit Dialog */}
      <Dialog open={ruleDialogOpen} onClose={handleCloseRuleDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={ruleFormData.name}
              onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Target"
              value={ruleFormData.target}
              onChange={(e) => setRuleFormData({ ...ruleFormData, target: e.target.value })}
              fullWidth
              required
              helperText="Project or user ID to assign matched videos to"
            />
            <TextField
              label="Conditions"
              value={ruleFormData.conditions}
              onChange={(e) => setRuleFormData({ ...ruleFormData, conditions: e.target.value })}
              fullWidth
              multiline
              rows={3}
              required
              helperText="JSON condition expression for matching videos"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={ruleFormData.active}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, active: e.target.checked })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRuleDialog}>Cancel</Button>
          <Button
            onClick={handleSubmitRule}
            variant="contained"
            disabled={!ruleFormData.name || !ruleFormData.target || !ruleFormData.conditions || createRule.isPending || updateRule.isPending}
          >
            {editingRule ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Rule"
        message={`Are you sure you want to delete rule "${deletingRule?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        onConfirm={() => { if (deletingRule) deleteRule.mutate(deletingRule.id) }}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingRule(null) }}
        loading={deleteRule.isPending}
      />
    </Box>
  )
}
