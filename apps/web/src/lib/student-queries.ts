import { convexQuery } from '@convex-dev/react-query'
import { api } from '@aprendo/convex/api'
import type { SessionKind } from '@aprendo/convex/sessionKinds'

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

/** Full session detail (questions + attempts) for any session kind. */
export function sessionQuery(sessionId: string | null | undefined) {
  if (!hasValue(sessionId)) {
    return convexQuery(api.sessions.getSession, 'skip')
  }

  return convexQuery(api.sessions.getSession, {
    sessionId: sessionId as never,
  })
}

export function activeSessionQuery(
  studentId: string | null | undefined,
  kind?: SessionKind,
) {
  if (!hasValue(studentId)) {
    return convexQuery(api.sessions.getActiveSession, 'skip')
  }

  return convexQuery(api.sessions.getActiveSession, {
    studentId: studentId as never,
    ...(kind != null ? { kind } : {}),
  })
}

export function sessionHistoryQuery(
  studentId: string | null | undefined,
  options?: { kind?: SessionKind; limit?: number },
) {
  if (!hasValue(studentId)) {
    return convexQuery(api.sessions.listSessions, 'skip')
  }

  return convexQuery(api.sessions.listSessions, {
    studentId: studentId as never,
    ...(options?.kind != null ? { kind: options.kind } : {}),
    ...(options?.limit != null ? { limit: options.limit } : {}),
  })
}

export function latestDiagnosticQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.sessions.getLatestDiagnostic, 'skip')
  }

  return convexQuery(api.sessions.getLatestDiagnostic, {
    studentId: studentId as never,
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

/** Improvement-over-time signals: weekly accuracy trend + activity totals. */
export function progressTrendsQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.progress.getProgressTrends, 'skip')
  }

  return convexQuery(api.progress.getProgressTrends, {
    studentId: studentId as never,
  })
}

/** This week's AI coach summary (null until requested/generated). */
export function coachSummaryQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.coach.getWeeklyCoachSummary, 'skip')
  }

  return convexQuery(api.coach.getWeeklyCoachSummary, {
    studentId: studentId as never,
  })
}

/** Count of previously-missed questions due for spaced review (repaso). */
export function reviewQueueQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.sessions.getReviewQueue, 'skip')
  }

  return convexQuery(api.sessions.getReviewQueue, {
    studentId: studentId as never,
  })
}

/** "Hoy" dashboard signals (streak + weekly activity) derived from attempts. */
export function todayDashboardQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.today.getTodayDashboard, 'skip')
  }

  return convexQuery(api.today.getTodayDashboard, {
    studentId: studentId as never,
  })
}

/** Navigable ICFES syllabus: taxonomy + question counts + per-node mastery. */
export function syllabusQuery(studentId: string | null | undefined) {
  if (!hasValue(studentId)) {
    return convexQuery(api.syllabus.getSyllabus, 'skip')
  }

  return convexQuery(api.syllabus.getSyllabus, {
    studentId: studentId as never,
  })
}

/** Cached AI concept lesson for a subtopic (null until requested/generated). */
export function conceptLessonQuery(subtopicId: string | null | undefined) {
  if (!hasValue(subtopicId)) {
    return convexQuery(api.lessons.getConceptLesson, 'skip')
  }

  return convexQuery(api.lessons.getConceptLesson, { subtopicId })
}
