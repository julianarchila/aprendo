import { startTransition, useEffect, useState } from 'react'

const STORAGE_KEY = 'aprendo.student-session'

export interface StoredStudentSession {
  studentId: string
  email: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function readStoredStudentSession() {
  if (typeof window === 'undefined') return null

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (rawValue == null) return null

  try {
    const parsed = JSON.parse(rawValue) as StoredStudentSession
    if (!isNonEmptyString(parsed.studentId) || !isNonEmptyString(parsed.email)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function persistStudentSession(session: StoredStudentSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredStudentSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function useStoredStudentSession() {
  const [session, setSession] = useState<StoredStudentSession | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    startTransition(() => {
      setSession(readStoredStudentSession())
      setIsReady(true)
    })
  }, [])

  return {
    session,
    isReady,
    saveSession(nextSession: StoredStudentSession) {
      persistStudentSession(nextSession)
      startTransition(() => {
        setSession(nextSession)
      })
    },
    clearSession() {
      clearStoredStudentSession()
      startTransition(() => {
        setSession(null)
      })
    },
  }
}
