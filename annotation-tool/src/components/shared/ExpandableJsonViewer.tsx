/**
 * Expandable JSON viewer component with syntax highlighting.
 * Displays JSON with collapsible sections for long fields.
 */

import { useState } from 'react'

import { ChevronDown, ChevronRight } from 'lucide-react'

/** JSON-compatible value type for the viewer. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Props for ExpandableJsonViewer component.
 */
interface ExpandableJsonViewerProps {
  data: JsonValue
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
export function ExpandableJsonViewer({
  data,
  initialCollapsed = false
}: ExpandableJsonViewerProps): JSX.Element {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const togglePath = (path: string): void => {
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

  const isExpanded = (path: string): boolean => {
    return expandedPaths.has(path) || !initialCollapsed
  }

  const renderValue = (value: JsonValue, path: string = '', indent: number = 0): React.ReactNode => {
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
        <span>
          <button
            type="button"
            className="inline-flex size-4 cursor-pointer items-center justify-center border-none bg-transparent p-0 align-middle"
            style={{ color: colors.punctuation }}
            onClick={() => togglePath(path)}
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          <span style={{ color: colors.comment }}>{preview} </span>
          <span style={{ color: colors.punctuation }}>[</span>
          {expanded && (
            <span className="block">
              {value.map((item, index) => (
                <div key={index}>
                  {indentStr}  {renderValue(item, `${path}[${index}]`, indent + 1)}
                  {index < value.length - 1 && <span style={{ color: colors.punctuation }}>,</span>}
                </div>
              ))}
              <div>{indentStr}<span style={{ color: colors.punctuation }}>]</span></div>
            </span>
          )}
          {!expanded && <span style={{ color: colors.punctuation }}>]</span>}
        </span>
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
        <span>
          <button
            type="button"
            className="inline-flex size-4 cursor-pointer items-center justify-center border-none bg-transparent p-0 align-middle"
            style={{ color: colors.punctuation }}
            onClick={() => togglePath(path)}
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          <span style={{ color: colors.comment }}>{preview} </span>
          <span style={{ color: colors.punctuation }}>{'{'}</span>
          {expanded && (
            <span className="block">
              {keys.map((key, index) => (
                <div key={key}>
                  {indentStr}  <span style={{ color: colors.key }}>"{key}"</span>
                  <span style={{ color: colors.punctuation }}>: </span>
                  {renderValue(value[key], `${path}.${key}`, indent + 1)}
                  {index < keys.length - 1 && <span style={{ color: colors.punctuation }}>,</span>}
                </div>
              ))}
              <div>{indentStr}<span style={{ color: colors.punctuation }}>{'}'}</span></div>
            </span>
          )}
          {!expanded && <span style={{ color: colors.punctuation }}>{'}'}</span>}
        </span>
      )
    }

    return <span>{String(value)}</span>
  }

  return (
    <div
      className="overflow-auto rounded border border-border font-mono text-xs leading-relaxed whitespace-pre"
      style={{
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '0.5rem',
      }}
    >
      {renderValue(data)}
    </div>
  )
}
