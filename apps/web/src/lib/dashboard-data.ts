import { createServerFn } from '@tanstack/react-start'

export const getDashboardSnapshot = createServerFn({
  method: 'GET',
}).handler(async () => {
  const questions = [
    {topic: 'Critical reading'},
  ]

  return {
    questionCount: questions.length,
    nextStep: 'Diagnostic flow placeholder',
    featuredTopic: questions[0]?.topic ?? 'Critical reading',
  }
})
