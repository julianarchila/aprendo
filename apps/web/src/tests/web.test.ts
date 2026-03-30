import { describe, expect, it } from 'vitest'
import {
  latestDiagnosticQuery,
  practiceSessionQuery,
  practiceTutorThreadQuery,
  studentProgressQuery,
} from '../lib/student-queries'

describe('web scaffold', () => {
  it('keeps the initial workspace test suite green', () => {
    expect(true).toBe(true)
  })

  it('skips student-scoped queries when the student id is missing', () => {
    expect(latestDiagnosticQuery('')).toMatchObject({
      enabled: false,
      queryKey: ['convexQuery', 'diagnostics:getStudentLatestDiagnostic', 'skip'],
    })

    expect(studentProgressQuery(undefined)).toMatchObject({
      enabled: false,
      queryKey: ['convexQuery', 'progress:getStudentProgress', 'skip'],
    })

    expect(practiceSessionQuery(null)).toMatchObject({
      enabled: false,
      queryKey: ['convexQuery', 'practice:getPracticeSession', 'skip'],
    })

    expect(practiceTutorThreadQuery('', undefined)).toMatchObject({
      enabled: false,
      queryKey: ['convexQuery', 'tutor:getPracticeTutorThread', 'skip'],
    })
  })
})
