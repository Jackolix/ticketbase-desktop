import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      // Use colors that contrast well with card backgrounds
      "data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300",
      "dark:data-[state=checked]:bg-blue-500 dark:data-[state=unchecked]:bg-gray-600",
      className
    )}
    {...props}
    ref={ref}
    style={{
      // Override global button styles that interfere
      padding: '0',
      fontSize: 'inherit',
      fontWeight: 'inherit',
      boxShadow: 'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      border: '2px solid transparent',
      // Force background colors with !important equivalent via inline styles
      backgroundColor: props.checked ? '#2563eb' : '#d1d5db',
    }}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }