'use strict';

const taxonomy = require('../../config/taxonomy.json');

function getSubjectInfo(subject) {
  return taxonomy.subjects[subject] || null;
}

function isTaxonomyConflict(expected, detected) {
  if (!expected || !detected) return null;
  const expInfo = getSubjectInfo(expected.subject);
  const detInfo = getSubjectInfo(detected.subject);
  // If either subject unknown, fall back to raw category comparison
  if (!expInfo || !detInfo) {
    if (expected.category !== detected.category) {
      return {
        code: 'CATEGORY_CONFLICT',
        detail: `Category mismatch: expected ${expected.category}, detected ${detected.category}`,
      };
    }
    if (expected.subject !== detected.subject) {
      return {
        code: 'SUBJECT_CONFLICT',
        detail: `Subject mismatch: expected ${expected.subject}, detected ${detected.subject}`,
      };
    }
    return null;
  }
  if (expInfo.coarse_category !== detInfo.coarse_category) {
    return {
      code: 'CATEGORY_CONFLICT',
      detail: `Category mismatch: expected ${expected.category}, detected ${detected.category}`,
    };
  }
  if (expInfo.subject_group !== detInfo.subject_group) {
    return {
      code: 'SUBJECT_CONFLICT',
      detail: `Subject mismatch: expected ${expected.subject}, detected ${detected.subject}`,
    };
  }
  return null;
}

module.exports = { getSubjectInfo, isTaxonomyConflict, taxonomy };
