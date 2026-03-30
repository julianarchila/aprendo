"use client"

import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, HTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

type InputGroupAddonProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'block-start' | 'block-end'
}

type InputGroupButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost'
  size?: 'sm' | 'icon-sm'
}

const buttonVariants: Record<NonNullable<InputGroupButtonProps['variant']>, string> = {
  default: 'bg-[var(--accent)] text-[var(--text-inverted)] hover:bg-[var(--accent-hover)]',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]',
}

const buttonSizes: Record<NonNullable<InputGroupButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm',
  'icon-sm': 'size-9',
}

export function InputGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex w-full flex-col rounded-[1.6rem] border border-[var(--border)] bg-[var(--bg-inset)] p-2',
        className,
      )}
      {...props}
    />
  )
}

export function InputGroupAddon({ className, align, ...props }: InputGroupAddonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        align === 'block-end' ? 'justify-between' : '',
        className,
      )}
      {...props}
    />
  )
}

export function InputGroupButton({
  className,
  variant = 'ghost',
  size = 'icon-sm',
  type = 'button',
  ...props
}: InputGroupButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-[1rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  )
}

export function InputGroupTextarea({ className, rows = 2, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'min-h-16 w-full resize-none border-0 bg-transparent px-4 py-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]',
        className,
      )}
      {...props}
    />
  )
}

export type InputGroupProps = ComponentPropsWithoutRef<'div'>
