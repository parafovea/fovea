/**
 * Expandable JSON viewer component with syntax highlighting.
 * Displays JSON with collapsible sections for long fields.
 */

import { useState } from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import { ExpandMore as ExpandIcon, ChevronRight as CollapseIcon } from '@mui/icons-material'

/**
 * Props for ExpandableJsonViewer component.
 */
interface ExpandableJsonViewerProps {
  data: any
  initialCollapsed?: boolean
}

/**
 * Syntax highlighting colors (VS Code Dark+ theme).
 */
const colors = {
  string: '#ce9178',
  number: '#b5cea8',
  boolean: '#569cd6',
  null: '#569cd6',
  key: '#9cdcfe',
  punctuation: '#d4d4d4',
  comment: '#6a9955',
}

/**
 * Expandable JSON viewer with syntax highlighting.
 * Supports collapsible sections for arrays and objects.
 *
 * @param data - JSON data to display
 * @param initialCollapsed - Whether sections start collapsed
 * @returns Expandable JSON viewer component
 */
export default function ExpandableJsonViewer({
  data,
  initialCollapsed = false
}: ExpandableJsonViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const togglePath = (path: string) => {
    setExpandedPaths(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  const isExpanded = (path: string) => {
    return expandedPaths.has(path) || !initialCollapsed
  }

  const renderValue = (value: any, path: string = '', indent: number = 0): React.ReactNode => {
    const indentStr = '  '.repeat(indent)

    if (value === null) {
      return <span style={{ color: colors.null }}>null</span>
    }

    if (typeof value === 'string') {
      return <span style={{ color: colors.string }}>"{value}"</span>
    }

    if (typeof value === 'number') {
      return <span style={{ color: colors.number }}>{value}</span>
    }

    if (typeof value === 'boolean') {
      return <span style={{ color: colors.boolean }}>{value ? 'true' : 'false'}</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={{ color: colors.punctuation }}>[]</span>
      }

      const expanded = isExpanded(path)
      const preview = `Array(${value.length})`

      return (
        <Box component="span">
          <IconButton
            size="small"
            onClick={() => togglePath(path)}
            sx={{ p: 0, minWidth: 16, mr: 0.5, color: colors.punctuation }}
          >
            {expanded ? <ExpandIcon fontSize="inherit" /> : <CollapseIcon fontSize="inherit" />}
          </IconButton>
          <span style={{ color: colors.comment }}>{preview} </span>
          <span style={{ color: colors.punctuation }}>[</span>
          {expanded && (
            <Box component="span" sx={{ display: 'block' }}>
              {value.map((item, index) => (
                <Box key={index} component="div">
                  {indentStr}  {renderValue(item, `${path}[${index}]`, indent + 1)}
                  {index < value.length - 1 && <span style={{ color: colors.punctuation }}>,</span>}
                </Box>
              ))}
              <div>{indentStr}<span style={{ color: colors.punctuation }}>]</span></div>
            </Box>
          )}
          {!expanded && <span style={{ color: colors.punctuation }}>]</span>}
        </Box>
      )
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 0) {
        return <span style={{ color: colors.punctuation }}>{'{}'}</span>
      }

      const expanded = isExpanded(path)
      const preview = `Object(${keys.length})`

      return (
        <Box component="span">
          <IconButton
            size="small"
            onClick={() => togglePath(path)}
            sx={{ p: 0, minWidth: 16, mr: 0.5, color: colors.punctuation }}
          >
            {expanded ? <ExpandIcon fontSize="inherit" /> : <CollapseIcon fontSize="inherit" />}
          </IconButton>
          <span style={{ color: colors.comment }}>{preview} </span>
          <span style={{ color: colors.punctuation }}>{'{'}</span>
          {expanded && (
            <Box component="span" sx={{ display: 'block' }}>
              {keys.map((key, index) => (
                <Box key={key} component="div">
                  {indentStr}  <span style={{ color: colors.key }}>"{key}"</span>
                  <span style={{ color: colors.punctuation }}>: </span>
                  {renderValue(value[key], `${path}.${key}`, indent + 1)}
                  {index < keys.length - 1 && <span style={{ color: colors.punctuation }}>,</span>}
                </Box>
              ))}
              <div>{indentStr}<span style={{ color: colors.punctuation }}>{'}'}</span></div>
            </Box>
          )}
          {!expanded && <span style={{ color: colors.punctuation }}>{'}'}</span>}
        </Box>
      )
    }

    return <span>{String(value)}</span>
  }

  return (
    <Box
      sx={{
        bgcolor: '#1e1e1e',
        color: '#d4d4d4',
        p: 2,
        borderRadius: 1,
        overflow: 'auto',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '0.75rem',
        lineHeight: 1.6,
        border: '1px solid',
        borderColor: 'divider',
        whiteSpace: 'pre',
        '& .MuiIconButton-root': {
          verticalAlign: 'middle',
        }
      }}
    >
      {renderValue(data)}
    </Box>
  )
}
