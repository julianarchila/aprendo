import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, SendHorizontal, Sparkles } from 'lucide-react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.tsx'
import { practiceSessionQuery, studentAppStateQuery } from '../lib/student-queries.ts'
import { useStoredStudentSession } from '../lib/student-session.ts'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy.ts'

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Tutor en simulacion. La UI ya esta lista y la conectaremos en la siguiente fase.',
  },
]

const PRE_ANSWER_PROMPTS = [
  'Dame una pista',
  'Aclara el enunciado',
  'Como empiezo',
]

const POST_ANSWER_PROMPTS = [
  'Explicame la respuesta',
  'Por que mi opcion no era',
  'Dame un problema similar',
]

export const Route = createFileRoute('/practice')({
  component: PracticePage,
})

function PracticePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session, isReady } = useStoredStudentSession()
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })

  const createPracticeSession = useConvexMutation(api.practice.createOrGetPracticeSession)
  const submitPracticeAnswer = useConvexMutation(api.practice.submitPracticeAnswer)
  const completePracticeSession = useConvexMutation(api.practice.completePracticeSession)

  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null)
  const [hasTriedSessionCreation, setHasTriedSessionCreation] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasSyncedInitialPosition, setHasSyncedInitialPosition] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT)
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

  useEffect(() => {
    if (practiceSessionId == null) {
      setHasSyncedInitialPosition(false)
    }
  }, [practiceSessionId])

  useEffect(() => {
    if (practice?.session == null || hasSyncedInitialPosition) return
    setCurrentIndex(Math.max(0, practice.session.currentPosition - 1))
    setHasSyncedInitialPosition(true)
  }, [hasSyncedInitialPosition, practice?.session])

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
  const prompts = hasAnswered ? POST_ANSWER_PROMPTS : PRE_ANSWER_PROMPTS
  const activeQuestion = currentQuestion

  function pushAssistantReply(content: string) {
    setChatMessages((current) => [
      ...current,
      {
        id: `assistant-${current.length + 1}`,
        role: 'assistant',
        content,
      },
    ])
  }

  function handlePrompt(prompt: string) {
    setChatMessages((current) => [
      ...current,
      {
        id: `user-${current.length + 1}`,
        role: 'user',
        content: prompt,
      },
    ])

    if (prompt === 'Dame una pista') {
      pushAssistantReply('Pista simulada. En la siguiente fase esta accion consultara el tutor real con el contexto de esta pregunta.')
      return
    }
    if (prompt === 'Aclara el enunciado') {
      pushAssistantReply('Aclaracion simulada. La UI ya esta preparada para conectar respuestas contextuales mas adelante.')
      return
    }
    if (prompt === 'Como empiezo') {
      pushAssistantReply('Inicio sugerido simulado. Por ahora enfocate en identificar que dato o relacion intenta evaluar la pregunta.')
      return
    }
    if (prompt === 'Explicame la respuesta') {
      pushAssistantReply(
        activeQuestion.question.answerSolutionMarkdown
          ?? 'Todavia no hay una explicacion detallada disponible para esta pregunta.',
      )
      return
    }
    if (prompt === 'Por que mi opcion no era') {
      pushAssistantReply('Respuesta simulada. En la siguiente fase el tutor comparara tu opcion con la correcta.')
      return
    }

    pushAssistantReply('Generacion de ejercicio similar simulada. Lo conectaremos despues del MVP de practica.')
  }

  function handleSendMessage() {
    const content = draft.trim()
    if (!content) return

    setChatMessages((current) => [
      ...current,
      {
        id: `user-${current.length + 1}`,
        role: 'user',
        content,
      },
      {
        id: `assistant-${current.length + 2}`,
        role: 'assistant',
        content: 'Tutor en simulacion. Esta caja sigue siendo local y no guarda estado en backend todavia.',
      },
    ])
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
            <div className="practice-tutor-header">
              <div className="practice-panel-title-group">
                <span className="practice-section-icon">
                  <Bot size={18} />
                </span>
                <div>
                  <p className="kicker">Tutor</p>
                  <h2 className="practice-tutor-title">Interfaz simulada</h2>
                </div>
              </div>
              <span className="practice-tutor-status">
                <Sparkles size={14} />
                Proximamente
              </span>
            </div>

            <div className="practice-prompt-row">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePrompt(prompt)}
                  className="practice-prompt-chip"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="practice-thread practice-thread-compact">
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={[
                    'practice-message',
                    message.role === 'assistant' ? 'is-assistant' : 'is-user',
                  ].join(' ')}
                >
                  {message.role === 'assistant' ? (
                    <span className="practice-avatar">
                      <Sparkles size={14} />
                    </span>
                  ) : null}
                  <div className="practice-bubble">
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="practice-composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                className="practice-textarea"
                placeholder="Esta conversacion sigue siendo local por ahora..."
              />
              <button
                type="button"
                onClick={handleSendMessage}
                className="practice-send-button"
                aria-label="Enviar mensaje"
              >
                <SendHorizontal size={18} />
              </button>
            </div>
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </StudentAppShell>
  )
}
