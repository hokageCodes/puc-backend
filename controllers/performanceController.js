import mongoose from 'mongoose';
import PerformanceCycle from '../models/PerformanceCycle.js';
import PerformanceReview from '../models/PerformanceReview.js';
import Staff from '../models/Staff.js';
import { buildPerformanceMeta, OBJECTIVE_WEIGHTINGS } from '../utils/performanceEnums.js';
import {
  nextCycleStage,
  AGREED_OR_LATER,
  seedBehaviours,
  validatePlan,
  canTransitionReview,
} from '../utils/performanceWorkflow.js';
import { canManageReview } from '../utils/performanceAccess.js';
import { sendEmail, buildPerformanceNoticeEmail } from '../utils/email.js';

const fullName = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : '');

// Appraisal emails are gated so dry-runs on preview don't mail real staff.
// Flip PERF_EMAILS_ENABLED=true (prod) to actually send.
const perfEmailsEnabled = () => process.env.PERF_EMAILS_ENABLED === 'true';
const notifyPerformance = async ({ to, ...opts }) => {
  if (!to) return;
  if (!perfEmailsEnabled()) {
    console.log(`[perf email suppressed] "${opts.subject}" → ${to}`);
    return;
  }
  try {
    const msg = buildPerformanceNoticeEmail(opts);
    await sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text });
  } catch (e) {
    console.error('performance email failed:', e.message);
  }
};

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

// ── Employee planning (self-service; any authenticated hub staffer) ─────────────

// The active cycle = the most recent non-closed one. Usually exactly one is open.
const findOpenCycle = () => PerformanceCycle.findOne({ stage: { $ne: 'closed' } }).sort({ createdAt: -1 });

// Statuses where the employee may still edit their plan (objectives + CDP).
const PLAN_EDITABLE = ['draft', 'reopened'];

// Get the caller's review for the open cycle, creating a seeded draft on first visit.
const loadOrCreateMyReview = async (userId) => {
  const cycle = await findOpenCycle();
  if (!cycle) return { cycle: null, review: null };

  let review = await PerformanceReview.findOne({ cycle: cycle._id, staff: userId });
  if (!review) {
    const staff = await Staff.findById(userId).populate('department', 'name');
    review = await PerformanceReview.create({
      cycle: cycle._id,
      staff: userId,
      departmentSnapshot: staff?.department?.name || '',
      lineManager: staff?.lineManagerId || undefined,
      teamLead: staff?.teamLeadId || undefined,
      behaviours: seedBehaviours(),
      status: 'draft',
      createdBy: userId,
    });
  }
  return { cycle, review };
};

// Normalise an incoming objective to just the planning fields (entries are added
// later, at mid/half review — never accepted from the planning client).
const cleanObjective = (o = {}) => ({
  performanceArea: typeof o.performanceArea === 'string' ? o.performanceArea.trim() : '',
  weighting: OBJECTIVE_WEIGHTINGS.includes(Number(o.weighting)) ? Number(o.weighting) : undefined,
  target: typeof o.target === 'string' ? o.target.trim() : '',
  entries: [],
});

const cleanGoal = (g = {}) => ({
  competency: typeof g.competency === 'string' ? g.competency.trim() : '',
  howAchieved: typeof g.howAchieved === 'string' ? g.howAchieved.trim() : '',
  evidence: typeof g.evidence === 'string' ? g.evidence.trim() : '',
  dueDate: g.dueDate ? new Date(g.dueDate) : undefined,
  status: typeof g.status === 'string' ? g.status.trim() : '',
});

// GET /api/performance/me — my review for the open cycle (auto-creates a draft).
export const getMyReview = async (req, res) => {
  try {
    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.json({ cycle: null, review: null });
    return res.json({ cycle, review });
  } catch (err) {
    console.error('getMyReview error:', err);
    return res.status(500).json({ message: 'Failed to load your performance review.' });
  }
};

// PUT /api/performance/me/objectives — save the objectives draft (≤6).
export const updateMyObjectives = async (req, res) => {
  try {
    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (!PLAN_EDITABLE.includes(review.status)) {
      return res.status(409).json({ message: 'Your plan has already been submitted and can no longer be edited.' });
    }

    const incoming = Array.isArray(req.body.objectives) ? req.body.objectives : [];
    if (incoming.length > 6) return res.status(400).json({ message: 'No more than 6 objectives are allowed.' });

    review.objectives = incoming.map(cleanObjective);
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(review);
  } catch (err) {
    console.error('updateMyObjectives error:', err);
    return res.status(500).json({ message: 'Failed to save your objectives.' });
  }
};

// PUT /api/performance/me/goals — save the development-plan draft.
export const updateMyGoals = async (req, res) => {
  try {
    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (!PLAN_EDITABLE.includes(review.status)) {
      return res.status(409).json({ message: 'Your plan has already been submitted and can no longer be edited.' });
    }

    const incoming = Array.isArray(req.body.developmentGoals) ? req.body.developmentGoals : [];
    review.developmentGoals = incoming.map(cleanGoal);
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(review);
  } catch (err) {
    console.error('updateMyGoals error:', err);
    return res.status(500).json({ message: 'Failed to save your development plan.' });
  }
};

// POST /api/performance/me/submit-plan — validate + move draft → plan_submitted.
export const submitMyPlan = async (req, res) => {
  try {
    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (!PLAN_EDITABLE.includes(review.status)) {
      return res.status(409).json({ message: 'Your plan has already been submitted.' });
    }

    const { ok, errors } = validatePlan(review);
    if (!ok) return res.status(422).json({ message: 'Please complete your plan before submitting.', errors });

    if (!canTransitionReview(review.status, 'plan_submitted')) {
      return res.status(409).json({ message: 'This plan cannot be submitted in its current state.' });
    }

    review.status = 'plan_submitted';
    review.sharedFlags.planShared = true;
    review.timeline.push({ event: 'plan_submitted', actor: req.user.id });
    review.updatedBy = req.user.id;
    await review.save();

    // Notify the manager-of-record (line manager preferred, else team lead).
    const managerId = review.lineManager || review.teamLead;
    if (managerId) {
      const [manager, staff] = await Promise.all([
        Staff.findById(managerId).select('firstName lastName email'),
        Staff.findById(req.user.id).select('firstName lastName'),
      ]);
      await notifyPerformance({
        to: manager?.email,
        recipientName: manager?.firstName || 'there',
        subject: `Performance plan submitted — ${fullName(staff)}`,
        intro: `<strong>${fullName(staff) || 'A team member'}</strong> has submitted their performance plan for your review and agreement.`,
        cycleLabel: cycle.label,
        cta: '/hub/performance/reviews',
      });
    }
    return res.json(review);
  } catch (err) {
    console.error('submitMyPlan error:', err);
    return res.status(500).json({ message: 'Failed to submit your plan.' });
  }
};

// ── Manager / HR review queue + plan agreement ──────────────────────────────────

// GET /api/performance/reviews — reviews the caller can manage in the open cycle.
// HR/admin see all (non-draft); a manager sees only their own reports.
export const getTeamReviews = async (req, res) => {
  try {
    const cycle = await findOpenCycle();
    if (!cycle) return res.json([]);

    const roles = req.user.roles || [];
    const filter = { cycle: cycle._id, status: { $ne: 'draft' } };
    if (!(roles.includes('hr') || roles.includes('admin'))) {
      filter.$or = [{ lineManager: req.user.id }, { teamLead: req.user.id }];
    }

    const reviews = await PerformanceReview.find(filter)
      .populate('staff', 'firstName lastName staffCode')
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ cycle, reviews });
  } catch (err) {
    console.error('getTeamReviews error:', err);
    return res.status(500).json({ message: 'Failed to load the review queue.' });
  }
};

// GET /api/performance/reviews/:id — a single review (manager/HR view).
export const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id)
      .populate('staff', 'firstName lastName staffCode email')
      .populate('lineManager teamLead', 'firstName lastName');
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot view this review.' });

    return res.json(review);
  } catch (err) {
    console.error('getReviewById error:', err);
    return res.status(500).json({ message: 'Failed to load the review.' });
  }
};

// POST /api/performance/reviews/:id/agree-plan — agree or request changes.
export const agreePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const action = req.body.action === 'request_changes' ? 'request_changes' : 'agree';
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });
    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot action this review.' });
    if (review.status !== 'plan_submitted') return res.status(409).json({ message: 'This plan is not awaiting agreement.' });

    const [manager, staff, cyc] = await Promise.all([
      Staff.findById(req.user.id).select('firstName lastName'),
      Staff.findById(review.staff).select('firstName lastName email'),
      PerformanceCycle.findById(review.cycle).select('label'),
    ]);

    if (action === 'request_changes') {
      if (!comment) return res.status(400).json({ message: 'Please add a note explaining the changes needed.' });
      review.status = 'draft';
      review.sharedFlags.planShared = false;
      review.timeline.push({ event: 'plan_changes_requested', actor: req.user.id, note: comment });
      review.updatedBy = req.user.id;
      await review.save();

      await notifyPerformance({
        to: staff?.email,
        recipientName: staff?.firstName || 'there',
        subject: `Performance plan — changes requested`,
        intro: `${fullName(manager) || 'Your manager'} has asked for changes to your performance plan before agreeing it.`,
        cycleLabel: cyc?.label,
        extra: `Note: ${comment}`,
        cta: '/hub/performance',
      });
      return res.json(review);
    }

    // Agree: record the Team Lead/Unit Head sign-off on each development goal.
    const signOff = { name: fullName(manager), date: new Date() };
    review.developmentGoals.forEach((g) => { g.leadSignOff = signOff; });
    review.status = 'plan_agreed';
    review.timeline.push({ event: 'plan_agreed', actor: req.user.id, note: comment || undefined });
    review.updatedBy = req.user.id;
    await review.save();

    await notifyPerformance({
      to: staff?.email,
      recipientName: staff?.firstName || 'there',
      subject: `Performance plan agreed`,
      intro: `${fullName(manager) || 'Your manager'} has agreed your performance plan. You're all set for this cycle.`,
      cycleLabel: cyc?.label,
      extra: comment ? `Note: ${comment}` : undefined,
      cta: '/hub/performance',
    });
    return res.json(review);
  } catch (err) {
    console.error('agreePlan error:', err);
    return res.status(500).json({ message: 'Failed to action the plan.' });
  }
};
