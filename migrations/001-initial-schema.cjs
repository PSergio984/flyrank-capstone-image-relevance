'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Images: corpus + vision-derived metadata. Status machine makes
  // pending/processed/flagged/quarantined states queryable (Probe 1).
  pgm.createTable(
    'images',
    {
      id: { type: 'serial', primaryKey: true },
      file_path: { type: 'text', notNull: true, unique: true },
      source_url: { type: 'text' },
      license: { type: 'text' },
      photographer: { type: 'text' },
      category: { type: 'text' },
      subject: { type: 'text' },
      caption: { type: 'text' },
      confidence: { type: 'numeric(3,2)' },
      flagged: { type: 'boolean', notNull: true, default: false },
      status: {
        type: 'text',
        notNull: true,
        default: 'pending',
        check: "status IN ('pending','processed','flagged','quarantined')",
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    {},
  );
  pgm.createIndex('images', 'status');
  pgm.createIndex('images', 'flagged', { where: 'flagged' });

  // Posts: seed content + cached post-classification expectations.
  pgm.createTable(
    'posts',
    {
      id: { type: 'serial', primaryKey: true },
      slug: { type: 'text', notNull: true, unique: true },
      title: { type: 'text', notNull: true },
      body: { type: 'text', notNull: true },
      expected_subject: { type: 'text' },
      expected_category: { type: 'text' },
      classify_confidence: { type: 'numeric(3,2)' },
      classified_at: { type: 'timestamptz' },
    },
    {},
  );

  // Embeddings: one row per entity per model; model+dims persisted because
  // embedding spaces are incompatible across models.
  pgm.createTable(
    'embeddings',
    {
      entity_type: {
        type: 'text',
        notNull: true,
        check: "entity_type IN ('image_caption','post_body')",
      },
      entity_id: { type: 'integer', notNull: true },
      model: { type: 'text', notNull: true },
      dims: { type: 'integer', notNull: true },
      vector: { type: 'real[]', notNull: true },
      normalized: { type: 'boolean', notNull: true, default: false },
    },
    {
      constraints: {
        primaryKey: ['entity_type', 'entity_id', 'model'],
      },
    },
  );
  // NOTE: no FK on entity_id by design - it is polymorphic (image_caption ->
  // images.id, post_body -> posts.id); integrity is enforced at the repository.

  // Suggestions: every guard answer is an auditable row. The unique constraint
  // on (post, image, guard_version) is the review-workflow idempotency.
  pgm.createTable(
    'suggestions',
    {
      id: { type: 'serial', primaryKey: true },
      post_id: {
        type: 'integer',
        notNull: true,
        references: 'posts',
        onDelete: 'cascade',
      },
      image_id: {
        type: 'integer',
        notNull: true,
        references: 'images',
        onDelete: 'cascade',
      },
      score: { type: 'numeric(6,4)' },
      verdict: {
        type: 'text',
        notNull: true,
        check: "verdict IN ('SUGGESTED','REJECTED','NO_CONFIDENT_MATCH')",
      },
      explanation: { type: 'text' },
      reasons: { type: 'jsonb', notNull: true, default: '[]' },
      guard_version: { type: 'text', notNull: true },
      thresholds_used: { type: 'jsonb' },
      status: {
        type: 'text',
        notNull: true,
        default: 'pending',
        check:
          "status IN ('pending','approved','rejected','rejected_by_guard')",
      },
      origin: {
        type: 'text',
        notNull: true,
        default: 'ranking',
        check: "origin IN ('ranking','forced_probe')",
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    {},
  );
  pgm.createIndex('suggestions', ['post_id', 'status']);
  pgm.addConstraint('suggestions', 'suggestions_unique_guard_answer', {
    unique: ['post_id', 'image_id', 'guard_version'],
  });

  // Review events: append-only audit of HUMAN decisions only.
  pgm.createTable(
    'review_events',
    {
      id: { type: 'serial', primaryKey: true },
      suggestion_id: {
        type: 'integer',
        notNull: true,
        references: 'suggestions',
        onDelete: 'cascade',
      },
      action: {
        type: 'text',
        notNull: true,
        check: "action IN ('approve','reject')",
      },
      actor: { type: 'text', notNull: true, default: 'reviewer' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    {},
  );

  // Cost ledger: one row per AI call, written before job acknowledgement.
  pgm.createTable(
    'ai_cost_log',
    {
      id: { type: 'serial', primaryKey: true },
      job_id: { type: 'text' },
      kind: {
        type: 'text',
        notNull: true,
        check: "kind IN ('vision','embedding','post_classify')",
      },
      model: { type: 'text', notNull: true },
      input_tokens: { type: 'integer', notNull: true, default: 0 },
      output_tokens: { type: 'integer', notNull: true, default: 0 },
      cost_usd: { type: 'numeric(10,6)', notNull: true, default: 0 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    {},
  );
  pgm.createIndex('ai_cost_log', ['kind', 'created_at']);

  // Pipeline stages: progress observation + retry idempotency. A retried job
  // claims its stage row first; a row already done exits without re-calling AI.
  pgm.createTable(
    'pipeline_stages',
    {
      image_id: {
        type: 'integer',
        notNull: true,
        references: 'images',
        onDelete: 'cascade',
      },
      stage: {
        type: 'text',
        notNull: true,
        check: "stage IN ('vision','embedding')",
      },
      attempt: { type: 'integer', notNull: true, default: 0 },
      status: {
        type: 'text',
        notNull: true,
        default: 'queued',
        check: "status IN ('queued','running','done','failed','dead')",
      },
      error: { type: 'text' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    {
      constraints: { primaryKey: ['image_id', 'stage'] },
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable('pipeline_stages');
  pgm.dropTable('ai_cost_log');
  pgm.dropTable('review_events');
  pgm.dropTable('suggestions');
  pgm.dropTable('embeddings');
  pgm.dropTable('posts');
  pgm.dropTable('images');
};


