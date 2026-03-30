import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, SendHorizontal, Sparkles } from 'lucide-react'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../components/ui/resizable.tsx'
import { studentAppStateQuery } from '../lib/student-queries.ts'
import { useStoredStudentSession } from '../lib/student-session.ts'

type PracticeOption = {
  label: string
  bodyMarkdown: string
}

type PracticeQuestion = {
  id: string
  subject: string
  subtopic: string
  bodyMarkdown: string
  options: PracticeOption[]
  correctOption: string
  explanation: string
}

type ChatRole = 'assistant' | 'user'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

const PRACTICE_QUESTIONS: PracticeQuestion[] = [
  {
    id: 'pct-change',
    subject: 'Matematicas',
    subtopic: 'Porcentajes y variacion',
    bodyMarkdown: 'Si el precio de un articulo aumenta un 20% y luego se le aplica un descuento del 20%, ¿cual es el cambio porcentual respecto al precio original?',
    options: [
      { label: 'A', bodyMarkdown: '0% (queda igual)' },
      { label: 'B', bodyMarkdown: '-4%' },
      { label: 'C', bodyMarkdown: '+4%' },
      { label: 'D', bodyMarkdown: '-2%' },
    ],
    correctOption: 'B',
    explanation: 'Tomemos un precio inicial de 100. Si aumenta 20%, pasa a 120. Luego un descuento de 20% sobre 120 equivale a 24, asi que el precio final queda en 96. Comparado con 100, el cambio es de -4%.',
  },
  {
    id: 'reading-tone',
    subject: 'Lectura Critica',
    subtopic: 'Inferencia y tono',
    bodyMarkdown: 'En un texto argumentativo, un autor describe una medida publica como "necesaria, aunque tardia". ¿Que puede inferirse mejor sobre su postura?',
    options: [
      { label: 'A', bodyMarkdown: 'La rechaza completamente.' },
      { label: 'B', bodyMarkdown: 'La apoya, pero considera que debio aplicarse antes.' },
      { label: 'C', bodyMarkdown: 'No expresa ninguna opinion evaluativa.' },
      { label: 'D', bodyMarkdown: 'Cree que la medida sera inutil.' },
    ],
    correctOption: 'B',
    explanation: 'La expresion "necesaria" muestra apoyo a la medida. El matiz "aunque tardia" introduce una critica temporal, no un rechazo total.',
  },
  {
    id: 'natural-science',
    subject: 'Ciencias Naturales',
    subtopic: 'Relaciones entre variables',
    bodyMarkdown: 'En un experimento se aumenta la intensidad de luz sobre una planta y se observa que, despues de cierto punto, la tasa de fotosintesis deja de crecer. ¿Cual es la mejor explicacion?',
    options: [
      { label: 'A', bodyMarkdown: 'La luz deja de influir y otro factor pasa a limitar el proceso.' },
      { label: 'B', bodyMarkdown: 'La planta deja de necesitar energia.' },
      { label: 'C', bodyMarkdown: 'La fotosintesis se convierte en respiracion.' },
      { label: 'D', bodyMarkdown: 'La clorofila desaparece inmediatamente.' },
    ],
    correctOption: 'A',
    explanation: 'Cuando una variable deja de aumentar el resultado, suele ocurrir que otro factor se vuelve limitante, por ejemplo la concentracion de CO2 o la temperatura.',
  },
]

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Estoy listo para darte una pista breve, aclarar el enunciado o explicarte el razonamiento despues de responder.',
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
  component: PracticePreviewPage,
})

function PracticePreviewPage() {
  const navigate = useNavigate()
  const { session, isReady } = useStoredStudentSession()
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT)
  const [draft, setDraft] = useState('')
  const [practiceOrientation, setPracticeOrientation] = useState<'horizontal' | 'vertical'>('horizontal')

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isReady, navigate, session])

  useEffect(() => {
    if (!isReady || session == null || appStateQuery.data == null) return
    if (!appStateQuery.data.hasCompletedDiagnostic) {
      void navigate({ to: '/diagnostic' })
    }
  }, [appStateQuery.data, isReady, navigate, session])

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

  const currentQuestion = PRACTICE_QUESTIONS[currentIndex]
  const answeredCount = Object.keys(selectedOptions).length

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  if (currentQuestion == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">No hay una sesion de practica para mostrar.</p>
      </div>
    )
  }

  const selectedOption = selectedOptions[currentQuestion.id] ?? null
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
      pushAssistantReply('Piensa en un valor simple, como 100. Aplica primero el aumento y luego el descuento sobre el nuevo valor.')
      return
    }
    if (prompt === 'Aclara el enunciado') {
      pushAssistantReply('Los dos porcentajes no usan la misma base. El descuento final se calcula sobre el precio ya aumentado.')
      return
    }
    if (prompt === 'Como empiezo') {
      pushAssistantReply('Convierte los porcentajes en cantidades concretas y compara el valor final con el inicial.')
      return
    }
    if (prompt === 'Explicame la respuesta') {
      pushAssistantReply(activeQuestion.explanation)
      return
    }
    if (prompt === 'Por que mi opcion no era') {
      pushAssistantReply(
        selectedOption === activeQuestion.correctOption
          ? 'Tu respuesta coincide con la correcta. Si quieres, puedo desarmar el procedimiento paso a paso.'
          : 'El error tipico es asumir que +20% y -20% se cancelan. No ocurre porque el segundo cambio usa una base distinta.',
      )
      return
    }

    pushAssistantReply('Prueba un caso similar: sube un valor 10% y despues bajalo 10%. Veras que no vuelve al punto inicial.')
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
        content: 'Esta vista ya esta preparada para conectar el tutor real. Por ahora responde con una simulacion corta.',
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
                <span className="chip chip-accent">{currentQuestion.subject}</span>
                <span className="chip">{currentQuestion.subtopic}</span>
              </div>
            </div>

            <div className="practice-stage-counter">
              <span>Pregunta</span>
              <strong>{currentIndex + 1} / {PRACTICE_QUESTIONS.length}</strong>
            </div>
          </div>

          <div className="practice-progress-strip">
            <div
              className="practice-progress-value"
              style={{ width: `${(answeredCount / PRACTICE_QUESTIONS.length) * 100}%` }}
            />
          </div>

          <div className="practice-stage-body">
            <div className="practice-question-card">
              <div className="practice-question-copy">
                <MarkdownBlock markdown={currentQuestion.bodyMarkdown} />
              </div>

              <div className="practice-options-grid">
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedOption === option.label
                  const isCorrect = hasAnswered && option.label === currentQuestion.correctOption
                  const isIncorrect = hasAnswered && isSelected && option.label !== currentQuestion.correctOption

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setSelectedOptions((current) => ({ ...current, [currentQuestion.id]: option.label }))}
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
                onClick={() => setCurrentIndex((value) => Math.min(PRACTICE_QUESTIONS.length - 1, value + 1))}
                disabled={currentIndex === PRACTICE_QUESTIONS.length - 1}
                className="btn-primary"
              >
                Siguiente
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
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
                <h2 className="practice-tutor-title">Ayuda puntual</h2>
              </div>
            </div>
            <span className="practice-tutor-status">
              <Sparkles size={14} />
              Disponible
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
              placeholder="Haz una pregunta corta sobre esta misma pregunta..."
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
