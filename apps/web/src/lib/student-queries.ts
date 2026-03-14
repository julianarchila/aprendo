import { convexQuery } from '@convex-dev/react-query'
import { api } from '@aprendo/convex/api'

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function studentQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.students.getStudent, 'skip')
  }

  return convexQuery(api.students.getStudent, {
    studentId: studentId as never,
  })
}

export function diagnosticSessionQuery(sessionId: string | null | undefined) {
  if (!hasValue(sessionId)) {
    return convexQuery(api.diagnostics.getDiagnosticSession, 'skip')
  }

  return convexQuery(api.diagnostics.getDiagnosticSession, {
    sessionId: sessionId as never,
  })
}

export function latestDiagnosticQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.diagnostics.getStudentLatestDiagnostic, 'skip')
  }

  return convexQuery(api.diagnostics.getStudentLatestDiagnostic, {
    studentId: studentId as never,
  })
}

export function studentProgressQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.progress.getStudentProgress, 'skip')
  }

  return convexQuery(api.progress.getStudentProgress, {
    studentId: studentId as never,
  })
}
