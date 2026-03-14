# Aprendo Product Spec

## Purpose

Aprendo is an ICFES Saber 11 preparation platform built around a structured bank of questions extracted from scanned exam PDFs. The platform is intended to help students measure their current level, practice with targeted question sets, understand mistakes, and improve over time with AI-assisted study sessions.

This document describes the intended product behavior and scope. It is not a backend design doc and does not prescribe implementation details beyond the product capabilities that the system must support.

## Product Vision

The product should feel like a focused digital prep environment for ICFES students:

- Start with a diagnostic exam to estimate the student's current level.
- Track performance over time by area and subtopic.
- Recommend future practice sessions based on demonstrated strengths and weaknesses.
- Provide an AI tutor during practice and review sessions, but not during the diagnostic exam.
- Build the content foundation from a growing question bank extracted from historical and curated exam PDFs.

## Problem Statement

Students preparing for ICFES often face three problems:

- Practice content is fragmented across PDFs, books, and informal materials.
- Students do not have a clear picture of which areas or subtopics they need to improve.
- Existing study flows rarely connect question performance, targeted practice, and tutor support in one system.

Aprendo should solve this by turning static PDFs into a structured practice platform with adaptive recommendations.

## Current State Of The Project

The current repository already supports the first layer of the system:

- Admin uploads scanned PDFs.
- The backend runs OCR over the PDF.
- An LLM extracts multiple-choice questions from OCR markdown.
- Questions are stored in Convex as markdown-first documents.
- The web app can browse extracted questions.

The current product does not yet support:

- Student accounts or learner profiles
- Diagnostic exam generation and scoring
- Correct-answer storage
- Topic or subtopic tagging
- Progress tracking
- Personalized recommendations
- Practice-session review flows
- AI tutor interactions inside practice sessions

## Target Users

Primary user:

- Students preparing for ICFES Saber 11 in Colombia

Secondary users:

- Admins or operators who upload and process source PDFs
- Internal team members who monitor content quality and system behavior

## Core Product Goals

The first meaningful product version should achieve the following:

1. Build a reliable question bank from scanned PDF sources.
2. Tag each question with a stable subject and subtopic taxonomy.
3. Infer or attach a correct answer for each usable question.
4. Let students take a balanced diagnostic exam without AI assistance.
5. Store diagnostic and practice outcomes in a way that supports progress tracking.
6. Recommend future questions based on observed performance.
7. Offer an AI assistant during practice and review sessions to explain answers, give hints, and suggest similar exercises.

## Product Principles

- Question bank first: all student experiences depend on a structured, queryable bank of reusable questions.
- Diagnostic is controlled: the diagnostic exam should measure baseline ability without tutor assistance.
- Practice is adaptive: later sessions should become more targeted as the system learns about the student.
- AI should support learning, not replace solving: hints and explanations should guide reasoning rather than give away answers immediately.
- Taxonomy must be stable: recommendations and analytics depend on consistent tagging across the bank.
- Product quality depends on content quality: low-confidence or malformed questions should be excluded from student-facing flows.

## Core Domain Objects

At the product level, the system revolves around these concepts:

- Source PDF: an uploaded exam or workbook document
- Extracted question: a renderable multiple-choice question derived from a PDF
- Question metadata: subject, subtopic, difficulty, correct answer, enrichment confidence, and related content attributes
- Diagnostic exam: a fixed-length, balanced assessment used to estimate baseline performance
- Practice session: a generated set of questions chosen for learning rather than pure assessment
- Attempt: a student's interaction with a question, including answer, correctness, timing, and help usage
- Review session: a post-practice experience where the student revisits mistakes with AI support
- Learner profile: an evolving summary of the student's performance by subject and subtopic

## Main User Flows

### 1. Content ingestion and enrichment

Admins upload scanned PDFs. The system extracts questions, stores renderable content, and enriches each question so it becomes usable in student flows.

The enriched question bank should eventually contain:

- Question body and options
- Correct answer
- Subject
- One or more subtopics
- Optional explanation or worked solution
- Confidence and quality signals

### 2. Diagnostic exam

A student begins with a diagnostic exam composed of a balanced sample of questions across the main ICFES areas:

- Lectura Critica
- Matematicas
- Ciencias Naturales
- Sociales y Ciudadanas
- Ingles

The diagnostic should:

- Use a fixed, intentionally selected number of questions
- Aim for balanced coverage across major subjects
- Not expose the AI tutor during the exam
- Record correctness, response time, and completion behavior
- Produce an initial profile of strengths and weaknesses

### 3. Results and progress view

After the diagnostic and after future practice sessions, the student should be able to see:

- Overall score or performance summary
- Performance by subject
- Performance by subtopic
- Accuracy trends over time
- Areas that need more work
- Areas that are improving

The product should communicate actionable next steps, not just scores.

### 4. Personalized practice sessions

After the diagnostic, the system should generate practice sessions using the learner profile and question metadata.

Practice generation should favor:

- Weak areas with enough supporting question inventory
- A healthy mix of remediation and confidence-building questions
- Question diversity so the student is not shown repetitive near-duplicates
- Appropriate difficulty for the student's current level

Practice sessions may be:

- General mixed practice
- Subject-focused practice
- Subtopic-focused practice
- Review sessions centered on recent mistakes

### 5. AI-assisted practice and review

During practice and review, the student should be able to interact with an AI tutor alongside the question flow.

The assistant should support:

- Hints before answering
- Step-by-step explanation after answering
- Clarification of concepts or vocabulary
- Advice about how to approach similar questions
- Follow-up prompts such as "Explain the answer", "Give me a similar problem", or "What should I review next?"

The assistant should not be available during the diagnostic exam.

## Required Product Features

### Question bank features

- Store questions extracted from scanned PDFs
- Render markdown, math, tables, and embedded images
- Maintain source traceability back to the PDF upload
- Mark questions as usable, low-confidence, or excluded

### Content enrichment features

- Assign correct answers to each question
- Assign subject and subtopic tags from a predefined taxonomy
- Store enrichment confidence and provenance
- Support reprocessing when the taxonomy or prompts change

### Student assessment features

- Deliver a diagnostic exam
- Score the diagnostic
- Generate a baseline performance profile
- Prevent tutor assistance during diagnostic completion

### Practice features

- Generate question sets from the bank
- Present one question at a time in a focused interface
- Allow answering, skipping, and navigating within a session
- Support practice-specific AI help

### Review and analytics features

- Show correctness and explanations after practice
- Show performance by subject and subtopic
- Show recent mistakes and repeated weak areas
- Summarize what the student should practice next

## Personalization Expectations

The recommendation system does not need to be fully sophisticated in V1, but it must support the following product outcomes:

- Identify weak subjects after the diagnostic
- Identify weak subtopics as enough evidence accumulates
- Select future questions based on the student's history
- Avoid overfitting to tiny amounts of data
- Improve recommendations as more attempts are recorded

In product terms, the recommendation engine should answer:

- What should this student practice next?
- Which questions are appropriate right now?
- Which subtopics need reinforcement?
- Is the student improving in a given area?

## Taxonomy Requirements

Question tagging must be based on a predefined taxonomy rather than free-form LLM labels.

The taxonomy should:

- Cover the five main ICFES subject areas
- Include subtopic-level tags useful for recommendations and analytics
- Be stable enough to support long-term tracking
- Be small enough for reliable automatic tagging
- Allow one question to have more than one subtopic when necessary

This taxonomy is a dependency for the recommendation and progress systems.

## AI Tutor Requirements

The AI tutor is part of the learning experience, not part of the scoring layer.

The tutor should:

- Appear in practice and review sessions
- Be aware of the current question and answer choices
- Adapt its help based on whether the student has already answered
- Prefer hints and reasoning support over direct answer disclosure
- Provide concise, student-friendly explanations

The tutor should not:

- Participate in the diagnostic exam flow
- Change official scores after submission
- Depend on unstable or hidden product state to answer basic question-level requests

## Quality And Trust Requirements

Because the system starts from scanned PDFs and LLM enrichment, quality control is part of the product, not just the infrastructure.

The product should eventually support:

- Confidence signals for extracted questions
- Confidence signals for inferred answers
- Confidence signals for automatic tagging
- Excluding low-confidence questions from diagnostic or recommendation flows
- Re-running enrichment when prompts or models improve

## Out Of Scope For This Spec

The following topics are intentionally left for later design documents:

- Exact database schema
- Exact Convex job orchestration
- Exact recommendation algorithm
- Exact LLM prompts for answer inference and tagging
- Authentication and billing model
- Full content moderation and admin review tooling

## V1 Product Scope

The first complete student-facing version should include:

- A usable enriched question bank
- A fixed diagnostic exam flow
- A results view with subject-level and early subtopic-level performance
- Generated practice sessions based on student history
- An AI tutor in practice and review

V1 does not need:

- Perfect mastery modeling
- Highly dynamic testing theory
- Multi-model answer consensus
- Rich gamification
- Full teacher or parent dashboards

## Future Expansion

Potential later capabilities include:

- Better difficulty calibration
- More advanced adaptive testing
- Confidence-weighted recommendations
- Admin review workflows for low-confidence content
- Similar-question retrieval and content clustering
- Longitudinal study planning
- Richer coaching summaries and study plans

## Product Success Criteria

The product is succeeding when:

- PDFs can be converted into a usable and growing question bank
- Students can complete a diagnostic without assistance
- The system can identify weak areas with enough clarity to guide practice
- Practice sessions feel more relevant over time
- Students can understand mistakes through review and tutoring

## Immediate Product Dependencies

Before the intended product can exist, the system must add:

- Correct-answer enrichment
- Stable taxonomy definition
- Automatic question tagging
- Student attempt storage
- Diagnostic assembly and scoring
- Learner-profile generation

## Open Product Questions

These questions remain open for follow-up design work:

- How many questions should the first diagnostic exam contain?
- How balanced should the diagnostic be across subjects versus competencies?
- Should the first practice recommendation be conservative and broad, or aggressively targeted to weaknesses?
- What minimum confidence should be required before a question can appear in a diagnostic?
- How should the tutor behave when a student asks directly for the answer before attempting the problem?
