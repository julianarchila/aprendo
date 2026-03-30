"use client"

import type { ComponentProps } from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { cn } from '#/lib/utils'

export const HoverCard = HoverCardPrimitive.Root
export const HoverCardTrigger = HoverCardPrimitive.Trigger

export function HoverCardContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-lg)]',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}
