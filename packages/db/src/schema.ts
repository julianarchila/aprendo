import { sql } from 'drizzle-orm'
import {
  check,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const assetUsageEnum = pgEnum('asset_usage', [
  'context',
  'stem',
  'option',
])

export const storageProviderEnum = pgEnum('storage_provider', [
  'local',
  's3',
  'r2',
  'postgres',
])

export const sourceDocuments = pgTable(
  'source_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    slug: text().notNull(),
    title: text().notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceChecksum: text('source_checksum'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('source_documents_slug_idx').on(table.slug),
    uniqueIndex('source_documents_checksum_idx').on(table.sourceChecksum),
  ],
)

export const questions = pgTable(
  'questions',
  {
    id: uuid().defaultRandom().primaryKey(),
    sourceDocumentId: uuid('source_document_id')
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: 'restrict' }),
    sourceQuestionNumber: integer('source_question_number').notNull(),
    context: text(),
    stem: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('questions_source_document_idx').on(table.sourceDocumentId),
    uniqueIndex('questions_source_number_idx').on(
      table.sourceDocumentId,
      table.sourceQuestionNumber,
    ),
  ],
)

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid().defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    label: text().notNull(),
    text: text(),
    isCorrect: boolean('is_correct'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('question_options_question_idx').on(table.questionId),
    uniqueIndex('question_options_position_idx').on(
      table.questionId,
      table.position,
    ),
    uniqueIndex('question_options_label_idx').on(table.questionId, table.label),
  ],
)

export const questionAssets = pgTable(
  'question_assets',
  {
    id: uuid().defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id').references(() => questionOptions.id, {
      onDelete: 'cascade',
    }),
    usage: assetUsageEnum().notNull(),
    position: integer().notNull(),
    storageProvider: storageProviderEnum('storage_provider').notNull(),
    storageKey: text('storage_key').notNull(),
    sourcePath: text('source_path'),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('question_assets_question_idx').on(table.questionId),
    index('question_assets_option_idx').on(table.optionId),
    uniqueIndex('question_assets_position_idx').on(
      table.questionId,
      table.usage,
      table.optionId,
      table.position,
    ),
    check(
      'question_assets_usage_owner_check',
      sql`(
        (${table.usage} = 'option' and ${table.optionId} is not null)
        or
        (${table.usage} <> 'option' and ${table.optionId} is null)
      )`,
    ),
  ],
)

export const contentTables = [
  sourceDocuments,
  questions,
  questionOptions,
  questionAssets,
] as const

export type SourceDocument = typeof sourceDocuments.$inferSelect
export type NewSourceDocument = typeof sourceDocuments.$inferInsert

export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert

export type QuestionOption = typeof questionOptions.$inferSelect
export type NewQuestionOption = typeof questionOptions.$inferInsert

export type QuestionAsset = typeof questionAssets.$inferSelect
export type NewQuestionAsset = typeof questionAssets.$inferInsert

export type AssetUsage = (typeof assetUsageEnum.enumValues)[number]
export type StorageProvider = (typeof storageProviderEnum.enumValues)[number]
