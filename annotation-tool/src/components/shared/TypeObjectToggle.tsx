import React from 'react'
import {
  ToggleButton,
  ToggleButtonGroup,
  Box,
  Typography,
  Chip,
  Tooltip,
} from '@mui/material'
import {
  Category as CategoryIcon,
  Inventory2 as ObjectIcon,
} from '@mui/icons-material'

export type CreationMode = 'type' | 'object'

interface TypeObjectToggleProps {
  mode: CreationMode
  onChange: (mode: CreationMode) => void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
}

export function TypeObjectToggle({ 
  mode, 
  onChange, 
  disabled = false,
  size = 'medium' 
}: TypeObjectToggleProps) {
  const handleChange = (_: React.MouseEvent<HTMLElement>, newMode: CreationMode | null) => {
    if (newMode !== null) {
      onChange(newMode)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleChange}
        disabled={disabled}
        size={size}
        sx={{ width: '100%' }}
      >
        <ToggleButton value="type" sx={{ flex: 1 }}>
          <Tooltip title="Define categories and concepts">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CategoryIcon />
              <Typography variant="body2">Types</Typography>
            </Box>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="object" sx={{ flex: 1 }}>
          <Tooltip title="Create actual instances">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ObjectIcon />
              <Typography variant="body2">Objects</Typography>
            </Box>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
      
      <ModeIndicator mode={mode} />
    </Box>
  )
}

interface ModeIndicatorProps {
  mode: CreationMode
  variant?: 'chip' | 'text'
}

export function ModeIndicator({ mode, variant = 'chip' }: ModeIndicatorProps) {
  const isType = mode === 'type'
  
  if (variant === 'chip') {
    return (
      <Chip
        size="small"
        label={isType ? 'Creating Type (Category)' : 'Creating Object (Instance)'}
        color={isType ? 'primary' : 'secondary'}
        icon={isType ? <CategoryIcon /> : <ObjectIcon />}
        sx={{
          borderStyle: isType ? 'dashed' : 'solid',
          fontStyle: isType ? 'italic' : 'normal',
        }}
      />
    )
  }
  
  return (
    <Typography
      variant="caption"
      sx={{
        color: isType ? 'primary.main' : 'secondary.main',
        fontStyle: isType ? 'italic' : 'normal',
      }}
    >
      {isType 
        ? 'Types define categories that personas use to classify things'
        : 'Objects are actual entities, events, and times that exist in the world'}
    </Typography>
  )
}

interface TypeObjectBadgeProps {
  isType: boolean
  size?: 'small' | 'medium'
}

export function TypeObjectBadge({ isType, size = 'small' }: TypeObjectBadgeProps) {
  return (
    <Chip
      size={size}
      label={isType ? 'TYPE' : 'OBJECT'}
      color={isType ? 'primary' : 'secondary'}
      variant={isType ? 'outlined' : 'filled'}
      sx={{
        borderStyle: isType ? 'dashed' : 'solid',
        fontWeight: isType ? 'normal' : 'bold',
        fontStyle: isType ? 'italic' : 'normal',
        height: size === 'small' ? 20 : 24,
      }}
    />
  )
}

// Helper function to get consistent styling for types vs objects
export function getTypeObjectStyles(isType: boolean) {
  return {
    borderStyle: isType ? 'dashed' as const : 'solid' as const,
    borderColor: isType ? 'primary.main' : 'secondary.main',
    bgcolor: isType ? 'primary.50' : 'secondary.50',
    fontStyle: isType ? 'italic' : 'normal',
    icon: {
      color: isType ? 'primary.main' : 'secondary.main',
      component: isType ? CategoryIcon : ObjectIcon,
    },
    text: {
      primary: isType ? 'italic' : 'normal',
      secondary: isType ? 'Type Definition' : 'Object Instance',
    },
  }
}