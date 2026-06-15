import { query, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { assertOwnsStudent, requireAuthenticatedStudentId } from './auth'

export const getStudent = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertOwnsStudent(ctx, args.studentId)
    return ctx.db.get(args.studentId)
  },
})

export const getStudentAppState = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await assertOwnsStudent(ctx, args.studentId)
    return computeStudentAppState(ctx, args.studentId)
  },
})

export const getCurrentStudentAppState = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await ctx.auth.getUserIdentity()
    if (!authUser) return null
    const studentId = await requireAuthenticatedStudentId(ctx)
    return computeStudentAppState(ctx, studentId)
  },
})

async function computeStudentAppState(ctx: QueryCtx, studentId: Id<'students'>) {
  const student = await ctx.db.get(studentId)
  if (student == null) {
    return null
  }

  const sessions = await ctx.db
    .query('sessions')
    .withIndex('by_studentId_kind', (q) =>
      q.eq('studentId', studentId).eq('kind', 'diagnostic'),
    )
    .collect()

  const activeDiagnostic = sessions.find(
    (session) => session.status === 'in_progress' || session.status === 'created',
  ) ?? null
  const latestCompletedDiagnostic = sessions
    .filter((session) => session.status === 'completed')
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))[0] ?? null

  return {
    studentId: student._id,
    hasCompletedDiagnostic: latestCompletedDiagnostic != null,
    activeDiagnosticSessionId: activeDiagnostic?._id ?? null,
    latestCompletedDiagnosticId: latestCompletedDiagnostic?._id ?? null,
    defaultRoute: latestCompletedDiagnostic != null ? '/today' as const : '/diagnostic' as const,
  }
}
