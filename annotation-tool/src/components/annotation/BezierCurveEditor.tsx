/**
 * @module BezierCurveEditor
 * @description Visual editor for cubic bezier curves with draggable control points.
 * Provides intuitive curve shaping for custom interpolation.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Box, Button, Typography, Tabs, Tab } from '@mui/material'
import { BezierControlPoint } from '../../models/types.js'

/**
 * @interface BezierCurveEditorProps
 * @description Props for BezierCurveEditor component.
 */
export interface BezierCurveEditorProps {
  /** Property being edited */
  property: 'x' | 'y' | 'width' | 'height'
  /** Initial control points */
  initialControlPoints: BezierControlPoint[]
  /** Callback when control points change */
  onChange: (controlPoints: BezierControlPoint[]) => void
}

/**
 * @component BezierCurveEditor
 * @description SVG-based bezier curve editor with draggable handles.
 */
export const BezierCurveEditor: React.FC<BezierCurveEditorProps> = ({
  property: _property,
  initialControlPoints,
  onChange,
}) => {
  const canvasRef = useRef<SVGSVGElement>(null)
  const [controlPoints, setControlPoints] = useState<BezierControlPoint[]>(
    initialControlPoints || [
      { x: 0.42, y: 0 },
      { x: 0.58, y: 1 },
    ]
  )
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null)
  const [selectedTab, setSelectedTab] = useState(0)

  const width = 400
  const height = 300
  const margin = 40

  // Convert normalized coordinates (0-1) to SVG coordinates
  const toSvg = useCallback(
    (point: BezierControlPoint) => ({
      x: margin + point.x * (width - 2 * margin),
      y: height - margin - point.y * (height - 2 * margin),
    }),
    [width, height, margin]
  )

  // Convert SVG coordinates to normalized coordinates (0-1)
  const fromSvg = useCallback(
    (svgX: number, svgY: number) => ({
      x: Math.max(0, Math.min(1, (svgX - margin) / (width - 2 * margin))),
      y: Math.max(0, Math.min(1, (height - margin - svgY) / (height - 2 * margin))),
    }),
    [width, height, margin]
  )

  // Generate bezier curve path
  const generatePath = useCallback(() => {
    const p0 = toSvg({ x: 0, y: 0 })
    const p1 = toSvg(controlPoints[0])
    const p2 = toSvg(controlPoints[1])
    const p3 = toSvg({ x: 1, y: 1 })

    return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`
  }, [controlPoints, toSvg])

  // Handle mouse down on control point
  const handleMouseDown = (pointIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingPoint(pointIndex)
  }

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingPoint === null || !canvasRef.current) return

      const svg = canvasRef.current
      const rect = svg.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      const svgY = e.clientY - rect.top

      const newPoint = fromSvg(svgX, svgY)

      const newControlPoints = [...controlPoints]
      newControlPoints[draggingPoint] = newPoint

      setControlPoints(newControlPoints)
      onChange(newControlPoints)
    },
    [draggingPoint, controlPoints, fromSvg, onChange]
  )

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDraggingPoint(null)
  }, [])

  // Attach mouse listeners
  useEffect(() => {
    if (draggingPoint !== null) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [draggingPoint, handleMouseMove, handleMouseUp])

  // Reset to linear
  const handleReset = () => {
    const linear: BezierControlPoint[] = [
      { x: 0.33, y: 0.33 },
      { x: 0.67, y: 0.67 },
    ]
    setControlPoints(linear)
    onChange(linear)
  }

  return (
    <Box>
      {/* Property Tabs */}
      <Tabs value={selectedTab} onChange={(_, newValue) => setSelectedTab(newValue)}>
        <Tab label="X" />
        <Tab label="Y" disabled />
        <Tab label="Width" disabled />
        <Tab label="Height" disabled />
      </Tabs>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 1 }}>
        Drag the control points to shape the curve
      </Typography>

      {/* SVG Canvas */}
      <svg
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          border: '1px solid #ddd',
          borderRadius: '4px',
          backgroundColor: '#fafafa',
          cursor: draggingPoint !== null ? 'grabbing' : 'default',
        }}
      >
        {/* Grid */}
        <g>
          {/* Vertical grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const x = margin + t * (width - 2 * margin)
            return (
              <line
                key={`v-${t}`}
                x1={x}
                y1={margin}
                x2={x}
                y2={height - margin}
                stroke="#e0e0e0"
                strokeWidth={t === 0 || t === 1 ? 2 : 1}
              />
            )
          })}

          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = height - margin - t * (height - 2 * margin)
            return (
              <line
                key={`h-${t}`}
                x1={margin}
                y1={y}
                x2={width - margin}
                y2={y}
                stroke="#e0e0e0"
                strokeWidth={t === 0 || t === 1 ? 2 : 1}
              />
            )
          })}
        </g>

        {/* Axis labels */}
        <text x={width / 2} y={height - 5} textAnchor="middle" fontSize={12} fill="#666">
          Time (0 → 1)
        </text>
        <text
          x={10}
          y={height / 2}
          textAnchor="middle"
          fontSize={12}
          fill="#666"
          transform={`rotate(-90, 10, ${height / 2})`}
        >
          Value (0 → 1)
        </text>

        {/* Control point handles */}
        <g>
          {/* Line from P0 to P1 */}
          <line
            x1={toSvg({ x: 0, y: 0 }).x}
            y1={toSvg({ x: 0, y: 0 }).y}
            x2={toSvg(controlPoints[0]).x}
            y2={toSvg(controlPoints[0]).y}
            stroke="#999"
            strokeWidth={1}
            strokeDasharray="4,4"
          />

          {/* Line from P2 to P3 */}
          <line
            x1={toSvg(controlPoints[1]).x}
            y1={toSvg(controlPoints[1]).y}
            x2={toSvg({ x: 1, y: 1 }).x}
            y2={toSvg({ x: 1, y: 1 }).y}
            stroke="#999"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        </g>

        {/* Bezier curve */}
        <path d={generatePath()} fill="none" stroke="#1976d2" strokeWidth={3} />

        {/* Start and end points */}
        <circle
          cx={toSvg({ x: 0, y: 0 }).x}
          cy={toSvg({ x: 0, y: 0 }).y}
          r={5}
          fill="#666"
        />
        <circle
          cx={toSvg({ x: 1, y: 1 }).x}
          cy={toSvg({ x: 1, y: 1 }).y}
          r={5}
          fill="#666"
        />

        {/* Control points */}
        {controlPoints.map((point, index) => {
          const svgPoint = toSvg(point)
          return (
            <g key={index}>
              <circle
                cx={svgPoint.x}
                cy={svgPoint.y}
                r={8}
                fill={draggingPoint === index ? '#1976d2' : '#fff'}
                stroke="#1976d2"
                strokeWidth={2}
                style={{ cursor: 'grab' }}
                onMouseDown={handleMouseDown(index)}
              />
              <text
                x={svgPoint.x}
                y={svgPoint.y - 15}
                textAnchor="middle"
                fontSize={11}
                fill="#666"
              >
                P{index + 1}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Reset Button */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          P1: ({controlPoints[0].x.toFixed(2)}, {controlPoints[0].y.toFixed(2)}) | P2: (
          {controlPoints[1].x.toFixed(2)}, {controlPoints[1].y.toFixed(2)})
        </Typography>
        <Button size="small" onClick={handleReset}>
          Reset to Linear
        </Button>
      </Box>
    </Box>
  )
}
