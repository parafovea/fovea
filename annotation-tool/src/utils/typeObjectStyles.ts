import { Tag, Package } from 'lucide-react'

/**
 * Helper function to get consistent styling for types vs objects.
 *
 * @param isType - Whether the item is a type (true) or object (false)
 * @returns Object containing style properties for types vs objects
 */
export function getTypeObjectStyles(isType: boolean) {
  return {
    borderStyle: isType ? ('dashed' as const) : ('solid' as const),
    borderColorClass: isType ? 'border-primary' : 'border-secondary',
    bgClass: isType ? 'bg-primary/10' : 'bg-secondary/10',
    fontStyle: isType ? 'italic' : 'normal',
    icon: {
      colorClass: isType ? 'text-primary' : 'text-secondary',
      component: isType ? Tag : Package,
    },
    text: {
      primary: isType ? 'italic' : 'normal',
      secondary: isType ? 'Type Definition' : 'Object Instance',
    },
  }
}
