import { startTransition, useEffect, useState } from 'react'

const STORAGE_KEY = 'aprendo.student-session'

export interface StoredStudentSession {
  studentId: string
  email: string
}

function readStoredStudentSession() {
  if (typeof window === 'undefined') return null

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (rawValue == null) return null

  try {
    const parsed = JSON.parse(rawValue) as StoredStudentSession
    if (typeof parsed.studentId !== 'string' || typeof parsed.email !== 'string') {
      return null
    }
    return parsed
  } catch {
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
