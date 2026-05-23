import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  Sparkles,
  SquarePlay,
  Trash2,
} from 'lucide-react'
import { extractText } from '@convex-dev/agent'
import { useThreadMessages } from '@convex-dev/agent/react'
import { api } from '@aprendo/convex/api'
import type { Id } from '@aprendo/convex/dataModel'
import { useAction } from 'convex/react'
import { ArtifactPane } from '../components/ArtifactPane.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '../components/ai-elements/conversation.tsx'
import { Message, MessageContent } from '../components/ai-elements/message.tsx'
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '../components/ai-elements/prompt-input.tsx'
import { Shimmer } from '../components/ai-elements/shimmer.tsx'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable.tsx'
import { practiceSessionQuery, practiceTutorThreadQuery, studentAppStateQuery } from '../lib/student-queries.ts'
import { useCurrentStudent } from '../lib/student-session.ts'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy.ts'

type ChatRole = 'assistant' | 'user'

type ArtifactRef = {
  artifactId: Id<'practiceTutorArtifacts'>
  title: string
  description?: string
}

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  streaming?: boolean
  artifactRef?: ArtifactRef
  artifactPending?: boolean
}

const TUTOR_COLLAPSED_STORAGE_KEY = 'aprendo:practice:tutor-collapsed'
const LAYOUT_STORAGE_KEY = 'aprendo:practice:workspace-layout-v2'
const STAGE_PANEL_ID = 'aprendo-practice-stage'
const TUTOR_PANEL_ID = 'aprendo-practice-tutor'
const ARTIFACT_PANEL_ID = 'aprendo-practice-artifact'
const QUICK_PROMPTS = [
  'Explícame la respuesta',
  'Dame un problema similar',
  '¿Qué debo repasar?',
] as const

function readStoredLayout(): { [id: string]: number } | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as { [id: string]: number }
  } catch {
    // ignore
  }
  return undefined
}

export const Route = createFileRoute('/practice/$sessionId/review')({
  component: PracticePage,
})

function PracticePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sessionId } = Route.useParams()
  const { session, isReady } = useCurrentStudent()
  const studentId = session?.studentId ?? null
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })

  const submitPracticeAnswer = useConvexMutation(api.practice.submitPracticeAnswer)
  const completePracticeSession = useConvexMutation(api.practice.completePracticeSession)
  const createTutorThread = useConvexMutation(api.tutor.createOrGetPracticeTutorThread)
  const clearTutorChat = useConvexMutation(api.tutor.clearPracticeTutorChat)
  const sendTutorMessage = useAction(api.tutor.sendPracticeTutorMessage)

  const practiceSessionId = sessionId
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasSyncedInitialPosition, setHasSyncedInitialPosition] = useState(false)
  const [hasEnsuredTutorThread, setHasEnsuredTutorThread] = useState(false)
  const [tutorThreadError, setTutorThreadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [practiceOrientation, setPracticeOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  const [isCompactViewport, setIsCompactViewport] = useState(false)
  const [isWideViewport, setIsWideViewport] = useState(false)
  const [isTutorSheetOpen, setIsTutorSheetOpen] = useState(false)
  const [isTutorCollapsed, setIsTutorCollapsed] = useState(false)
  const [openArtifactId, setOpenArtifactId] = useState<Id<'practiceTutorArtifacts'> | null>(null)
  const questionStartedAtRef = useRef<number>(Date.now())
  const storedLayoutRef = useRef<{ [id: string]: number } | undefined>(undefined)
  if (storedLayoutRef.current === undefined && typeof window !== 'undefined') {
    storedLayoutRef.current = readStoredLayout()
  }

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
  }, [
    appStateQuery.data,
    isReady,
    navigate,
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
    setCurrentIndex(0)
    setHasSyncedInitialPosition(true)
  }, [hasSyncedInitialPosition, practice?.session])

  useEffect(() => {
    if (practice?.session == null || studentId == null || hasEnsuredTutorThread) return

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
    createTutorThread,
    hasEnsuredTutorThread,
    practice?.session,
    studentId,
  ])

  useEffect(() => {
    if (practice?.session != null && practice.session.status !== 'completed') {
      void navigate({ to: '/practice/$sessionId', params: { sessionId } })
    }
  }, [navigate, practice?.session, sessionId])

  useEffect(() => {
    questionStartedAtRef.current = Date.now()
  }, [currentIndex])

  // Hydrate the persisted tutor-collapsed state once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(TUTOR_COLLAPSED_STORAGE_KEY)
    if (stored === '1') setIsTutorCollapsed(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const compactMedia = window.matchMedia('(max-width: 1024px)')
    const tabletMedia = window.matchMedia('(max-width: 1200px)')
    const wideMedia = window.matchMedia('(min-width: 1200px)')
    const sync = () => {
      setIsCompactViewport(compactMedia.matches)
      setPracticeOrientation(tabletMedia.matches ? 'vertical' : 'horizontal')
      setIsWideViewport(wideMedia.matches)
    }

    sync()
    compactMedia.addEventListener('change', sync)
    tabletMedia.addEventListener('change', sync)
    wideMedia.addEventListener('change', sync)

    return () => {
      compactMedia.removeEventListener('change', sync)
      tabletMedia.removeEventListener('change', sync)
      wideMedia.removeEventListener('change', sync)
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
      setHasSyncedInitialPosition(false)
      setCurrentIndex(0)
    },
  })

  const clearTutorMutation = useMutation({
    mutationFn: async () => {
      if (practice?.session == null || studentId == null) {
        throw new Error('Practice session not loaded.')
      }
      return clearTutorChat({
        practiceSessionId: practice.session._id,
        studentId: studentId as never,
      })
    },
    onSuccess: async () => {
      if (practiceSessionId == null) return
      await queryClient.invalidateQueries({
        queryKey: practiceTutorThreadQuery(practiceSessionId, studentId).queryKey,
      })
    },
  })

  const tutorMutation = useMutation({
    mutationFn: async (input: { prompt: string; questionId?: string }) => {
      if (practice?.session == null || studentId == null) {
        throw new Error('Practice session not loaded.')
      }
      return sendTutorMessage({
        practiceSessionId: practice.session._id,
        studentId: studentId as never,
        prompt: input.prompt,
        questionId: input.questionId as never | undefined,
      })
    },
    onSuccess: async () => {
      if (practiceSessionId == null) return
      await queryClient.invalidateQueries({
        queryKey: practiceTutorThreadQuery(practiceSessionId, studentId).queryKey,
      })
    },
  })

  const persistTutorCollapsed = useCallback((collapsed: boolean) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TUTOR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  }, [])

  const expandTutor = useCallback(() => {
    setIsTutorCollapsed(false)
    persistTutorCollapsed(false)
  }, [persistTutorCollapsed])

  const collapseTutor = useCallback(() => {
    setIsTutorCollapsed(true)
    persistTutorCollapsed(true)
  }, [persistTutorCollapsed])

  const toggleTutor = useCallback(() => {
    if (isCompactViewport) {
      setIsTutorSheetOpen((open) => !open)
      return
    }
    setIsTutorCollapsed((prev) => {
      const next = !prev
      persistTutorCollapsed(next)
      return next
    })
  }, [isCompactViewport, persistTutorCollapsed])

  const focusTutorInput = useCallback(() => {
    if (isCompactViewport) {
      setIsTutorSheetOpen(true)
    } else if (isTutorCollapsed) {
      expandTutor()
    }
    requestAnimationFrame(() => {
      if (typeof document === 'undefined') return
      const node = document.querySelector<HTMLTextAreaElement>('[data-tutor-input]')
      node?.focus()
    })
  }, [expandTutor, isCompactViewport, isTutorCollapsed])

  // Keyboard shortcuts. Active everywhere except inside text inputs (with a
  // small carve-out for ⌘/Ctrl + K and ⌘/Ctrl + \ which work globally).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const target = event.target as HTMLElement | null
      const isTyping = !!target && (
        target.tagName === 'TEXTAREA'
        || target.tagName === 'INPUT'
        || target.isContentEditable
      )

      const isModified = event.metaKey || event.ctrlKey
      if (isModified && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        focusTutorInput()
        return
      }
      if (isModified && !event.shiftKey && !event.altKey && event.key === '\\') {
        event.preventDefault()
        toggleTutor()
        return
      }

      if (isTyping) return

      if (event.key === 'ArrowLeft') {
        setCurrentIndex((value) => Math.max(0, value - 1))
        return
      }
      if (event.key === 'ArrowRight') {
        setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))
        return
      }

      const upper = event.key.toUpperCase()
      if (upper.length === 1 && upper >= 'A' && upper <= 'Z') {
        if (practice?.session.status === 'completed') return
        const current = questions[currentIndex]
        if (current == null) return
        if (current.attempt != null) return
        const match = current.question.options.find((option) => option.label === upper)
        if (match != null) {
          event.preventDefault()
          answerMutation.mutate(match.label)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [answerMutation, currentIndex, focusTutorInput, practice?.session.status, questions, toggleTutor])

  const tutorMessages: ChatMessage[] = useMemo(() => {
    // First pass: collect tool-result outputs keyed by toolCallId so we can
    // attach the resulting artifactId/title/description back onto the
    // assistant message that called the tool.
    const artifactByToolCallId = new Map<string, ArtifactRef>()
    for (const message of tutorMessagesResult.results) {
      const inner = message.message
      if (inner == null || inner.role !== 'tool') continue
      const content = inner.content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (
          part != null
          && typeof part === 'object'
          && 'type' in part
          && part.type === 'tool-result'
          && 'toolName' in part
          && part.toolName === 'create_artifact'
        ) {
          const output = (part as { output?: { type?: string; value?: unknown } }).output
          if (output != null && output.type === 'json' && output.value != null && typeof output.value === 'object') {
            const value = output.value as {
              artifactId?: string
              title?: string
              description?: string
            }
            if (typeof value.artifactId === 'string' && typeof value.title === 'string') {
              artifactByToolCallId.set((part as { toolCallId: string }).toolCallId, {
                artifactId: value.artifactId as Id<'practiceTutorArtifacts'>,
                title: value.title,
                description: value.description,
              })
            }
          }
        }
      }
    }

    return tutorMessagesResult.results.flatMap((message) => {
      const inner = message.message
      if (inner == null) return []
      if (inner.role !== 'user' && inner.role !== 'assistant') return []

      // Detect a create_artifact tool-call part on the assistant message and
      // attach the matching artifactRef (if the tool result has arrived) or
      // mark the message as pending the artifact.
      let artifactRef: ArtifactRef | undefined
      let artifactPending = false
      if (inner.role === 'assistant' && Array.isArray(inner.content)) {
        for (const part of inner.content) {
          if (
            part != null
            && typeof part === 'object'
            && 'type' in part
            && part.type === 'tool-call'
            && 'toolName' in part
            && part.toolName === 'create_artifact'
          ) {
            const toolCallId = (part as { toolCallId: string }).toolCallId
            const ref = artifactByToolCallId.get(toolCallId)
            if (ref != null) {
              artifactRef = ref
            } else {
              artifactPending = true
            }
            break
          }
        }
      }

      const content = extractText(inner)?.trim() ?? ''
      if (content.length === 0 && artifactRef == null && !artifactPending) return []

      return [{
        id: message.key,
        role: inner.role as ChatRole,
        content,
        streaming: message.streaming === true,
        artifactRef,
        artifactPending,
      }]
    })
  }, [tutorMessagesResult.results])

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  if (practiceQuery.isPending || practice == null) {
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
  const isReviewMode = practice.session.status === 'completed'
  const canFinishPractice = answeredCount === questions.length
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1

  const lastMessage = tutorMessages.at(-1)
  const isTutorThinking = tutorMutation.isPending
    && (lastMessage?.role !== 'assistant' || lastMessage?.streaming !== true)
  const canSendTutorMessage = tutorThreadError == null
    && tutorThreadId != null
    && !tutorMutation.isPending
  const sendTutorPrompt = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !canSendTutorMessage) return
    tutorMutation.mutate({
      prompt: trimmed,
      questionId: currentQuestion.question._id,
    })
    setDraft('')
    if (isCompactViewport) setIsTutorSheetOpen(true)
  }
  const canClearTutorChat = tutorThreadError == null
    && tutorThreadId != null
    && tutorMessages.length > 0
    && !tutorMutation.isPending
    && !clearTutorMutation.isPending
  const handleClearTutorChat = () => {
    if (!canClearTutorChat) return
    if (typeof window !== 'undefined'
      && !window.confirm('¿Borrar la conversación con el tutor? Esta acción no se puede deshacer.')) {
      return
    }
    clearTutorMutation.mutate()
  }

  const goPrev = () => setCurrentIndex((value) => Math.max(0, value - 1))
  const goNext = () => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))

  const stage = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label="Pregunta de práctica">
      <header className="stage-rail">
        <div className="flex min-w-0 flex-1 items-center gap-[0.55rem] overflow-hidden">
          <span className="stage-kicker">
            {isReviewMode ? 'Revisión' : 'Pregunta'} {currentIndex + 1} <span className="stage-kicker-sep">·</span> {questions.length}
          </span>
          <div className="inline-flex min-w-0 items-center gap-[0.4rem]">
            <span className="chip chip-accent">{getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}</span>
            <span
              className="chip max-w-[clamp(8rem,28vw,22rem)] overflow-hidden text-ellipsis whitespace-nowrap"
              title={getSubtopicLabel(currentQuestion.question.primarySubtopicId ?? 'sin_subtema')}
            >
              {getSubtopicLabel(currentQuestion.question.primarySubtopicId ?? 'sin_subtema')}
            </span>
          </div>
        </div>

        <div className="inline-flex shrink-0 items-center gap-2">
          <span className="mr-[0.15rem] inline-flex items-baseline gap-[0.4rem] whitespace-nowrap" aria-live="polite">
            <strong className="font-display text-[0.95rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              {answeredCount}
              <span className="font-medium text-[var(--text-tertiary)]">/{questions.length}</span>
            </strong>
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[var(--text-tertiary)] max-lg:hidden">
              resueltas
            </span>
          </span>
          {isReviewMode ? (
            <button
              type="button"
              onClick={() => navigate({ to: '/progress' })}
              className="stage-finish"
            >
              Progreso
            </button>
          ) : (
            <button
              type="button"
              disabled={!canFinishPractice || completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
              className="stage-finish"
              title={canFinishPractice ? 'Terminar práctica' : 'Responde todas las preguntas para terminar'}
            >
              {completeMutation.isPending ? 'Cerrando...' : 'Terminar'}
            </button>
          )}
        </div>
      </header>

      <nav className="stage-palette" aria-label="Mapa de preguntas">
        {questions.map((question, index) => {
          const attempt = question.attempt
          const isCurrent = index === currentIndex
          const status = !isReviewMode || attempt == null
            ? attempt == null ? 'pending' : 'answered'
            : attempt.isCorrect
              ? 'correct'
              : 'incorrect'
          const stateClass = [
            'palette-dot',
            `is-${status}`,
            isCurrent ? 'is-current' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={question.sessionQuestionId}
              type="button"
              className={stateClass}
              onClick={() => setCurrentIndex(index)}
              aria-label={`Ir a la pregunta ${index + 1}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="palette-dot-index">{index + 1}</span>
            </button>
          )
        })}
      </nav>

      <div className="relative flex min-h-0 flex-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirstQuestion}
          className="stage-edge-nav stage-edge-nav-prev"
          aria-label="Pregunta anterior"
          title="Pregunta anterior (←)"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-4">
        <article className="stage-question">
          <div className="stage-question-body">
            <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
          </div>

          <div className="grid grid-cols-1 gap-[0.65rem] lg:grid-cols-2">
            {currentQuestion.question.options.map((option) => {
              const isSelected = selectedOption === option.label
              const isCorrect = isReviewMode && option.label === currentQuestion.question.answerCorrectOption
              const isIncorrect = isReviewMode && hasAnswered && isSelected && option.label !== currentQuestion.question.answerCorrectOption

              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={isReviewMode || hasAnswered || answerMutation.isPending || completeMutation.isPending}
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
                    {isReviewMode && isCorrect ? <span className="practice-option-meta is-correct">Respuesta correcta</span> : null}
                    {isReviewMode && isIncorrect ? <span className="practice-option-meta is-incorrect">Tu respuesta</span> : null}
                    {!isReviewMode && isSelected ? <span className="practice-option-meta">Respuesta guardada</span> : null}
                  </span>
                </button>
              )
            })}
          </div>

          {isReviewMode && currentQuestion.question.answerSolutionMarkdown ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-4">
              <p className="kicker mb-2">Explicación</p>
              <MarkdownBlock markdown={currentQuestion.question.answerSolutionMarkdown} />
            </div>
          ) : null}

          {answerMutation.error ? (
            <div className="stage-alert">
              {answerMutation.error instanceof Error ? answerMutation.error.message : 'No se pudo guardar la respuesta.'}
            </div>
          ) : null}
          {completeMutation.error ? (
            <div className="stage-alert">
              {completeMutation.error instanceof Error ? completeMutation.error.message : 'No se pudo completar la practica.'}
            </div>
          ) : null}

          <p className="stage-shortcuts" aria-hidden>
            <kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd>
            <span>responder</span>
            <span className="stage-shortcuts-sep">·</span>
            <kbd>←</kbd><kbd>→</kbd>
            <span>navegar</span>
            <span className="stage-shortcuts-sep">·</span>
            <kbd>⌘</kbd><kbd>K</kbd>
            <span>tutor</span>
          </p>
        </article>
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={isLastQuestion}
          className="stage-edge-nav stage-edge-nav-next"
          aria-label="Pregunta siguiente"
          title="Pregunta siguiente (→)"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  )

  const tutor = (
    <aside className="tutor" aria-label="Tutor de práctica">
      <header className="tutor-header">
        <div className="inline-flex items-center gap-[0.6rem]">
          <span className="tutor-avatar" aria-hidden>
            <Bot size={15} />
          </span>
          <div className="flex flex-col leading-none">
            <span className="tutor-title">Tutor</span>
            <span className="tutor-subtitle">
              <Sparkles size={10} /> nivel básico
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearTutorChat}
            disabled={!canClearTutorChat}
            title="Borrar conversación"
            aria-label="Borrar conversación"
            className="tutor-icon-btn"
          >
            <Trash2 size={14} />
          </button>
          {!isCompactViewport ? (
            <button
              type="button"
              onClick={collapseTutor}
              title="Ocultar tutor (⌘\\)"
              aria-label="Ocultar tutor"
              className="tutor-icon-btn"
            >
              <PanelRightClose size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsTutorSheetOpen(false)}
              aria-label="Cerrar"
              className="tutor-icon-btn"
            >
              <PanelRightClose size={14} />
            </button>
          )}
        </div>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-[0.85rem] px-[0.95rem] pt-4 pb-2">
          {tutorMessages.length === 0 ? (
            <ConversationEmptyState
              className="items-stretch gap-[0.7rem] px-[1.1rem] pt-[1.6rem] pb-4 text-left"
              icon={null}
            >
              <div className="tutor-empty-mark" aria-hidden>
                <Bot size={20} />
              </div>
              <h3 className="tutor-empty-title">Pregunta lo que necesites.</h3>
              <p className="tutor-empty-copy">
                Puedo darte pistas, explicar el tema o sugerir estrategias —
                sin revelar la respuesta antes de que lo intentes.
              </p>
              <div className="mt-[0.65rem] flex flex-col gap-[0.4rem]" role="group" aria-label="Sugerencias">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={!canSendTutorMessage}
                    onClick={() => sendTutorPrompt(prompt)}
                    className="tutor-quick-prompt"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            tutorMessages.map((message) => (
              <Message
                key={message.id}
                from={message.role}
                className={
                  message.role === 'assistant'
                    ? 'flex flex-row items-start gap-[0.55rem]'
                    : 'flex flex-row-reverse items-start gap-[0.55rem]'
                }
              >
                {message.role === 'assistant' ? (
                  <span className="tutor-msg-avatar" aria-hidden>
                    <Bot size={12} />
                  </span>
                ) : null}
                <MessageContent
                  className={
                    message.role === 'user'
                      ? 'tutor-bubble tutor-bubble-user'
                      : 'tutor-bubble tutor-bubble-assistant'
                  }
                >
                  {message.content.length > 0 ? (
                    <MarkdownBlock markdown={message.content} />
                  ) : null}
                  {message.role === 'assistant' && message.artifactRef != null ? (
                    <button
                      type="button"
                      onClick={() => {
                        const ref = message.artifactRef
                        if (ref == null) return
                        setOpenArtifactId(ref.artifactId)
                        if (!isWideViewport) {
                          setIsTutorSheetOpen(false)
                        }
                      }}
                      className="tutor-artifact-cta"
                    >
                      <SquarePlay size={14} aria-hidden />
                      <span>Ver demostración interactiva</span>
                    </button>
                  ) : null}
                  {message.role === 'assistant' && message.artifactPending && message.artifactRef == null ? (
                    <Shimmer className="tutor-artifact-pending text-xs">
                      Preparando demostración…
                    </Shimmer>
                  ) : null}
                </MessageContent>
              </Message>
            ))
          )}
          {isTutorThinking ? (
            <Message from="assistant" className="flex flex-row items-start gap-[0.55rem]">
              <span className="tutor-msg-avatar" aria-hidden>
                <Bot size={12} />
              </span>
              <MessageContent className="tutor-bubble tutor-bubble-assistant">
                <Shimmer className="text-sm">Pensando…</Shimmer>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        className="tutor-composer"
        onSubmit={(message) => sendTutorPrompt(message.text)}
      >
        <PromptInputBody>
          <PromptInputTextarea
            data-tutor-input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escribe un mensaje para el tutor…  (⌘K)"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <span className="tutor-composer-hint">
            <kbd>Enter</kbd> para enviar
          </span>
          <PromptInputSubmit
            type="submit"
            status={tutorMutation.isPending ? 'streaming' : 'ready'}
            disabled={!canSendTutorMessage || draft.trim().length === 0}
            aria-label="Enviar mensaje"
          />
        </PromptInputFooter>
      </PromptInput>
      {tutorThreadError ? (
        <div className="tutor-alert">{tutorThreadError}</div>
      ) : null}
      {tutorMutation.error ? (
        <div className="tutor-alert">
          {tutorMutation.error instanceof Error ? tutorMutation.error.message : 'No se pudo enviar el mensaje al tutor.'}
        </div>
      ) : null}
      {clearTutorMutation.error ? (
        <div className="tutor-alert">
          {clearTutorMutation.error instanceof Error ? clearTutorMutation.error.message : 'No se pudo borrar la conversación.'}
        </div>
      ) : null}
    </aside>
  )

  const tutorRail = (
    <button
      type="button"
      className="tutor-rail"
      onClick={expandTutor}
      aria-label="Mostrar tutor"
      title="Mostrar tutor (⌘\\)"
    >
      <span className="tutor-rail-icon"><Bot size={16} /></span>
      <span className="tutor-rail-label">Tutor</span>
      <span className="tutor-rail-shortcut">⌘\</span>
    </button>
  )

  return (
    <StudentAppShell
      session={session}
      activeSection="practice"
      mainClassName="student-shell-main-immersive"
    >
      <div className="practice-canvas fade-in">
        {isCompactViewport ? (
          <>
            {stage}
            <button
              type="button"
              className={`tutor-fab ${isTutorSheetOpen ? 'is-open' : ''}`}
              onClick={() => setIsTutorSheetOpen((value) => !value)}
              aria-label={isTutorSheetOpen ? 'Cerrar tutor' : 'Abrir tutor'}
            >
              <Bot size={18} />
              <span>Tutor</span>
            </button>
            <div
              className={`absolute inset-0 z-40 flex-col ${isTutorSheetOpen ? 'flex' : 'hidden'}`}
            >
              <button
                type="button"
                className="tutor-sheet-backdrop"
                onClick={() => setIsTutorSheetOpen(false)}
                aria-label="Cerrar tutor"
              />
              <div className="tutor-sheet-panel">{tutor}</div>
            </div>
          </>
        ) : (
          <>
            <ResizablePanelGroup
              orientation={practiceOrientation}
              defaultLayout={storedLayoutRef.current}
              onLayoutChanged={(layout) => {
                if (typeof window === 'undefined') return
                try {
                  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
                } catch {
                  // ignore
                }
              }}
              className={`practice-workspace h-full min-h-0 flex-1 ${practiceOrientation === 'vertical' ? 'is-vertical' : 'is-horizontal'}`}
            >
              <ResizablePanel
                id={STAGE_PANEL_ID}
                defaultSize={isTutorCollapsed && openArtifactId == null ? 100 : openArtifactId != null && isWideViewport ? 38 : 62}
                minSize={32}
                className="relative h-full min-h-0"
              >
                {stage}
              </ResizablePanel>
              {!isTutorCollapsed ? (
                <>
                  <ResizableHandle />
                  <ResizablePanel
                    id={TUTOR_PANEL_ID}
                    defaultSize={openArtifactId != null && isWideViewport ? 30 : 38}
                    minSize={22}
                    className="relative h-full min-h-0"
                  >
                    {tutor}
                  </ResizablePanel>
                </>
              ) : null}
              {openArtifactId != null && isWideViewport && studentId != null ? (
                <>
                  <ResizableHandle />
                  <ResizablePanel
                    id={ARTIFACT_PANEL_ID}
                    defaultSize={32}
                    minSize={22}
                    className="relative h-full min-h-0"
                  >
                    <ArtifactPane
                      artifactId={openArtifactId}
                      studentId={studentId as Id<'students'>}
                      onClose={() => setOpenArtifactId(null)}
                    />
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
            {isTutorCollapsed ? tutorRail : null}
          </>
        )}
        {openArtifactId != null && (!isWideViewport || isCompactViewport) && studentId != null ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setOpenArtifactId(null)
            }}
          >
            <DialogContent
              className="flex h-[85vh] max-h-[85vh] w-[min(960px,calc(100vw-2rem))] max-w-[min(960px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(960px,calc(100vw-2rem))]"
              showCloseButton={false}
            >
              <DialogHeader className="sr-only">
                <DialogTitle>Demostración interactiva</DialogTitle>
                <DialogDescription>
                  Demostración interactiva creada por el tutor.
                </DialogDescription>
              </DialogHeader>
              <ArtifactPane
                artifactId={openArtifactId}
                studentId={studentId as Id<'students'>}
                onClose={() => setOpenArtifactId(null)}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </StudentAppShell>
  )
}
