import { convexQuery } from '@convex-dev/react-query'
import { api } from '@aprendo/convex/api'

export function studentQuery(studentId: string) {
  return convexQuery(api.students.getStudent, {
    studentId: studentId as never,
  })
}

export function diagnosticSessionQuery(sessionId: string) {
  return convexQuery(api.diagnostics.getDiagnosticSession, {
    sessionId: sessionId as never,
  })
}

export function latestDiagnosticQuery(studentId: string) {
  return convexQuery(api.diagnostics.getStudentLatestDiagnostic, {
    studentId: studentId as never,
  })
}

export function studentProgressQuery(studentId: string) {
  return convexQuery(api.progress.getStudentProgress, {
    studentId: studentId as never,
  })
}
