import {
  Category as CategoryIcon,
  Inventory2 as ObjectIcon,
} from '@mui/icons-material'

/**
 * Helper function to get consistent styling for types vs objects
 * @param isType Whether the item is a type (true) or object (false)
 * @returns Object containing style properties for types vs objects
 */
export function getTypeObjectStyles(isType: boolean) {
  return {
    borderStyle: isType ? ('dashed' as const) : ('solid' as const),
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
