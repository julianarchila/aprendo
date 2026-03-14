import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function validateEmail(email: string) {
  const normalized = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address.')
  }
  return normalized
}

export const upsertStudentByEmail = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = validateEmail(args.email)
    const now = Date.now()
    const existing = await ctx.db
      .query('students')
      .withIndex('by_normalizedEmail', (q) => q.eq('normalizedEmail', normalizedEmail))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email.trim(),
        updatedAt: now,
        lastSeenAt: now,
      })

      return {
        ...existing,
        email: args.email.trim(),
        updatedAt: now,
        lastSeenAt: now,
      }
    }

    const studentId = await ctx.db.insert('students', {
      email: args.email.trim(),
      normalizedEmail,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })

    const created = await ctx.db.get(studentId)
    if (created == null) {
      throw new Error('Could not create student.')
    }

    return created
  },
})

export const getStudent = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.studentId)
  },
})
