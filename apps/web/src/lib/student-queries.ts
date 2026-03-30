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

export function studentAppStateQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.students.getStudentAppState, 'skip')
  }

  return convexQuery(api.students.getStudentAppState, {
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

export function practiceSessionQuery(sessionId: string | null | undefined) {
  if (!hasValue(sessionId)) {
    return convexQuery(api.practice.getPracticeSession, 'skip')
  }

  return convexQuery(api.practice.getPracticeSession, {
    sessionId: sessionId as never,
  })
}

export function practiceTutorThreadQuery(
  practiceSessionId: string | null | undefined,
  studentId: string | null | undefined,
) {
  if (!hasValue(practiceSessionId) || !hasValue(studentId)) {
    return convexQuery(api.tutor.getPracticeTutorThread, 'skip')
  }

  return convexQuery(api.tutor.getPracticeTutorThread, {
    practiceSessionId: practiceSessionId as never,
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
