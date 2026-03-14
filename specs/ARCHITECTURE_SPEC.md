# Aprendo Architecture Spec

## Purpose

This document defines the minimal overall architecture for Aprendo. It describes the major system components, their responsibilities, and the main data flows required to support the product described in [PRODUCT_SPEC.md](/Users/julian/Dev/aprendo/specs/PRODUCT_SPEC.md).

This is an architecture-level spec, not a detailed implementation plan. It should answer:

- What subsystems exist?
- What is the source of truth for each kind of data?
- How does data move through the system?
- What are the minimum architectural requirements for V1?

## Architectural Principles

- Structured state over implicit memory: core product state should live in explicit application data models, not inside opaque LLM memory systems.
- Async enrichment pipeline: extraction, answer inference, and taxonomy tagging should run as background stages.
- Separation of concerns: content ingestion, learner-state tracking, recommendation, and tutoring should remain separate layers.
- Deterministic core, probabilistic helpers: LLMs may enrich and explain content, but scoring, tracking, and recommendation should be driven by structured data.
- Reprocessability: question enrichment should be rerunnable when prompts, models, or taxonomy definitions change.

## High-Level System

The system has five major layers:

1. Web application
2. Convex backend
3. Ingestion and enrichment pipeline
4. Learner-state and recommendation layer
5. LLM tutor layer

## Major Components

### 1. Web application

The web app is the user interface for both admin and student-facing flows.

Responsibilities:

- Admin PDF upload and pipeline monitoring
- Student diagnostic exam flow
- Student practice session flow
- Results and progress views
- Review flow after practice
- Tutor chat interface during practice and review

The web app should not own business state beyond normal UI state and cached server data.

### 2. Convex backend

Convex is the application backend and primary transactional store for the product.

Responsibilities:

- Persist source PDFs, extracted questions, and enrichment metadata
- Persist students, sessions, attempts, and learner aggregates
- Expose queries and mutations for the web app
- Run background jobs and asynchronous actions
- Orchestrate content-processing stages

Convex should be the source of truth for:

- Question bank data
- Student progress data
- Session state
- Recommendation inputs and outputs

### 3. Ingestion and enrichment pipeline

The ingestion pipeline converts scanned PDFs into usable question-bank records.

Stages:

1. PDF upload
2. OCR extraction
3. Question extraction
4. Correct-answer inference
5. Topic and subtopic tagging
6. Optional explanation generation and quality checks

Responsibilities:

- Produce renderable question content
- Attach structured metadata needed for diagnostics and recommendations
- Store confidence and provenance for enriched fields
- Mark low-confidence questions as excluded or limited-use

This pipeline is asynchronous and should not block user-facing flows.

### 4. Learner-state and recommendation layer

This layer converts raw student attempts into progress signals and future question recommendations.

Responsibilities:

- Store diagnostic, practice, and review attempts
- Aggregate performance by subject and subtopic
- Track recency, exposure, correctness, timing, and help usage
- Build learner profiles from historical attempts
- Select candidate questions for new sessions

This layer should be deterministic and inspectable.

### 5. LLM tutor layer

The tutor layer provides contextual help during practice and review sessions.

Responsibilities:

- Explain questions and answers
- Give hints
- Answer follow-up conceptual questions
- Suggest what to review next

The tutor should consume structured context from the backend:

- Current question
- Student answer state
- Correct answer and explanation
- Relevant learner weaknesses when useful

The tutor is not the source of truth for scoring, recommendation, or learner progress.

## Core Data Domains

The architecture centers on four data domains:

### Content domain

- PDFs
- OCR artifacts
- Extracted questions
- Question enrichment metadata

### Assessment domain

- Diagnostic exams
- Practice sessions
- Review sessions
- Session question assignments

### Learning domain

- Question attempts
- Subject-level performance
- Subtopic-level performance
- Learner profile summaries

### Tutor domain

- Tutor messages
- Practice/review conversation context
- Optional qualitative observations derived from tutoring

## Source Of Truth

The source of truth for each concern should be explicit:

- Question content and metadata: Convex question records
- Correct answers and taxonomy tags: Convex enrichment fields
- Student history: Convex attempt and session records
- Progress state: Convex learner aggregates derived from attempts
- Recommendations: generated from learner aggregates plus question metadata
- Tutor context: derived from structured backend data, optionally augmented by conversation history

## Main Data Flows

### 1. Content ingestion flow

```text
PDF upload
  -> OCR
  -> question extraction
  -> answer inference
  -> taxonomy tagging
  -> question quality filtering
  -> question bank
```

Output:

- renderable questions
- correct answers
- tags
- enrichment confidence
- eligibility for student-facing use

### 2. Diagnostic flow

```text
student starts diagnostic
  -> backend assembles balanced question set
  -> student answers questions
  -> backend scores results
  -> attempts recorded
  -> learner profile initialized or updated
  -> results view generated
```

Constraint:

- no tutor access during diagnostic completion

### 3. Practice flow

```text
student requests practice
  -> recommendation layer selects questions
  -> session created
  -> student answers questions
  -> tutor available during or after question work
  -> attempts recorded
  -> learner aggregates updated
  -> next recommendations improve
```

### 4. Review flow

```text
completed session
  -> identify mistakes and weak subtopics
  -> show explanations and corrections
  -> allow tutor follow-up
  -> optionally generate next targeted session
```

## Minimal V1 Architectural Requirements

V1 requires the following capabilities:

- A persistent question bank with renderable content
- Async question enrichment for answers and taxonomy tags
- A way to mark question quality and exclude low-confidence items
- Session creation for diagnostic and practice flows
- Attempt recording per student per question
- Aggregation of learner performance by subject and subtopic
- Deterministic question recommendation based on learner state
- Tutor support in practice and review only

## Recommended Boundaries Between Layers

### Ingestion vs recommendation

The ingestion layer prepares content. It should not decide what a student should see next.

### Attempts vs learner profile

Attempts are raw events. Learner profiles are derived summaries. The raw attempts must remain available as the canonical evidence.

### Recommendation vs tutoring

The recommendation layer chooses the next questions. The tutor helps the student understand those questions. These concerns should remain independent.

## Suggested Processing Model

The system should use asynchronous stage-based processing for content enrichment:

- Stage 1: OCR and extraction
- Stage 2: answer inference
- Stage 3: taxonomy tagging
- Stage 4: optional explanation generation and quality scoring

Each stage should:

- read from previous stage outputs
- write structured results back to Convex
- record status and confidence
- support retry and reprocessing

## Recommendation Model For V1

The recommendation engine should be rule-based and operate over structured learner data.

Inputs:

- question metadata
- student attempt history
- subject and subtopic aggregates
- recent mistakes
- recency and repetition constraints

Outputs:

- a selected set of questions for the next session
- a reason or rationale category for each selection, such as weak area, recent mistake, or reinforcement

This engine should not depend on free-form LLM reasoning as its primary selection mechanism.

## Progress Tracking Model For V1

Progress should be derived from attempts and aggregated by:

- overall performance
- subject
- subtopic

Minimum tracked signals:

- attempts
- correct answers
- recent accuracy
- response time
- hint usage
- tutor usage
- last seen timestamp

These aggregates should power both analytics and recommendations.

## LLM Usage Boundaries

LLMs are appropriate for:

- OCR-adjacent extraction support
- answer inference
- taxonomy tagging
- explanation generation
- tutor interactions

LLMs should not be the primary mechanism for:

- scoring official results
- storing learner truth
- deciding recommendations without structured ranking logic

## Operational Considerations

The architecture should support:

- background retries for failed enrichment jobs
- prompt/model versioning for reprocessing
- visibility into processing status
- exclusion of low-confidence content
- gradual improvement of enrichment quality without breaking student history

## Out Of Scope For This Document

This document does not define:

- exact Convex schema
- exact query and mutation API
- exact aggregation formulas
- exact recommendation ranking formula
- exact prompt design
- exact UI composition

## Next Design Documents

After this architecture spec, the next useful docs are:

1. Data model spec
2. Content enrichment pipeline spec
3. Learner-state and aggregation spec
4. Recommendation engine spec
5. Tutor integration spec
