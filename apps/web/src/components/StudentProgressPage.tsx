import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { latestDiagnosticQuery, studentProgressQuery } from '../lib/student-queries.ts'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy.ts'

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function normalizeEvidenceLevel(level: string): 'low' | 'medium' | 'high' {
  if (level === 'high' || level === 'medium') return level
  return 'low'
}

function getReadinessBand(masteryScore: number, evidenceLevel: string) {
  const normalizedEvidenceLevel = normalizeEvidenceLevel(evidenceLevel)

  if (normalizedEvidenceLevel === 'low') {
    return {
      label: 'Lectura inicial',
      color: 'var(--text-tertiary)',
      tone: 'bg-[var(--bg-inset)] text-[var(--text-secondary)] border-[var(--border)]',
    }
  }
  if (masteryScore >= 0.72) {
    return {
      label: 'Bien encaminada',
      color: 'var(--success)',
      tone: 'bg-[var(--success-soft)] text-[var(--success-text)] border-transparent',
    }
  }
  if (masteryScore >= 0.5) {
    return {
      label: 'En desarrollo',
      color: 'var(--accent)',
      tone: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-transparent',
    }
  }
  return {
    label: 'Prioridad de refuerzo',
    color: 'var(--accent-text)',
    tone: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-transparent',
  }
}

function getOverallReadinessSummary(
  subjectAggregates: Array<{
    masteryScore: number
    evidenceLevel: string
  }>,
) {
  if (subjectAggregates.length === 0) {
    return { title: 'Aun no hay una lectura clara' }
  }

  const averageMastery = subjectAggregates.reduce((sum, agg) => sum + agg.masteryScore, 0) / subjectAggregates.length
  const lowEvidenceCount = subjectAggregates.filter(
    (agg) => normalizeEvidenceLevel(agg.evidenceLevel) === 'low',
  ).length

  if (lowEvidenceCount >= Math.ceil(subjectAggregates.length / 2)) {
    return { title: 'Este es tu punto de partida' }
  }
  if (averageMastery >= 0.68) {
    return { title: 'Tienes una base competitiva' }
  }
  if (averageMastery >= 0.5) {
    return { title: 'Tu preparacion va por buen camino' }
  }
  return { title: 'Hay oportunidades claras de mejora' }
}

function RingProgress({
  value,
  size = 48,
  strokeWidth = 4,
  color,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value * circumference)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring"
      />
    </svg>
  )
}

export function StudentProgressPage({ studentId }: { studentId: string }) {
  const progressQuery = useQuery({
    ...studentProgressQuery(studentId),
    enabled: true,
  })
  const latestDiagnostic = useQuery({
    ...latestDiagnosticQuery(studentId),
    enabled: true,
  })

  if (progressQuery.isPending || latestDiagnostic.isPending) {
    return (
      <div className="fade-in mx-auto max-w-xl py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Preparando tu resumen...</p>
      </div>
    )
  }

  const progress = progressQuery.data
  const diagnostic = latestDiagnostic.data
  const overallSummary = progress?.snapshot?.overallSummary
  const subjectAggregates = [...(progress?.subjectAggregates ?? [])].sort(
    (a, b) => b.masteryScore - a.masteryScore,
  )
  const weakestSubtopics = progress?.weakestSubtopics ?? []
  const readinessSummary = getOverallReadinessSummary(subjectAggregates)

  if (overallSummary == null || diagnostic?.status !== 'completed') {
    return (
      <div className="fade-in mx-auto max-w-md">
        <div className="card relative overflow-hidden p-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_65%)]" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-inset)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <h2 className="mb-2 font-display text-2xl italic text-[var(--text-primary)]">
              Aun no tienes resultados
            </h2>
            <p className="mx-auto mb-6 max-w-xs text-sm text-[var(--text-secondary)]">
              Completa el diagnostico para ver tu progreso.
            </p>
            <Link to="/diagnostic" className="btn-primary no-underline">
              Ir al diagnostico
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in mx-auto max-w-5xl space-y-5">
      <div className="card progress-hero relative overflow-hidden px-6 py-5 sm:px-8 sm:py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft),transparent_55%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="kicker mb-1">Mapa de preparacion</p>
            <h2 className="font-display text-2xl italic tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {readinessSummary.title}
            </h2>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
              {formatPercent(overallSummary.accuracy)}
            </p>
            <p className="text-xs font-medium text-[var(--text-tertiary)]">precision general</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Por materia</h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {subjectAggregates.map((agg) => {
              const readiness = getReadinessBand(agg.masteryScore, agg.evidenceLevel)
              return (
                <div key={agg._id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="relative shrink-0">
                    <RingProgress value={agg.masteryScore} size={44} strokeWidth={4} color={readiness.color} />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-[var(--text-primary)]">
                      {formatPercent(agg.masteryScore)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {getSubjectLabel(agg.subjectId)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold ${readiness.tone}`}>
                    {readiness.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Para trabajar ahora</h3>
          </div>
          {weakestSubtopics.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[var(--text-tertiary)]">
                Practica mas para obtener recomendaciones.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {weakestSubtopics.slice(0, 5).map((agg, index) => (
                <div key={agg._id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[0.6875rem] font-bold text-[var(--accent-text)]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {getSubtopicLabel(agg.subtopicId ?? 'sin_subtema')}
                    </p>
                    <p className="text-[0.6875rem] text-[var(--text-tertiary)]">
                      {getSubjectLabel(agg.subjectId)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
                    {formatPercent(agg.masteryScore)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
