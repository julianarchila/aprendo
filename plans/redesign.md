# Plan — Rediseño de producto de Aprendo

> Plataforma de preparación ICFES Saber 11.
> Este archivo es el **tracker vivo** del rediseño: fases, checklist, decisiones y aprendizajes.
> Reframe central: de **"banco de preguntas + chat de IA"** → **"compañero de estudio guiado"**.
> Las preguntas son *evidencia*; la IA es el *motor de enseñanza*; la taxonomía es la *superficie de navegación*.

## Cómo se trabaja (loop por tarea)
1. Plan (este archivo) → 2. Tomar una tarea → 3. Completarla → 4. Limpiar con `/improve-architecture` →
5. Documentar aprendizajes aquí → 6. Marcar la tarea ✅ y volver a (3).

- Idioma del producto y de la comunicación: **español** (con acentos).
- UI con la skill `frontend-design`, **respetando el sistema de diseño existente** (no introducir fuentes/colores genéricos).
- El usuario corre `bun run dev` (no iniciar el server). Docs de Convex: https://docs.convex.dev
- Libertad para breaking changes y rediseño de arquitectura. Rama nueva antes de commitear; commits solo si el usuario lo pide.

## North star
Aprendo debe sentirse como un **tutor personal** que: (a) sabe qué dominar para el ICFES, (b) te dice qué estudiar hoy,
(c) te *enseña* el concepto, (d) te hace practicar, (e) mide si avanzas.

## Nueva arquitectura de información
```
Aprendo
 └ Hoy        ← NUEVO: home con plan del día + cuenta regresiva al examen + racha
 └ Temario    ← NUEVO: sílabo ICFES explorable (materias→categorías→subtemas) + lecciones
 └ Práctica   ← existe; ahora 1 de varias puertas (también desde Temario y Hoy)
 └ Progreso   ← existe; evoluciona a "Mapa de preparación" (tendencias + proyección de puntaje)
```

---

## Fases y checklist

### Fase 1 — Temario navegable  🔥 (máximo ROI, menor esfuerzo)  · estado: ✅ completada
Convertir `docs/taxonomy.v1.json` en un mapa explorable: materias → categorías → subtemas,
mostrando dominio (`learnerSubtopicAggregates`), si hay lección, y nº de preguntas disponibles
(`questions` por subtema+elegibilidad). Lanzar práctica por subtema desde aquí.

- [x] Query Convex `getSyllabus(studentId)` — `packages/convex/src/syllabus.ts`. Une taxonomía + conteos + dominio.
- [x] Añadir `Temario` a la nav (`StudentAppShell.tsx`) — `StudentSection` ahora incluye `syllabus`.
- [x] Práctica filtrada por **subtema**: `topic` acepta `subtopicId` opcional (`createSession`/`buildSelection`/`selectTopic`), persistido en `sessions.subtopicId`.
- [x] Ruta `/syllabus` (label "Temario") con `SyllabusPage.tsx` — selector de materia, panel categoría→subtema, barras de dominio, chips de estado, botón Practicar.
- [x] Estados: dominado / en progreso / a reforzar / sin practicar / sin preguntas (`lib/syllabus-status.ts`).
- [x] Tema claro + oscuro; `fade-in`; reusa tokens y `RingProgress` (extraído a componente compartido).
- [x] `/improve-architecture` (módulo `questionPool.ts` + tipos inferidos) + specs actualizados + aprendizajes abajo.

### Fase 2 — Pantalla "Hoy"  · estado: ✅ completada
Home con plan del día + racha + continuar donde quedaste. Reemplaza el redirect actual de `/app`.
**NOTA:** la cuenta regresiva al examen y el campo `examDate` quedan FUERA por ahora (decisión del usuario).

- [x] "Plan de Hoy" = CTA de práctica recomendada (reusa el kind `recommended`) + foco de la semana + continuar.
- [x] Racha derivada de `questionAttempts` por día (zona horaria Colombia, UTC-5) — `packages/convex/src/today.ts`.
- [x] Ruta `/today` (label "Hoy") + `TodayPage.tsx`. `defaultRoute` ahora es `/today` (students.ts), así `/app` aterriza en Hoy.
- [x] `/improve-architecture`: hook `useStudentGuard` + `FullScreenLoader` (de-duplica el gate de 3 rutas) + documentar + ✅.

### Fase 3 — Lecciones IA por concepto  · estado: ✅ completada
Micro-explicación + demo interactiva + errores comunes, cacheadas por subtema. Generación bajo demanda.

- [x] Tabla nueva `conceptLessons` (cache global por `subtopicId`: secciones markdown + demo HTML opcional + estados/versión).
- [x] Generación IA **bajo demanda** sin `@convex-dev/agent`: query reactiva `getConceptLesson` → mutation `requestConceptLesson` (reclamo atómico/OCC, anti-doble-generación, timeout de lock) → `scheduler` → `internalAction generateConceptLesson` (AI SDK `generateObject`) → `internalMutation markReady/markFailed`. Módulo `packages/convex/src/lessons.ts`.
- [x] Página de concepto `/lesson/$subtopicId` (`LessonPage.tsx`): secciones con `MarkdownBlock` (KaTeX), demo en iframe sandbox, errores como tarjetas, CTA "Practicar este tema" (reusa `createSession topic+subtopicId`), estados generando/failed+reintentar.
- [x] `hasLesson` encendido en `getSyllabus` (scan `by_status==ready`); enlace + chip "Lección" en cada subtema del Temario.
- [x] `/improve-architecture`: extraído `packages/convex/src/taxonomy.ts` (lookups compartidos) consumido por `sessions.ts`, `lessons.ts` y `tutor.ts` (eliminados sus mapas locales de label) + specs + ✅.
- [x] CTA "Repasar este concepto" en el Review: enlace por pregunta a `/lesson/$subtopicId` del subtema, tras la explicación (`practice.$sessionId.review.tsx`).

### Fase 4 — Repaso espaciado + resumen semanal del coach  · estado: ✅ completada
- [x] **Repaso espaciado:** nuevo kind `repaso` (estrategia `review_mistakes`) que resurfacea preguntas cuyo último intento fue incorrecto, más antiguas primero. Query `getReviewQueue` (conteo de pendientes). Surface en "Hoy" (tarjeta "Repaso de errores: N") y en el hub de práctica.
- [x] **Resumen semanal del coach:** módulo `packages/convex/src/coach.ts` (tabla `coachSummaries` por `(studentId, weekIndex)`), generación bajo demanda (mismo patrón que lecciones) con `generateText`, surface en "Hoy" como tarjeta "Tu semana". Solo se genera si hubo actividad esa semana.
- [x] `/improve-architecture`: reusó el patrón generar-y-cachear y los helpers de taxonomía; sin nueva duplicación.

### Fase 5 — Generación de preguntas similares por IA  · estado: ✅ completada
- [x] Generación bajo demanda por subtema: action `generateSubtopicQuestions` (`packages/convex/src/generatedQuestions.ts`) con `generateObject` (MCQ A-D + respuesta + solución).
- [x] **No invasivo:** las preguntas se insertan en la tabla `questions` existente con `eligibility: 'practice_only'`, atadas a un `pdfUploads` sintético (slug `ai-generated`) → fluyen por toda la maquinaria (selección, conteos del Temario, sesiones, review) sin tocar el schema central.
- [x] Disparador: botón "Generar más práctica con IA" en la página de lección (`LessonPage`, `useAction`).

---

## Wireframes de referencia

### "Hoy" (D.1) — sin cuenta regresiva (examDate fuera de alcance por ahora)
```
┌─────────────────────────────────────────────────────────────┐
│  Aprendo            Hoy · Temario · Práctica · Progreso   ⚙  │
├─────────────────────────────────────────────────────────────┤
│  Buenos días, Juan 👋          ┌──────────────────────────┐  │
│                                │   🔥 Racha: 5 días       │  │
│                                │   Esta semana: 4/5 metas │  │
│  ┌─────────────────────────────┴──────────────────────────┐ │
│  │  TU PLAN DE HOY                              ~25 min    │ │
│  │  ① 📖 Lección: Inferencia en Lectura Crítica   5 min  ▸ │ │
│  │  ② ✏️  Práctica: 6 preguntas del tema          12 min ▸ │ │
│  │  ③ 🔁 Repaso: 3 errores de ayer                8 min  ▸ │ │
│  │              [ ▶  Empezar sesión de hoy ]                │ │
│  └──────────────────────────────────────────────────────── │
│  Foco de la semana                  Continúa donde quedaste   │
└───────────────────────────────────────────────────────────────┘
```

### "Temario" (D.2) — el cambio de mayor ROI
```
┌─────────────────────────────────────────────────────────────┐
│  Temario ICFES Saber 11                    Tu dominio: 54%   │
├─────────────────────────────────────────────────────────────┤
│  [ Lectura ] [ Matemáticas ] [ C. Naturales ] [ Sociales ]…  │
│  Matemáticas                                  ▓▓▓▓▓░░░  58%   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ▸ Álgebra y cálculo            ▓▓▓▓▓▓▓░  72%  ✓ dominado │ │
│  │ ▾ Geometría                    ▓▓▓░░░░░  34%  ⚠ a reforzar│ │
│  │     • Áreas y perímetros       ▓▓▓▓▓░  habilitado        │ │
│  │     • Teorema de Pitágoras     ▓▓░░░░  📖 lección · ✏ 12 │ │
│  │     • Semejanza                ░░░░░░  🔒 aún sin practicar│ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```
Cada nodo: dominio + si hay lección + nº de preguntas disponibles. Mapa de progreso + menú de estudio a la vez.

### Página de concepto / lección IA (D.3)
```
┌─────────────────────────────────────────────────────────────┐
│  ← Geometría                              Teorema de Pitágoras│
│   📖 La idea en 2 minutos    [ demo interactiva = artifact ]  │
│   🧠 Cómo lo pregunta el ICFES                                │
│   ⚠ Errores comunes                                          │
│   [ ✏ Practicar 8 preguntas de este tema ]   💬 Tutor ⌘K     │
└───────────────────────────────────────────────────────────────┘
```

---

## Sistema de diseño (RESPETAR)
- Definido en `apps/web/src/styles.css` (clases utilitarias custom + Tailwind v4).
- Fuentes: display = **Fraunces** (serif), body = **Manrope**. NO Inter/Roboto.
- Paleta cálida: bg crema `#faf5f0`, accent coral `#e07460`, success verde. Tema claro+oscuro vía `[data-theme]`.
- Tokens: `--bg`, `--bg-card`, `--text-primary/secondary/tertiary`, `--accent`, `--accent-soft`, `--success`, `--border`, `--radius-*`, `--shadow-*`.
- Clases reutilizables: `.card`, `.card-inset`, `.btn-primary`, `.btn-ghost`, `.chip`, `.kicker`, `.fade-in`.
- Componentes UI: `apps/web/src/components/ui/*` (radix) y `ai-elements/*`.

## Mapa de archivos clave
- Nav: `apps/web/src/components/StudentAppShell.tsx` (hoy `StudentSection = 'practice' | 'progress'`).
- Práctica: `routes/practice.tsx`, `routes/practice.$sessionId.tsx` + `components/SessionSolve.tsx`, `routes/practice.$sessionId.review.tsx`.
- Progreso: `components/StudentProgressPage.tsx` + `routes/progress.tsx`.
- Entrada/landing: `routes/diagnostic.tsx`, `routes/app.tsx` (redirect), `routes/index.tsx`.
- Taxonomía: `apps/web/src/lib/taxonomy.ts` (`getSubjectLabel`, `getSubtopicLabel`, `subjectIds`) ← `docs/taxonomy.v1.json`.
- Backend Convex: `packages/convex/src/{sessions,tutor,progress,students,schema,validators,sessionKinds}.ts`.
- Queries cliente: `apps/web/src/lib/student-queries.ts`.
- Sesiones unificadas: `packages/convex/src/sessionKinds.ts` (diagnostic/recommended/topic/simulacro sobre una sola tabla `sessions`).

## Specs autoritativos (leer antes de cada área — índice en `AGENTS.md`)
`PRODUCT_SPEC`, `ARCHITECTURE_SPEC`, `TAXONOMY_SPEC`, `DATA_MODEL_SPEC`, `LEARNER_STATE_SPEC`,
`RECOMMENDATION_ENGINE_SPEC`, `TUTOR_INTEGRATION_SPEC`, `TYPESCRIPT_CONVENTIONS` (no barrel files),
`EFFECT_BEST_PRACTICES` (package `ingest`), ADR `0001-separate-solve-and-review-session-screens`.

---

## Decisiones tomadas
- **Rutas en inglés, etiquetas en español:** `/syllabus` (label "Temario"), `/today` (label "Hoy"). Coherente con el código actual.
- **Práctica por subtema:** extender el kind `topic` para aceptar `subtopicId` opcional (reusa toda la maquinaria de `sessions`), en vez de crear un kind nuevo.
- **Cuenta regresiva al examen / `examDate`:** FUERA de alcance por ahora.
- **Specs:** son vivas. Se actualizan/eliminan las que queden obsoletas con el rediseño; cada cambio se registra abajo.
- **Convex:** investigar docs (https://docs.convex.dev) antes de diseñar schema/queries; en particular el conteo de preguntas por subtema (Convex no tiene `COUNT` nativo).

## Registro de aprendizajes y decisiones
> Una entrada por tarea completada (qué se hizo, qué cambió en el schema/arquitectura, qué aprendimos).

### Fase 1 — Temario navegable (✅)
**Qué se hizo**
- Backend: módulo nuevo `packages/convex/src/syllabus.ts` con `getSyllabus(studentId)` (auth con `assertOwnsStudent`), que une el JSON de taxonomía con conteos de preguntas lanzables por materia/subtema y el `masteryScore` de los aggregates. Dominio global = promedio de las materias con evidencia (consistente con la página de Progreso).
- Backend: `topic` ahora acepta `subtopicId` opcional. Cambios en `createSession` (args + validación + derivación de materia desde el subtema + reutilización de sesión activa), `buildSelection`, `selectTopic` (conmuta a `by_primarySubtopicId_eligibility`), y campo `subtopicId` en `sessionDocumentValidator`. Sin migración: campo opcional.
- Refactor (limpieza): extraído `packages/convex/src/questionPool.ts` (`hasUsableMetadata`, `isInEligibilityPool`, `collectUsableQuestionsBy{Subject,Subtopic}`) — única definición de "pregunta lanzable", consumida por `sessions.ts` y `syllabus.ts`. Evita que el Temario anuncie un conteo que la práctica no puede cumplir.
- Frontend: ruta `/syllabus` + `SyllabusPage.tsx` (selector de materia, panel categoría→subtema, barra de dominio, chip de estado, botón Practicar por subtema). `RingProgress` extraído a `components/RingProgress.tsx` (reusado por Progreso). Helper `lib/syllabus-status.ts` para los 5 estados. `SyllabusPage` usa el tipo de retorno inferido de `getSyllabus` (sin redeclarar la forma). Nav: `Temario` añadido (y acentos corregidos en el shell).
- Specs actualizados: `PRODUCT_SPEC` (dirección del rediseño + objeto/flujo Temario), `DATA_MODEL_SPEC` (Session `kind`/`subjectId`/`subtopicId`, `selectionReason` completo, read model del sílabo), `ARCHITECTURE_SPEC` (vista Temario + seam del pool de preguntas).

**Aprendizajes / decisiones técnicas**
- **Conteo en Convex (research):** Convex no tiene `COUNT` nativo a propósito. Para V1 (cientos/miles de preguntas) `.collect().length` sobre índices es aceptable mientras cada materia esté muy por debajo de ~1000 docs y los escaneos por transacción bajo 32k docs / 16 MiB. Se cuenta agrupando por materia (5×2=10 barridos en paralelo con `Promise.all`) y bucketing por subtema en memoria. `@convex-dev/aggregate` sería sobre-ingeniería ahora; umbral de migración documentado en `syllabus.ts`.
- **Reactividad:** `getSyllabus` se reinvalida ante cualquier cambio en `questions`. Aceptable en V1; si el ingest frecuente causa thrashing, migrar a conteos denormalizados o al componente aggregate.
- **Codegen:** tras añadir un módulo de funciones Convex hay que correr `bunx convex codegen` (en `packages/convex`) para que el web vea `api.syllabus`. El route tree de TanStack se regenera con el plugin en dev/build (o `bunx @tanstack/router-cli generate`).
- **Verificación:** typecheck convex (exit 0) y web (solo 11 errores pre-existentes en `ai-elements/*`, cero nuevos); tests 6/6. El dev server lo corre el usuario.
- **Gate:** `/syllabus` exige diagnóstico completo (como Progreso/Práctica). Revisable si se quiere que el Temario sea explorable antes del diagnóstico.

### Fase 2 — Pantalla "Hoy" (✅)
**Qué se hizo**
- Backend: `packages/convex/src/today.ts` con `getTodayDashboard(studentId)` — racha y días activos de la semana derivados de `questionAttempts` (sin esquema nuevo). Días bucketeados en zona Colombia (UTC-5) para que el día ruede a medianoche local.
- Backend: `computeStudentAppState` ahora devuelve `defaultRoute: '/today'` tras el diagnóstico → `/app` aterriza en Hoy.
- Frontend: ruta `/today` + `TodayPage.tsx` (saludo según hora, tarjeta de racha, "Tu plan de hoy" = CTA de práctica recomendada, "Foco de la semana" = materia más débil → Temario, "Continúa donde quedaste" = sesión activa). `Hoy` añadido como primer ítem de nav.
- Limpieza de arquitectura: extraído hook `lib/use-student-guard.ts` (login + gate de diagnóstico + estados de carga en un solo lugar) y componente `components/FullScreenLoader.tsx`. Refactorizadas las rutas `today`, `syllabus` y `progress` para usarlos (antes: el guard estaba copiado en 3-4 rutas).

**Aprendizajes / decisiones**
- **Reuso del motor existente:** "Hoy" no necesitó nueva lógica de recomendación — el "plan del día" envuelve el kind `recommended` ya existente. Las lecciones y el repaso espaciado del wireframe llegan en Fases 3-4; por ahora el plan es práctica recomendada + foco + continuar.
- **Racha sin esquema:** derivada de attempts en una query reactiva. Si crece mucho el histórico de attempts, considerar denormalizar la racha (igual que el conteo del Temario).
- **Verificación:** convex tsc exit 0, web solo 11 errores pre-existentes, tests 6/6.

### Fase 3 — Lecciones IA por concepto (✅)
**Qué se hizo**
- Backend: tabla `conceptLessons` (validador en `validators.ts`, tabla en `schema.ts`, índices `by_subtopicId`/`by_status`). Módulo `lessons.ts` con el flujo generar-y-cachear (query/mutation/internalAction/internalMutation). Modelo `openrouter('deepseek/deepseek-v4-pro')` + `generateObject` (AI SDK) con esquema Zod {ideaBody, icfesBody, commonMistakes[], demoHtml opcional}. `OPENROUTER_API_KEY` (ya configurada para el tutor). `getSyllabus` enciende `hasLesson` con scan `by_status==ready`.
- Frontend: ruta `/lesson/$subtopicId` + `LessonPage.tsx` (MarkdownBlock/KaTeX, iframe sandbox para la demo, errores como tarjetas, CTA practicar, estados generando/failed). Enlace + chip "Lección" desde el Temario (`SyllabusPage` SubtopicRow). Helpers `conceptLessonQuery` y `getSubjectIdForSubtopic`.
- Limpieza: extraído `packages/convex/src/taxonomy.ts` (lookups: `SUBJECT_IDS`, `getSubtopicContext`, `getSubjectIdForSubtopic`, `getSubjectLabel`, `getSubtopicLabel`) — consumido por `sessions.ts`, `lessons.ts` y `tutor.ts` (se eliminaron los mapas locales `subjectLabelById`/`subtopicLabelById` del tutor), eliminando las traversals duplicadas del JSON de taxonomía en el backend.
- CTA "Repasar este concepto" en el Review: enlace por pregunta a `/lesson/$subtopicId` del subtema actual, tras la explicación, sin tocar el flujo del tutor/artifacts.

**Aprendizajes / decisiones**
- **NO `@convex-dev/agent`** para contenido cacheado de una pasada: el Agent aporta hilos/historial/streaming innecesarios. Una `internalAction` con el AI SDK directo es lo correcto. El Agent se reserva para el tutor conversacional.
- **Patrón generar-y-cachear (research Convex):** las queries no pueden llamar LLMs (deben ser deterministas) → la generación va en una action agendada desde una mutation; el estado `generating` + serializabilidad/OCC de Convex actúa como lock lógico que deduplica solicitudes concurrentes; reactividad automática al pasar a `ready`. `promptVersion` invalida lecciones viejas. Timeout de lock (3 min) re-reclama generaciones colgadas (las actions no se reintentan solas).
- **Bug atrapado por el typecheck humano/linter:** `createSession` requiere `studentId`; un `as never` lo había ocultado en `LessonPage`. Corregido pasando `studentId` a la página. Lección: cuidado con `as never` sobre args de mutación.
- **Reusos clave:** `ARTIFACT_AUTHORING_GUIDE` del tutor inspiró las reglas condensadas de la demo HTML; el iframe `sandbox="allow-scripts"` de `ArtifactPane`; `MarkdownBlock` (KaTeX, imprescindible para fórmulas).
- **Verificación:** convex tsc exit 0; web solo 11 errores pre-existentes; tests 6/6. La generación real de lecciones requiere `OPENROUTER_API_KEY` en el deployment y se prueba en runtime (el usuario corre dev).

### Fase 4 — Repaso espaciado + resumen semanal (✅)
**Qué se hizo**
- Repaso: añadido el kind `repaso` a `SESSION_KINDS`/`sessionKindValidator` (el guard de compile-time mantiene la sincronía) + config en `sessionKinds.ts` + estrategia `review_mistakes`. En `sessions.ts`: `collectDueReviewQuestions` (último intento incorrecto = "no aprendida", más antiguas primero) + `selectReviewMistakes` + query `getReviewQueue`. Icono `RotateCcw` en `session-display.ts`. Surface en `TodayPage` (tarjeta) y filtro en el hub.
- Coach: `coach.ts` con `getWeeklyCoachSummary`/`requestWeeklyCoachSummary`/`getWeeklyStats` (internalQuery)/`generateWeeklyCoachSummary` (internalAction, `generateText`)/`markReady`/`markFailed`. Tabla `coachSummaries`. Surface en `TodayPage` (solicitud bajo demanda solo si `activeDaysThisWeek>0`).

**Aprendizajes / decisiones**
- **Añadir un session kind** toca: `SESSION_KINDS`, `sessionKindValidator` (el `_assertSessionKind` obliga a sincronizar), `SESSION_KIND_CONFIG`, `SelectionStrategy` + `buildSelection`, `recommendationSourceForKind`, y `KIND_ICON` (Record<SessionKind> obliga a añadir icono). El typecheck guía todos los puntos.
- **Repaso espaciado V1** simple y honesto: "due" = preguntas cuyo intento más reciente fue incorrecto; orden por antigüedad. Sin curva SM-2 todavía (suficiente para V1; se puede sofisticar luego con intervalos por nº de aciertos consecutivos).
- **Resumen semanal:** reusó el patrón generar-y-cachear (clave `(studentId, weekIndex)`, semana en UTC-5). Se genera solo con actividad para no gastar LLM en semanas vacías. `getWeeklyStats` es un `internalQuery` que la action invoca con `runQuery` (las actions no leen DB directo).
- **Trabajo en paralelo detectado:** durante esta sesión, `tutor.ts` se consolidó contra `packages/convex/src/taxonomy.ts` y se añadió el CTA "Repasar este concepto" en el Review (`practice.$sessionId.review.tsx` → `/lesson/$subtopicId`). Verificado por grep + typecheck; consistente.
- **Verificación:** convex tsc exit 0; web solo 11 errores pre-existentes; tests 6/6.

### Fase 5 — Generación de preguntas por IA (✅)
**Qué se hizo**
- `packages/convex/src/generatedQuestions.ts`: action `generateSubtopicQuestions(subtopicId, count)` (auth) que genera MCQ estilo ICFES con `generateObject` (Zod: 4 opciones A-D, una correcta, solución) e inserta vía `internalMutation insertGeneratedQuestions`. `findAiUpload`/`createAiUpload` gestionan un `pdfUploads` sintético (storageId minteado con un blob mínimo, una sola vez).
- Frontend: botón "Generar más práctica con IA" en `LessonPage` (`useAction` de `convex/react`), con feedback de cuántas se añadieron.

**Aprendizajes / decisiones**
- **Integración no invasiva > schema change:** en vez de hacer `questions.pdfUploadId` opcional (ripple en ingest/admin), las preguntas IA viven en `questions` bajo un upload sintético (slug `ai-generated`). Cero cambios al schema central; reuso total de selección/sesiones/review/conteos. `eligibility: 'practice_only'` las mantiene fuera del diagnóstico.
- **`useAction` (no `useConvexMutation`)** para llamar actions desde el cliente — `useConvexMutation` es solo para mutations (lo atrapó el typecheck).
- **Calidad/riesgo:** las MCQ generadas afirman su propia respuesta correcta (sin verificación independiente). V1 lo acepta con prompt riguroso + `practice_only`. Mejora futura: verificación adversarial de la respuesta o gating de calidad antes de habilitarlas.
- **Trabajo en paralelo:** se extrajo `packages/convex/src/aiCache.ts` (`decideClaim`) y `lessons.ts`/`coach.ts` se refactorizaron para usarlo (consolidación del patrón claim/generar-cachear). Convex package ganó script `test`. Verificado por typecheck + tests.
- **Verificación:** convex tsc exit 0; web solo 11 errores pre-existentes; tests 6/6.

### Pasada de limpieza de arquitectura (post Fases 3-5)
Revisión del código del rediseño con la skill `improve-codebase-architecture` (un agente Explore mapeó la fricción; se aplicaron solo los deepenings que pasan el "deletion test").
- **`aiCache.ts` (`decideClaim`)** — política pura de "cuándo (re)generar" del patrón generar-y-cachear, antes duplicada e incrustada en `lessons.ts` y `coach.ts`. Ahora se enuncia una vez y es testeable (la mecánica tipada tabla/índice/action se queda en cada caller). Primer test del paquete convex (`test/aiCache.test.ts`, 7 casos) + script `test`.
- **`collectDueReviewQuestions` (consolidación + bug)** — el conteo de `getReviewQueue` (tarjeta "Repaso de errores" en Hoy) contaba **todas** las preguntas con último intento incorrecto, pero `selectReviewMistakes` filtraba además por lanzabilidad (`hasUsableMetadata` + `eligibility`). La tarjeta podía anunciar más preguntas de las que la sesión podía lanzar (mismo defecto que `questionPool` previno en Fase 1). Ahora el helper devuelve solo las preguntas **lanzables** de repaso y conteo + selección comparten esa única definición.
- **Descartados con criterio (deletion test):** helper genérico para los wrappers `convexQuery(...'skip')` de `student-queries.ts` (solo movería boilerplate); hook `useGeneratedContent` para LessonPage/TodayPage (las dos superficies divergen — el coach no tiene estados failed/retry —, sería un wrapper shallow); unificar los "readiness bands" de `syllabus-status.ts` vs `StudentProgressPage` (etiquetas deliberadamente distintas, decisión de producto).
- **Verificación:** convex tsc exit 0; web solo 11 errores pre-existentes; tests 4 tareas (convex 7, ingest 4, web 2).

### Mejora de lecciones IA: demos integradas + carga reactiva (post Fases 3-5)
- **Demo integrada (no HTML genérico):** la demo dejó de generarse como documento HTML autónomo con estilos propios. Ahora el modelo produce un **fragmento** que usa las variables CSS de la app (`--accent`, `--bg-card`, `--text-*`, `--radius-*`, `--font-*`); el cliente lo envuelve con `buildDemoDocument(fragment, theme)` (`apps/web/src/lib/demo-document.ts`), inyectando fuentes (Fraunces/Manrope), tokens y el **tema claro/oscuro actual**. Hook `useResolvedTheme` (observa la clase de `<html>`) para que la demo siga el tema; el iframe se re-renderiza al cambiarlo. `DEMO_FRAGMENT_RULES` en `lessons.ts` instruye al modelo a usar esos tokens y no codificar colores/fuentes.
- **La demo es para explorar, no evaluar:** el prompt prohíbe explícitamente preguntas/quizzes/ejercicios en la demo (tanto en la decisión de fase 1 `demoConcept` como en `DEMO_FRAGMENT_RULES`) — para practicar preguntas están la práctica por tema, el CTA y la generación con IA. `PROMPT_VERSION` → `v3`.
- **Enfoque "entender el tema" (estilo Khan Academy):** se eliminaron las secciones "Cómo lo pregunta el ICFES" (`icfesBody`) y "Errores comunes" (`commonMistakes`) del schema, validador, prompt y UI. La lección ahora es una **explicación que enseña el concepto** (`ideaBody`, más completa: intuición → ejemplo → para qué sirve) + demo opcional. El prompt y el schema piden solo explicación, sin formatos de examen ni práctica. `PROMPT_VERSION` → `v4`. (El usuario borra los registros viejos; el schema con `schemaValidation` rechazaría docs con los campos eliminados hasta que se borren.)
- **Carga explícita vía socket reactivo:** generación dividida en dos fases que parchean la fila (campo `stage`): fase 1 escribe el texto (`stage: 'writing'` → `'demo'`), fase 2 construye la demo opcional → `ready`. El cliente muestra "Escribiendo tu lección…" y luego el **texto completo** con un placeholder "Creando una demostración interactiva…" donde irá la demo — sin polling, solo parches a la DB. La demo es resiliente: si falla la fase 2, la lección se publica con su texto. `PROMPT_VERSION` → `v2` (regenera las cacheadas vía `decideClaim`).
- **Specs:** `DATA_MODEL_SPEC` (campo `stage`, demo como fragmento, dos fases) y `ARCHITECTURE_SPEC` §5 (flujo reactivo en dos fases + shell temificado).
- **Verificación:** convex codegen + tsc exit 0; web solo 11 errores pre-existentes; tests 4 tareas (convex 7, ingest 4, web 2).

### Rediseño de Progreso: de foto estática a "cuánto he mejorado"
La vista anterior solo mostraba el dominio actual (precisión + bandas por materia + subtemas débiles), sin evolución. Rediseñada en torno a la **mejora**:
- **Backend:** `getProgressTrends` (nuevo, `progress.ts`) — serie de **precisión semanal** + totales de actividad (preguntas, días activos, primera actividad), derivados de `questionAttempts` (sin estado nuevo). Query aparte de `getStudentProgress` para no encarecer la query que también usa "Hoy". El "antes" sale de `snapshot.diagnosticBaseline` (overall + `subjectScores`) que ya existía.
- **Frontend (`StudentProgressPage`):** hero con **delta de precisión vs diagnóstico** ("Has subido N puntos"); **gráfico de tendencia** SVG hecho a mano (área+línea, sin librería) de precisión semanal; **"Antes y ahora" por materia** (diagnóstico → actual con barra + tick de baseline + chip de delta, ordenado por mejora); tarjetas de actividad (incl. "lo que más mejoró"); y "Sigue mejorando aquí" = subtemas débiles **enlazados a su lección**. Acentos corregidos (la versión vieja tenía "preparacion"/"diagnostico" sin tilde).
- **Limpieza:** extraído `packages/convex/src/colombiaTime.ts` (`colombiaDayNumber`/`colombiaWeekIndex`/`colombiaWeekStartMs`) — `today.ts` y `coach.ts` migrados (eliminadas 2 copias de la lógica de zona horaria UTC-5); reusado por la tendencia de progreso.
- **Specs:** `PRODUCT_SPEC` §3 (la vista de progreso se enmarca en mejora, no foto).
- **Verificación:** convex codegen + tsc exit 0; web solo 11 errores pre-existentes; tests 4 tareas.
