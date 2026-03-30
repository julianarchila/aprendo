"use client"

import type { ComponentProps, HTMLAttributes } from 'react'
import { useCallback } from 'react'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'

export function Suggestions({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className={cn('flex w-max min-w-full flex-nowrap items-center gap-2', className)}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  children,
  ...props
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion)
  }, [onClick, suggestion])

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'cursor-pointer rounded-full border-[var(--border)] bg-[var(--bg-inset)] px-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
        className,
      )}
      onClick={handleClick}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  )
}
