'use strict';

// Single source of truth for thresholds — config/thresholds.json owns flag_floor/guard_version (shotgun surgery fix)
function getThresholds() {
  return require('../../config/thresholds.json');
}

module.exports = {
  VISION_MODEL: 'gemini-2.5-flash',
  EMBEDDING_MODEL: 'gemini-embedding-001',
  EMBEDDING_DIMS: 768,
  EMBEDDING_TASK_TYPE: 'SEMANTIC_SIMILARITY',
  get FLAG_FLOOR() {
    return getThresholds().flag_floor;
  },
  get GUARD_VERSION() {
    return getThresholds().guard_version;
  },
};
