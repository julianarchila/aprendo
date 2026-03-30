import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { StudentProgressPage } from '../components/StudentProgressPage.tsx'
import { studentAppStateQuery } from '../lib/student-queries.ts'
import { useStoredStudentSession } from '../lib/student-session.ts'

export const Route = createFileRoute('/progress')({
  component: ProgressRoutePage,
})

function ProgressRoutePage() {
  const navigate = useNavigate()
  const { session, isReady } = useStoredStudentSession()
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
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
    }
  }, [appStateQuery.data, isReady, navigate, session])

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  return (
    <StudentAppShell session={session} activeSection="progress">
      <StudentProgressPage studentId={session.studentId} />
    </StudentAppShell>
  )
}
