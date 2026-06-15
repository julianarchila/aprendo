import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import type { QuestionEligibilityPool } from './sessionKinds'

/**
 * The launchable-question pool: the single definition of which questions a
 * student-facing flow may draw from, and how to fetch them by subject or
 * subtopic across eligibility tiers.
 *
 * Both session assembly (`sessions.ts`) and the syllabus counts (`syllabus.ts`)
 * depend on the *same* answer here — if the "usable + eligible" invariant lived
 * in two places it could drift, making the Temario advertise more (or fewer)
 * questions than a session can actually select.
 */

/** A question is usable only if it has a scored answer key and full taxonomy. */
export function hasUsableMetadata(question: Doc<'questions'>) {
  return (
    question.answerCorrectOption != null
    && question.subjectId != null
    && question.categoryId != null
    && question.primarySubtopicId != null
  )
}

/** Whether a question's eligibility tier is one the caller is drawing from. */
export function isInEligibilityPool(
  question: Doc<'questions'>,
  pools: QuestionEligibilityPool[],
) {
  return question.eligibility != null && (pools as string[]).includes(question.eligibility)
}

/** Every usable question for a subject across the given eligibility pools. */
export async function collectUsableQuestionsBySubject(
  ctx: QueryCtx,
  subjectId: string,
  pools: QuestionEligibilityPool[],
): Promise<Doc<'questions'>[]> {
  const pooled: Doc<'questions'>[] = []
  for (const pool of pools) {
    const rows = await ctx.db
      .query('questions')
      .withIndex('by_subjectId_eligibility', (q) =>
        q.eq('subjectId', subjectId).eq('eligibility', pool),
      )
      .collect()
    pooled.push(...rows)
  }
  return pooled.filter(hasUsableMetadata)
}

/** Every usable question for a subtopic across the given eligibility pools. */
export async function collectUsableQuestionsBySubtopic(
  ctx: QueryCtx,
  subtopicId: string,
  pools: QuestionEligibilityPool[],
): Promise<Doc<'questions'>[]> {
  const pooled: Doc<'questions'>[] = []
  for (const pool of pools) {
    const rows = await ctx.db
      .query('questions')
      .withIndex('by_primarySubtopicId_eligibility', (q) =>
        q.eq('primarySubtopicId', subtopicId).eq('eligibility', pool),
      )
      .collect()
    pooled.push(...rows)
  }
  return pooled.filter(hasUsableMetadata)
}
