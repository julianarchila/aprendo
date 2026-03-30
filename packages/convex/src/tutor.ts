import { Agent, extractText, listMessages, syncStreams, vStreamArgs, vStreamMessagesReturnValue } from '@convex-dev/agent'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { components } from './_generated/api'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import type { Doc, Id } from './_generated/dataModel'

const agentComponent = (components as Record<string, unknown>).agent as ConstructorParameters<typeof Agent>[0]

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
})

const tutorAgent = new Agent(agentComponent, {
  name: 'Tutor',
  languageModel: google('gemini-2.5-flash'),
  instructions: [
    'Eres un tutor breve y claro para estudiantes preparando Saber 11.',
    'En esta primera version no tienes contexto adicional sobre la pregunta actual.',
    'Responde siempre en espanol.',
    'Ayuda con estrategias, explicaciones generales y orientacion de estudio.',
    'Si falta contexto, dilo claramente y pide la informacion necesaria.',
    'No inventes detalles sobre la pregunta o la sesion.',
  ].join(' '),
})

async function requireOwnedPracticeSession(
  ctx: { db: { get: (id: Id<'sessions'>) => Promise<Doc<'sessions'> | null> } },
  args: {
    practiceSessionId: Id<'sessions'>
    studentId: Id<'students'>
  },
) {
  const session = await ctx.db.get(args.practiceSessionId)
  if (session == null || session.type !== 'practice') {
    throw new Error('Practice session not found.')
  }
  if (session.studentId !== args.studentId) {
    throw new Error('Practice session does not belong to this student.')
  }
  return session
}

export const getPracticeTutorThreadMapping = internalQuery({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await requireOwnedPracticeSession(ctx, args)

    const mapping = await ctx.db
      .query('practiceTutorThreads')
      .withIndex('by_practiceSessionId', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .unique()

    return mapping
  },
})

export const touchPracticeTutorThread = internalMutation({
  args: {
    practiceSessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.db
      .query('practiceTutorThreads')
      .withIndex('by_practiceSessionId', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .unique()
    if (mapping == null) return

    await ctx.db.patch(mapping._id, {
      updatedAt: Date.now(),
    })
  },
})

export const createOrGetPracticeTutorThread = mutation({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await requireOwnedPracticeSession(ctx, args)

    const existing = await ctx.db
      .query('practiceTutorThreads')
      .withIndex('by_practiceSessionId', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .unique()
    if (existing) {
      return {
        threadId: existing.threadId,
      }
    }

    const { threadId } = await tutorAgent.createThread(ctx, {
      userId: args.studentId,
      title: `practice:${args.practiceSessionId}`,
    })
    const now = Date.now()

    await ctx.db.insert('practiceTutorThreads', {
      practiceSessionId: args.practiceSessionId,
      studentId: args.studentId,
      threadId,
      createdAt: now,
      updatedAt: now,
    })

    return { threadId }
  },
})

export const getPracticeTutorThread = query({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    await requireOwnedPracticeSession(ctx, args)

    const mapping = await ctx.db
      .query('practiceTutorThreads')
      .withIndex('by_practiceSessionId', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .unique()

    if (mapping == null) {
      return {
        threadId: null,
        messages: [],
      }
    }

    const paginated = await listMessages(ctx, agentComponent, {
      threadId: mapping.threadId,
      paginationOpts: { cursor: null, numItems: 50 },
      excludeToolMessages: true,
      statuses: ['success', 'failed'],
    })

    return {
      threadId: mapping.threadId,
      messages: paginated.page
        .flatMap((message) => {
          if (message.message == null) return []

          return [{
            id: message._id,
            role: message.message.role,
            content: extractText(message.message) ?? '',
          }]
        })
        .filter((message) =>
          (message.role === 'user' || message.role === 'assistant')
          && message.content.trim().length > 0,
        ),
    }
  },
})

export const listPracticeTutorMessages = query({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    await requireOwnedPracticeSession(ctx, {
      practiceSessionId: args.practiceSessionId,
      studentId: args.studentId,
    })

    const mapping = await ctx.db
      .query('practiceTutorThreads')
      .withIndex('by_practiceSessionId', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .unique()
    if (mapping == null || mapping.threadId !== args.threadId) {
      throw new Error('Tutor thread not found for this practice session.')
    }

    const paginated = await listMessages(ctx, agentComponent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
      excludeToolMessages: true,
      statuses: ['success', 'failed', 'pending'],
    })
    const streams = await syncStreams(ctx, agentComponent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    })

    return {
      ...paginated,
      streams,
    }
  },
  returns: vStreamMessagesReturnValue,
})

export const sendPracticeTutorMessage = action({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.runQuery(internal.tutor.getPracticeTutorThreadMapping, {
      practiceSessionId: args.practiceSessionId,
      studentId: args.studentId,
    })
    if (mapping == null) {
      throw new Error('Tutor thread not found for this practice session.')
    }

    const { thread } = await tutorAgent.continueThread(ctx, {
      threadId: mapping.threadId,
      userId: args.studentId,
    })
    const result = await thread.streamText(
      {
        prompt: args.prompt,
      },
      {
        storageOptions: {
          saveMessages: 'all',
        },
        saveStreamDeltas: true,
      },
    )

    return {
      promptMessageId: result.promptMessageId,
    }
  },
})
