import { buildPerformanceMeta } from '../utils/performanceEnums.js';

/**
 * Performance Evaluation controller.
 *
 * Phase 0 ships only the metadata endpoint so the frontend can render dropdowns
 * and reference text from a single source. Subsequent phases add cycle admin,
 * employee planning, manager assessment, and HR moderation handlers here.
 * See PERFORMANCE-REVIEW-BUILD.md §C/§D.
 */

// GET /api/performance/meta — enums + the 5 fixed behaviours + rating descriptions.
// Any authenticated hub user may read it (it's reference data, no PII).
export const getMeta = async (req, res) => {
  try {
    return res.json(buildPerformanceMeta());
  } catch (err) {
    console.error('performance getMeta error:', err);
    return res.status(500).json({ message: 'Failed to load performance metadata.' });
  }
};
