import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { extractText } from '@convex-dev/agent'
import { useThreadMessages } from '@convex-dev/agent/react'
import { api } from '@aprendo/convex/api'
import { useAction } from 'convex/react'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '../components/ai-elements/conversation.tsx'
import { Message, MessageContent } from '../components/ai-elements/message.tsx'
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from '../components/ai-elements/prompt-input.tsx'
import { Shimmer } from '../components/ai-elements/shimmer.tsx'
import { Suggestion, Suggestions } from '../components/ai-elements/suggestion.tsx'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.tsx'
import { practiceSessionQuery, practiceTutorThreadQuery, studentAppStateQuery } from '../lib/student-queries.ts'
import { useStoredStudentSession } from '../lib/student-session.ts'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy.ts'

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  streaming?: boolean
}

const TUTOR_SUGGESTIONS = [
  'Dame una pista',
  'Explica este tema',
  'Dame una estrategia',
  'Explica la respuesta correcta',
]

export const Route = createFileRoute('/practice')({
  component: PracticePage,
})

function PracticePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session, isReady } = useStoredStudentSession()
  const studentId = session?.studentId ?? null
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })

  const createPracticeSession = useConvexMutation(api.practice.createOrGetPracticeSession)
  const submitPracticeAnswer = useConvexMutation(api.practice.submitPracticeAnswer)
  const completePracticeSession = useConvexMutation(api.practice.completePracticeSession)
  const createTutorThread = useConvexMutation(api.tutor.createOrGetPracticeTutorThread)
  const sendTutorMessage = useAction(api.tutor.sendPracticeTutorMessage)

  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null)
  const [hasTriedSessionCreation, setHasTriedSessionCreation] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasSyncedInitialPosition, setHasSyncedInitialPosition] = useState(false)
  const [hasEnsuredTutorThread, setHasEnsuredTutorThread] = useState(false)
  const [tutorThreadError, setTutorThreadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [practiceOrientation, setPracticeOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  const questionStartedAtRef = useRef<number>(Date.now())

  const createSessionMutation = useMutation({
    mutationFn: async (studentId: string) => {
      return createPracticeSession({ studentId: studentId as never })
    },
    onMutate: () => setHasTriedSessionCreation(true),
    onSuccess: (sessionId) => setPracticeSessionId(sessionId),
  })

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isReady, navigate, session])

  useEffect(() => {
    if (!isReady || session == null || appStateQuery.data == null) return
    if (!appStateQuery.data.hasCompletedDiagnostic) {
      void navigate({ to: '/diagnostic' })
      return
    }
    if (
      practiceSessionId != null
      || createSessionMutation.isPending
      || hasTriedSessionCreation
    ) {
      return
    }
    createSessionMutation.mutate(session.studentId)
  }, [
    appStateQuery.data,
    createSessionMutation,
    hasTriedSessionCreation,
    isReady,
    navigate,
    practiceSessionId,
    session,
  ])

  const practiceQuery = useQuery({
    ...practiceSessionQuery(practiceSessionId),
    enabled: practiceSessionId != null,
  })

  const practice = practiceQuery.data
  const questions = practice?.questions ?? []
  const tutorThreadQuery = useQuery({
    ...practiceTutorThreadQuery(practiceSessionId, studentId),
    enabled: practiceSessionId != null && hasEnsuredTutorThread,
  })
  const tutorThreadId = tutorThreadQuery.data?.threadId ?? null
  const tutorMessagesResult = useThreadMessages(
    api.tutor.listPracticeTutorMessages,
    tutorThreadId == null || practiceSessionId == null || studentId == null
      ? 'skip'
      : {
        practiceSessionId: practiceSessionId as never,
        studentId: studentId as never,
        threadId: tutorThreadId,
      },
    {
      initialNumItems: 50,
      stream: true,
    },
  )

  useEffect(() => {
    if (practiceSessionId == null) {
      setHasSyncedInitialPosition(false)
      setHasEnsuredTutorThread(false)
      setTutorThreadError(null)
    }
  }, [practiceSessionId])

  useEffect(() => {
    if (practice?.session == null || hasSyncedInitialPosition) return
    setCurrentIndex(Math.max(0, practice.session.currentPosition - 1))
    setHasSyncedInitialPosition(true)
  }, [hasSyncedInitialPosition, practice?.session])

  useEffect(() => {
    if (practice?.session == null || studentId == null || hasEnsuredTutorThread || createSessionMutation.isPending) return

    createTutorThread({
      practiceSessionId: practice.session._id,
      studentId: studentId as never,
    })
      .then(() => {
        setHasEnsuredTutorThread(true)
        setTutorThreadError(null)
      })
      .catch((error: unknown) => {
        console.error('Failed to create tutor thread:', error)
        setHasEnsuredTutorThread(true)
        setTutorThreadError(
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar el tutor.',
        )
      })
  }, [
    createSessionMutation.isPending,
    createTutorThread,
    hasEnsuredTutorThread,
    practice?.session,
    studentId,
  ])

  useEffect(() => {
    questionStartedAtRef.current = Date.now()
  }, [currentIndex])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(max-width: 1200px)')
    const syncOrientation = () => {
      setPracticeOrientation(media.matches ? 'vertical' : 'horizontal')
    }

    syncOrientation()
    media.addEventListener('change', syncOrientation)

    return () => {
      media.removeEventListener('change', syncOrientation)
    }
  }, [])

  const answerMutation = useMutation({
    mutationFn: async (selectedOption: string) => {
      const currentQuestion = questions[currentIndex]
      if (practice?.session == null || currentQuestion == null) {
        throw new Error('Question not loaded.')
      }
      return submitPracticeAnswer({
        sessionId: practice.session._id,
        sessionQuestionId: currentQuestion.sessionQuestionId as never,
        selectedOption,
        responseTimeMs: Date.now() - questionStartedAtRef.current,
      })
    },
    onSuccess: async () => {
      if (practiceSessionId == null) return
      await queryClient.invalidateQueries({
        queryKey: practiceSessionQuery(practiceSessionId).queryKey,
      })
    },
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (practice?.session == null) throw new Error('Practice session not loaded.')
      return completePracticeSession({ sessionId: practice.session._id })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await navigate({ to: '/progress' })
    },
  })

  const tutorMutation = useMutation({
    mutationFn: async (prompt: string) => {
      if (practice?.session == null || studentId == null) {
        throw new Error('Practice session not loaded.')
      }
      return sendTutorMessage({
        practiceSessionId: practice.session._id,
        studentId: studentId as never,
        prompt,
      })
    },
    onSuccess: async () => {
      if (practiceSessionId == null) return
      await queryClient.invalidateQueries({
        queryKey: practiceTutorThreadQuery(practiceSessionId, studentId).queryKey,
      })
    },
  })

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  if (createSessionMutation.error && practiceSessionId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="fade-in w-full max-w-xl">
          <div className="card p-8">
            <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
              No pudimos preparar tu practica
            </h2>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              {createSessionMutation.error instanceof Error
                ? createSessionMutation.error.message
                : 'La creacion de la sesion de practica fallo.'}
            </p>
            <button
              type="button"
              onClick={() => {
                createSessionMutation.reset()
                setHasTriedSessionCreation(false)
                createSessionMutation.mutate(session.studentId)
              }}
              className="btn-primary"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (createSessionMutation.isPending || practiceQuery.isPending || practice == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Preparando tu practica...</p>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]

  if (currentQuestion == null) {
    return (
      <StudentAppShell
        session={session}
        activeSection="practice"
        mainClassName="student-shell-main-immersive"
      >
        <div className="fade-in mx-auto max-w-xl">
          <div className="card p-8">
            <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
              No hay preguntas de practica disponibles
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Completa mas carga de contenido o revisa el inventario elegible para practica.
            </p>
          </div>
        </div>
      </StudentAppShell>
    )
  }

  const answeredCount = questions.filter((question) => question.attempt != null).length
  const selectedOption = currentQuestion.attempt?.selectedOption ?? null
  const hasAnswered = selectedOption != null
  const tutorMessages: ChatMessage[] = tutorMessagesResult.results.flatMap((message) => {
    if (message.message == null) return []
    if (message.message.role !== 'user' && message.message.role !== 'assistant') return []

    const content = extractText(message.message)?.trim() ?? ''
    if (content.length === 0) return []

    return [{
      id: message.key,
      role: message.message.role as ChatRole,
      content,
      streaming: message.streaming === true,
    }]
  })
  const lastMessage = tutorMessages.at(-1)
  const isTutorThinking = tutorMutation.isPending
    && (lastMessage?.role !== 'assistant' || lastMessage?.streaming !== true)
  const canSendTutorMessage = tutorThreadError == null
    && tutorThreadId != null
    && !tutorMutation.isPending
  const sendTutorPrompt = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !canSendTutorMessage) return
    tutorMutation.mutate(trimmed)
    setDraft('')
  }

  return (
    <StudentAppShell
      session={session}
      activeSection="practice"
      mainClassName="student-shell-main-immersive"
    >
      <ResizablePanelGroup
        orientation={practiceOrientation}
        className="practice-workspace fade-in"
      >
        <ResizablePanel
          defaultSize={practiceOrientation === 'horizontal' ? 67 : 62}
          minSize={45}
          className="practice-panel"
        >
          <section className="practice-stage card">
            <div className="practice-stage-header">
              <div className="practice-stage-meta">
                <p className="practice-stage-kicker">Practica actual</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-accent">{getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}</span>
                  <span className="chip">{getSubtopicLabel(currentQuestion.question.primarySubtopicId ?? 'sin_subtema')}</span>
                </div>
              </div>

              <div className="practice-stage-counter">
                <span>Pregunta</span>
                <strong>{currentIndex + 1} / {questions.length}</strong>
              </div>
            </div>

            <div className="practice-progress-strip">
              <div
                className="practice-progress-value"
                style={{ width: `${questions.length === 0 ? 0 : (answeredCount / questions.length) * 100}%` }}
              />
            </div>

            <div className="practice-stage-body">
              <div className="practice-question-card">
                <div className="practice-question-copy">
                  <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
                </div>

                <div className="practice-options-grid">
                  {currentQuestion.question.options.map((option) => {
                    const isSelected = selectedOption === option.label
                    const isCorrect = hasAnswered && option.label === currentQuestion.question.answerCorrectOption
                    const isIncorrect = hasAnswered && isSelected && option.label !== currentQuestion.question.answerCorrectOption

                    return (
                      <button
                        key={option.label}
                        type="button"
                        disabled={hasAnswered || answerMutation.isPending || completeMutation.isPending}
                        onClick={() => answerMutation.mutate(option.label)}
                        className={[
                          'option-card practice-option',
                          isSelected ? 'is-selected' : '',
                          isCorrect ? 'is-correct' : '',
                          isIncorrect ? 'is-incorrect' : '',
                        ].join(' ')}
                      >
                        <span className="option-label">{option.label}</span>
                        <span className="min-w-0 flex-1 text-left">
                          <MarkdownBlock markdown={option.bodyMarkdown} />
                          {isCorrect ? <span className="practice-option-meta is-correct">Respuesta correcta</span> : null}
                          {isIncorrect ? <span className="practice-option-meta is-incorrect">Tu respuesta</span> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>

              </div>
            </div>

            <div className="practice-stage-footer">
              <div className="practice-footer-spacer" />

              <div className="practice-footer-nav">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                  disabled={currentIndex === 0}
                  className="btn-ghost"
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="btn-primary"
                >
                  Siguiente
                  <ChevronRight size={18} />
                </button>

                <button
                  type="button"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate()}
                  className="btn-secondary"
                >
                  {completeMutation.isPending ? 'Cerrando...' : 'Terminar practica'}
                </button>
              </div>
            </div>

            {answerMutation.error ? (
              <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-accent)] bg-[var(--accent-soft)] p-4 text-sm font-medium text-[var(--accent-text)]">
                {answerMutation.error instanceof Error ? answerMutation.error.message : 'No se pudo guardar la respuesta.'}
              </div>
            ) : null}
            {completeMutation.error ? (
              <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-accent)] bg-[var(--accent-soft)] p-4 text-sm font-medium text-[var(--accent-text)]">
                {completeMutation.error instanceof Error ? completeMutation.error.message : 'No se pudo completar la practica.'}
              </div>
            ) : null}
          </section>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          defaultSize={practiceOrientation === 'horizontal' ? 33 : 38}
          minSize={22}
          className="practice-panel"
        >
          <aside className="practice-tutor card stagger-1">
            <div className="practice-tutor-header practice-tutor-header-compact">
              <div className="practice-panel-title-group practice-panel-title-group-inline">
                <span className="practice-section-icon">
                  <Bot size={18} />
                </span>
                <h2 className="practice-tutor-title">Tutor</h2>
              </div>
              <span className="practice-tutor-status">
                <Sparkles size={14} />
                Basico
              </span>
            </div>

            <Conversation className="practice-thread practice-thread-compact rounded-none border-0 bg-transparent">
              <ConversationContent className="gap-3 px-0 py-2">
                {tutorMessages.length === 0 ? (
                  <ConversationEmptyState
                    className="gap-2 p-4"
                    icon={
                      <span className="practice-section-icon">
                        <Bot size={18} />
                      </span>
                    }
                    title="Pregunta lo que necesites"
                    description="Puedo darte pistas, explicar un tema o sugerir estrategias. No revelare la respuesta antes de que intentes la pregunta."
                  />
                ) : (
                  tutorMessages.map((message) => (
                    <Message
                      key={message.id}
                      from={message.role}
                      className={
                        message.role === 'assistant'
                          ? 'flex-row items-start gap-2'
                          : undefined
                      }
                    >
                      {message.role === 'assistant' ? (
                        <span className="practice-avatar mt-1" aria-hidden>
                          <Bot size={14} />
                        </span>
                      ) : null}
                      <MessageContent
                        className={
                          message.role === 'user'
                            ? 'group-[.is-user]:bg-[var(--accent-soft)] group-[.is-user]:border group-[.is-user]:border-[var(--border-accent)] group-[.is-user]:text-[var(--text-primary)]'
                            : 'min-w-0 flex-1 text-[var(--text-primary)]'
                        }
                      >
                        <MarkdownBlock markdown={message.content} />
                      </MessageContent>
                    </Message>
                  ))
                )}
                {isTutorThinking ? (
                  <Message from="assistant" className="flex-row items-center gap-2">
                    <span className="practice-avatar" aria-hidden>
                      <Bot size={14} />
                    </span>
                    <MessageContent className="min-w-0 flex-1 text-[var(--text-secondary)]">
                      <Shimmer className="text-sm">Pensando...</Shimmer>
                    </MessageContent>
                  </Message>
                ) : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <PromptInput
              className="mt-auto px-4 pb-3"
              onSubmit={(message) => sendTutorPrompt(message.text)}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escribe un mensaje para el tutor..."
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <Suggestions className="gap-1.5">
                    {TUTOR_SUGGESTIONS.map((suggestion) => (
                      <Suggestion
                        key={suggestion}
                        suggestion={suggestion}
                        disabled={!canSendTutorMessage}
                        onClick={(value) => sendTutorPrompt(value)}
                      />
                    ))}
                  </Suggestions>
                </PromptInputTools>
                <PromptInputSubmit
                  type="submit"
                  status={tutorMutation.isPending ? 'streaming' : 'ready'}
                  disabled={!canSendTutorMessage || draft.trim().length === 0}
                  aria-label="Enviar mensaje"
                />
              </PromptInputFooter>
            </PromptInput>
            {tutorThreadError ? (
              <div className="px-4 pb-2 text-sm font-medium text-[var(--accent-text)]">
                {tutorThreadError}
              </div>
            ) : null}
            {tutorMutation.error ? (
              <div className="px-4 pb-4 text-sm font-medium text-[var(--accent-text)]">
                {tutorMutation.error instanceof Error ? tutorMutation.error.message : 'No se pudo enviar el mensaje al tutor.'}
              </div>
            ) : null}
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </StudentAppShell>
  )
}
