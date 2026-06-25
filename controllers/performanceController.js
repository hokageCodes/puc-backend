import mongoose from 'mongoose';
import PerformanceCycle from '../models/PerformanceCycle.js';
import PerformanceReview from '../models/PerformanceReview.js';
import { buildPerformanceMeta } from '../utils/performanceEnums.js';
import { nextCycleStage, AGREED_OR_LATER } from '../utils/performanceWorkflow.js';

/**
 * Performance Evaluation controller.
 *
 * Phase 0: metadata. Phase 1: cycle administration (HR/admin) — create / list with
 * progress / advance stage / close. Later phases add employee planning, manager
 * assessment, and HR moderation. See PERFORMANCE-REVIEW-BUILD.md §C/§D.
 */

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

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

// ── Cycle administration (HR/admin; role enforced at the route) ─────────────────

// POST /api/performance/cycles — open a new appraisal round.
export const createCycle = async (req, res) => {
  try {
    const label = trim(req.body.label);
    if (!label) return res.status(400).json({ message: 'A cycle label is required (e.g. "H1 2026").' });

    const existing = await PerformanceCycle.findOne({ label });
    if (existing) return res.status(409).json({ message: 'A cycle with this label already exists.' });

    const dateKeys = ['planningOpensAt', 'midTermOpensAt', 'halfYearOpensAt', 'moderationOpensAt', 'closesAt'];
    const dates = {};
    for (const k of dateKeys) if (req.body[k]) dates[k] = new Date(req.body[k]);

    const cycle = await PerformanceCycle.create({ label, ...dates, createdBy: req.user.id });
    return res.status(201).json(cycle);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'A cycle with this label already exists.' });
    console.error('createCycle error:', err);
    return res.status(500).json({ message: 'Failed to create the cycle.' });
  }
};

// GET /api/performance/cycles — list cycles newest-first, each with progress counts.
export const listCycles = async (req, res) => {
  try {
    const cycles = await PerformanceCycle.find().sort({ createdAt: -1 }).lean();

    // One pass over reviews → per-cycle { total, agreed (plan_agreed or later), closed }.
    const agg = await PerformanceReview.aggregate([
      {
        $group: {
          _id: '$cycle',
          total: { $sum: 1 },
          agreed: { $sum: { $cond: [{ $in: ['$status', AGREED_OR_LATER] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
        },
      },
    ]);
    const byCycle = new Map(agg.map((a) => [String(a._id), a]));

    const withProgress = cycles.map((c) => {
      const p = byCycle.get(String(c._id)) || { total: 0, agreed: 0, closed: 0 };
      return { ...c, progress: { total: p.total, agreed: p.agreed, closed: p.closed } };
    });
    return res.json(withProgress);
  } catch (err) {
    console.error('listCycles error:', err);
    return res.status(500).json({ message: 'Failed to load cycles.' });
  }
};

// POST /api/performance/cycles/:id/advance — move to the next stage in order.
export const advanceCycle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid cycle id.' });

    const cycle = await PerformanceCycle.findById(id);
    if (!cycle) return res.status(404).json({ message: 'Cycle not found.' });

    const next = nextCycleStage(cycle.stage);
    if (!next) return res.status(400).json({ message: 'Cycle is already closed; it cannot be advanced.' });

    cycle.stage = next;
    cycle.updatedBy = req.user.id;
    await cycle.save();
    return res.json(cycle);
  } catch (err) {
    console.error('advanceCycle error:', err);
    return res.status(500).json({ message: 'Failed to advance the cycle.' });
  }
};

// POST /api/performance/cycles/:id/close — close the cycle (freezes further edits).
export const closeCycle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid cycle id.' });

    const cycle = await PerformanceCycle.findById(id);
    if (!cycle) return res.status(404).json({ message: 'Cycle not found.' });
    if (cycle.stage === 'closed') return res.status(400).json({ message: 'Cycle is already closed.' });

    cycle.stage = 'closed';
    cycle.updatedBy = req.user.id;
    await cycle.save();
    return res.json(cycle);
  } catch (err) {
    console.error('closeCycle error:', err);
    return res.status(500).json({ message: 'Failed to close the cycle.' });
  }
};
