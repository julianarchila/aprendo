"use client"

import type { HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

type MessageRole = 'assistant' | 'user'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        'group flex w-full max-w-[95%] flex-col gap-2',
        from === 'user' ? 'user-message ml-auto items-end' : 'assistant-message items-start',
        className,
      )}
      {...props}
    />
  )
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 max-w-full overflow-hidden text-sm leading-6',
        'group-[.user-message]:rounded-[1.4rem] group-[.user-message]:bg-[var(--bg-inset)] group-[.user-message]:px-4 group-[.user-message]:py-3 group-[.user-message]:text-[var(--text-primary)]',
        'group-[.assistant-message]:w-full group-[.assistant-message]:rounded-[1.2rem] group-[.assistant-message]:border group-[.assistant-message]:border-[var(--border)] group-[.assistant-message]:bg-[var(--bg-card-hover)] group-[.assistant-message]:px-4 group-[.assistant-message]:py-3',
        className,
      )}
      {...props}
    />
  )
}

export function MessageResponse({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      {...props}
    />
  )
}
