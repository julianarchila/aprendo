import { Agent, extractText, listMessages, syncStreams, vStreamArgs, vStreamMessagesReturnValue } from '@convex-dev/agent'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { components } from './_generated/api'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import type { Doc, Id } from './_generated/dataModel'
import taxonomyContract from '../../../docs/taxonomy.v1.json'

const agentComponent = (components as Record<string, unknown>).agent as ConstructorParameters<typeof Agent>[0]

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
})

const BASE_TUTOR_INSTRUCTIONS = [
  'Eres un tutor breve y claro para estudiantes preparando Saber 11.',
  'Responde siempre en español.',
  'Ayuda con estrategias, explicaciones y orientación de estudio.',
  'No inventes detalles que no estén en el contexto proporcionado.',
].join(' ')

const tutorAgent = new Agent(agentComponent, {
  name: 'Tutor',
  languageModel: google('gemini-2.5-flash'),
  instructions: [
    BASE_TUTOR_INSTRUCTIONS,
    'Si no recibes contexto sobre la pregunta actual, dilo claramente y pide la información necesaria.',
  ].join(' '),
})

const subjectLabelById = new Map<string, string>(
  taxonomyContract.subjects.map((subject) => [subject.id, subject.label_es]),
)

const subtopicLabelById = new Map<string, string>(
  taxonomyContract.subjects.flatMap((subject) =>
    subject.categories.flatMap((category) =>
      category.subtopics.map((subtopic) => [subtopic.id, subtopic.label_es] as const),
    ),
  ),
)

type QuestionContext = {
  questionNumber: number
  subjectLabel: string
  subtopicLabel: string
  bodyMarkdown: string
  options: { label: string; bodyMarkdown: string }[]
  correctOption: string | null
  officialExplanation: string | null
  attempt: {
    selectedOption: string
    isCorrect: boolean
  } | null
}

function buildTutorSystemPrompt(question: QuestionContext | null): string {
  if (question == null) {
    return [
      BASE_TUTOR_INSTRUCTIONS,
      'No tienes contexto sobre una pregunta actual; pídeselo al estudiante si hace falta.',
    ].join(' ')
  }

  const lines: string[] = [BASE_TUTOR_INSTRUCTIONS, '', '## Pregunta actual']
  lines.push(`Asignatura: ${question.subjectLabel}`)
  lines.push(`Subtema: ${question.subtopicLabel}`)
  lines.push(`Número: ${question.questionNumber}`)
  lines.push('')
  lines.push('Enunciado:')
  lines.push(question.bodyMarkdown)
  lines.push('')
  lines.push('Opciones:')
  for (const option of question.options) {
    lines.push(`  ${option.label}) ${option.bodyMarkdown}`)
  }

  if (question.attempt != null) {
    const attemptResult = question.attempt.isCorrect ? 'correcta' : 'incorrecta'
    lines.push('')
    lines.push(`El estudiante ya respondió: ${question.attempt.selectedOption} (${attemptResult}).`)
    if (question.correctOption != null) {
      lines.push(`Respuesta correcta: ${question.correctOption}.`)
    }
    if (question.officialExplanation != null) {
      lines.push('Explicación oficial:')
      lines.push(question.officialExplanation)
    }
    lines.push('Puedes confirmar la respuesta correcta y explicar el razonamiento si el estudiante lo pide.')
  } else {
    lines.push('')
    lines.push('El estudiante AÚN NO ha respondido esta pregunta.')
    lines.push('NO reveles cuál es la respuesta correcta directamente.')
    lines.push('Guíalo con pistas y preguntas socráticas; ayúdalo a descartar opciones sin afirmar cuál es la correcta.')
  }

  return lines.join('\n')
}

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

export const clearPracticeTutorChat = mutation({
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
      throw new Error('Tutor thread not found for this practice session.')
    }

    const oldThreadId = mapping.threadId

    const { threadId: newThreadId } = await tutorAgent.createThread(ctx, {
      userId: args.studentId,
      title: `practice:${args.practiceSessionId}`,
    })

    const now = Date.now()
    await ctx.db.patch(mapping._id, {
      threadId: newThreadId,
      updatedAt: now,
    })

    // Recursively delete the old thread's messages + streams in the background.
    // The agent component schedules subsequent batches via the Convex scheduler,
    // so this returns quickly and the UI re-points to the new thread immediately.
    await tutorAgent.deleteThreadAsync(ctx, { threadId: oldThreadId })

    return { threadId: newThreadId }
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
    if (mapping == null) {
      throw new Error('Tutor thread not found for this practice session.')
    }
    // If the requested threadId doesn't match the current mapping, the client
    // is mid-transition (e.g. the chat was just cleared and the thread was
    // rotated). Return an empty page; the client will resubscribe with the new
    // threadId on the next reactive tick. Throwing here causes spurious errors.
    if (mapping.threadId !== args.threadId) {
      const emptyStreams = await syncStreams(ctx, agentComponent, {
        threadId: args.threadId,
        streamArgs: args.streamArgs,
      })
      return {
        page: [],
        isDone: true,
        continueCursor: '',
        streams: emptyStreams,
      }
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

export const getPracticeQuestionContext = internalQuery({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
    questionId: v.id('questions'),
  },
  handler: async (ctx, args): Promise<QuestionContext | null> => {
    await requireOwnedPracticeSession(ctx, args)

    const question = await ctx.db.get(args.questionId)
    if (question == null) return null

    const attempt = await ctx.db
      .query('questionAttempts')
      .withIndex('by_studentId_sessionId', (q) =>
        q.eq('studentId', args.studentId).eq('sessionId', args.practiceSessionId),
      )
      .filter((q) => q.eq(q.field('questionId'), args.questionId))
      .unique()

    const subjectLabel = question.subjectId
      ? subjectLabelById.get(question.subjectId) ?? question.subjectId
      : 'Sin asignar'
    const subtopicLabel = question.primarySubtopicId
      ? subtopicLabelById.get(question.primarySubtopicId) ?? question.primarySubtopicId
      : 'Sin subtema'

    const isAnswered = attempt != null && attempt.selectedOption != null && attempt.isCorrect != null

    return {
      questionNumber: question.questionNumber,
      subjectLabel,
      subtopicLabel,
      bodyMarkdown: question.bodyMarkdown,
      options: question.options.map((option) => ({
        label: option.label,
        bodyMarkdown: option.bodyMarkdown,
      })),
      correctOption: question.answerCorrectOption ?? null,
      officialExplanation: question.answerSolutionMarkdown ?? null,
      attempt: isAnswered
        ? {
            selectedOption: attempt!.selectedOption!,
            isCorrect: attempt!.isCorrect!,
          }
        : null,
    }
  },
})

export const sendPracticeTutorMessage = action({
  args: {
    practiceSessionId: v.id('sessions'),
    studentId: v.id('students'),
    prompt: v.string(),
    questionId: v.optional(v.id('questions')),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.runQuery(internal.tutor.getPracticeTutorThreadMapping, {
      practiceSessionId: args.practiceSessionId,
      studentId: args.studentId,
    })
    if (mapping == null) {
      throw new Error('Tutor thread not found for this practice session.')
    }

    const questionContext = args.questionId != null
      ? await ctx.runQuery(internal.tutor.getPracticeQuestionContext, {
          practiceSessionId: args.practiceSessionId,
          studentId: args.studentId,
          questionId: args.questionId,
        })
      : null

    const system = buildTutorSystemPrompt(questionContext)

    const { thread } = await tutorAgent.continueThread(ctx, {
      threadId: mapping.threadId,
      userId: args.studentId,
    })
    const result = await thread.streamText(
      {
        prompt: args.prompt,
        system,
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
