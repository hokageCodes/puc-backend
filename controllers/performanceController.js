import mongoose from 'mongoose';
import PerformanceCycle from '../models/PerformanceCycle.js';
import PerformanceReview from '../models/PerformanceReview.js';
import Staff from '../models/Staff.js';
import {
  buildPerformanceMeta,
  OBJECTIVE_WEIGHTINGS,
  OBJECTIVE_STATUS_MID,
  OBJECTIVE_STATUS_HALF,
  BEHAVIOUR_RATINGS,
  CHAR_LIMITS,
  FINAL_RATINGS,
} from '../utils/performanceEnums.js';
import {
  nextCycleStage,
  AGREED_OR_LATER,
  seedBehaviours,
  validatePlan,
  canTransitionReview,
  reviewStatusRank,
} from '../utils/performanceWorkflow.js';
import { canManageReview } from '../utils/performanceAccess.js';
import { filterReviewForViewer, viewerRoleFor } from '../utils/performanceVisibility.js';
import { computeSuggestedScore } from '../utils/performanceScore.js';
import { sendEmail, buildPerformanceNoticeEmail } from '../utils/email.js';

const fullName = (s) => (s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() : '');

const asObject = (review) => (review?.toObject ? review.toObject() : review);

// Shape a review for the employee's own /me view: D6 filtering + a suggested score
// from their own half-year self-assessment.
const myView = (review) => {
  const filtered = filterReviewForViewer(asObject(review), 'employee');
  return { ...filtered, suggestion: computeSuggestedScore(filtered, 'employee') };
};

// Shape a review for a manager/HR viewer: filter per role + suggestion from the
// relevant author's half-year assessment.
const viewerView = (review, user) => {
  const role = viewerRoleFor(review, user);
  const filtered = filterReviewForViewer(asObject(review), role);
  return { ...filtered, suggestion: computeSuggestedScore(filtered, role === 'employee' ? 'employee' : 'manager') };
};

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
    // Freeze the cycle's reviews into a terminal state for the record.
    await PerformanceReview.updateMany({ cycle: cycle._id, status: { $ne: 'closed' } }, { $set: { status: 'closed' } });
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
    // The caller is the employee on their own review — they see the manager's
    // entries only once a stage is returned (D6).
    return res.json({ cycle, review: myView(review) });
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
      .populate('lineManager teamLead', 'firstName lastName')
      .populate('cycle', 'label stage');
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot view this review.' });

    // Manager sees the employee's entries only once shared (D6); HR/admin see all.
    return res.json(viewerView(review, req.user));
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

// ── Stage assessments (mid-term & half-year) — generic over stage ───────────────

const STAGE_PARAMS = ['mid', 'half'];
const CYCLE_STAGE_FOR = { mid: 'mid_term', half: 'half_year' };
const OBJ_STATUS_BY_STAGE = { mid: OBJECTIVE_STATUS_MID, half: OBJECTIVE_STATUS_HALF };
const SHARE_TARGET = { mid: 'mid_employee', half: 'half_employee' };
const RETURN_TARGET = { mid: 'mid_manager_returned', half: 'half_manager_returned' };
const stageLabel = (s) => (s === 'mid' ? 'mid-term' : 'half-year');

// Replace any existing {stage,author} entry, then add the new one.
const upsertEntry = (entries, { stage, author, ...rest }) => {
  const kept = (entries || []).filter((e) => !(e.stage === stage && e.author === author));
  kept.push({ stage, author, ...rest, updatedAt: new Date() });
  return kept;
};

// Merge an incoming assessment (index-aligned to objectives/behaviours) into the review.
const mergeAssessment = (review, { stage, author, body }) => {
  const objStatuses = OBJ_STATUS_BY_STAGE[stage];
  const objInputs = Array.isArray(body.objectives) ? body.objectives : [];
  review.objectives.forEach((o, i) => {
    const inp = objInputs[i];
    if (!inp) return;
    const status = objStatuses.includes(inp.status) ? inp.status : undefined;
    const comments = typeof inp.comments === 'string' ? inp.comments.slice(0, CHAR_LIMITS.OBJECTIVE_COMMENT) : undefined;
    if (status === undefined && !comments) return;
    o.entries = upsertEntry(o.entries, { stage, author, status, comments });
  });

  const behInputs = Array.isArray(body.behaviours) ? body.behaviours : [];
  review.behaviours.forEach((b, i) => {
    const inp = behInputs[i];
    if (!inp) return;
    const rating = BEHAVIOUR_RATINGS.includes(inp.rating) ? inp.rating : undefined;
    const comments = typeof inp.comments === 'string' ? inp.comments.slice(0, CHAR_LIMITS.BEHAVIOUR_COMMENT) : undefined;
    if (rating === undefined && !comments) return;
    b.entries = upsertEntry(b.entries, { stage, author, rating, comments });
  });
};

// PUT /api/performance/me/assessment/:stage — employee self-assessment (mid|half).
export const saveMyAssessment = async (req, res) => {
  try {
    const stage = req.params.stage;
    if (!STAGE_PARAMS.includes(stage)) return res.status(400).json({ message: 'Invalid stage.' });

    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (cycle.stage !== CYCLE_STAGE_FOR[stage]) return res.status(409).json({ message: `The ${stageLabel(stage)} review isn't open yet.` });
    if (reviewStatusRank(review.status) < reviewStatusRank('plan_agreed')) {
      return res.status(409).json({ message: 'Your plan must be agreed before you can complete a review.' });
    }

    mergeAssessment(review, { stage, author: 'employee', body: req.body });
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(myView(review));
  } catch (err) {
    console.error('saveMyAssessment error:', err);
    return res.status(500).json({ message: 'Failed to save your review.' });
  }
};

// POST /api/performance/me/share/:stage — hand the stage to the manager.
export const shareMyStage = async (req, res) => {
  try {
    const stage = req.params.stage;
    if (!STAGE_PARAMS.includes(stage)) return res.status(400).json({ message: 'Invalid stage.' });

    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (cycle.stage !== CYCLE_STAGE_FOR[stage]) return res.status(409).json({ message: `The ${stageLabel(stage)} review isn't open yet.` });

    const flag = `${stage}Shared`;
    if (!review.sharedFlags[flag]) {
      review.sharedFlags[flag] = true;
      if (canTransitionReview(review.status, SHARE_TARGET[stage])) review.status = SHARE_TARGET[stage];
      review.timeline.push({ event: `${stage}_shared`, actor: req.user.id });
      review.updatedBy = req.user.id;
      await review.save();

      const managerId = review.lineManager || review.teamLead;
      if (managerId) {
        const [manager, staff] = await Promise.all([
          Staff.findById(managerId).select('firstName lastName email'),
          Staff.findById(req.user.id).select('firstName lastName'),
        ]);
        await notifyPerformance({
          to: manager?.email,
          recipientName: manager?.firstName || 'there',
          subject: `${stageLabel(stage)} review shared — ${fullName(staff)}`,
          intro: `<strong>${fullName(staff) || 'A team member'}</strong> has shared their ${stageLabel(stage)} self-assessment for your review.`,
          cycleLabel: cycle.label,
          cta: '/hub/performance/reviews',
        });
      }
    }
    return res.json(myView(review));
  } catch (err) {
    console.error('shareMyStage error:', err);
    return res.status(500).json({ message: 'Failed to share your review.' });
  }
};

// PUT /api/performance/reviews/:id/assessment/:stage — manager assessment (mid|half).
export const saveManagerAssessment = async (req, res) => {
  try {
    const { id, stage } = req.params;
    if (!STAGE_PARAMS.includes(stage)) return res.status(400).json({ message: 'Invalid stage.' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot action this review.' });

    const cycle = await PerformanceCycle.findById(review.cycle).select('stage');
    if (!cycle || cycle.stage !== CYCLE_STAGE_FOR[stage]) {
      return res.status(409).json({ message: `The ${stageLabel(stage)} review isn't open.` });
    }

    mergeAssessment(review, { stage, author: 'manager', body: req.body });
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(viewerView(review, req.user));
  } catch (err) {
    console.error('saveManagerAssessment error:', err);
    return res.status(500).json({ message: 'Failed to save your assessment.' });
  }
};

// POST /api/performance/reviews/:id/return/:stage — return the stage to the employee.
export const returnStage = async (req, res) => {
  try {
    const { id, stage } = req.params;
    if (!STAGE_PARAMS.includes(stage)) return res.status(400).json({ message: 'Invalid stage.' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot action this review.' });

    const flag = `${stage}Returned`;
    if (!review.sharedFlags[flag]) {
      review.sharedFlags[flag] = true;
      if (canTransitionReview(review.status, RETURN_TARGET[stage])) review.status = RETURN_TARGET[stage];
      review.timeline.push({ event: `${stage}_returned`, actor: req.user.id });
      review.updatedBy = req.user.id;
      await review.save();

      const [manager, staff, cyc] = await Promise.all([
        Staff.findById(req.user.id).select('firstName lastName'),
        Staff.findById(review.staff).select('firstName lastName email'),
        PerformanceCycle.findById(review.cycle).select('label'),
      ]);
      await notifyPerformance({
        to: staff?.email,
        recipientName: staff?.firstName || 'there',
        subject: `${stageLabel(stage)} review returned`,
        intro: `${fullName(manager) || 'Your manager'} has completed and returned your ${stageLabel(stage)} review. You can now see their assessment.`,
        cycleLabel: cyc?.label,
        cta: '/hub/performance',
      });
    }
    return res.json(viewerView(review, req.user));
  } catch (err) {
    console.error('returnStage error:', err);
    return res.status(500).json({ message: 'Failed to return the review.' });
  }
};

// ── Final rating (half-year; manual pick with the suggested score as guidance) ──

const readFinal = (body) => ({
  rating: FINAL_RATINGS.includes(body.rating) ? body.rating : null,
  rationale: typeof body.rationale === 'string' ? body.rationale.slice(0, CHAR_LIMITS.FINAL_RATIONALE) : '',
});

// POST /api/performance/me/final-rating — employee proposes their final rating.
export const setMyFinalRating = async (req, res) => {
  try {
    const { cycle, review } = await loadOrCreateMyReview(req.user.id);
    if (!cycle) return res.status(409).json({ message: 'There is no active performance cycle.' });
    if (cycle.stage !== 'half_year') return res.status(409).json({ message: 'The final rating can only be set during the half-year review.' });

    const { rating, rationale } = readFinal(req.body);
    if (!rating) return res.status(400).json({ message: 'Please choose a valid final rating.' });

    review.employeeFinalRating = rating;
    review.employeeFinalRationale = rationale;
    review.timeline.push({ event: 'employee_final_rating', actor: req.user.id, note: rating });
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(myView(review));
  } catch (err) {
    console.error('setMyFinalRating error:', err);
    return res.status(500).json({ message: 'Failed to save your final rating.' });
  }
};

// POST /api/performance/reviews/:id/manager-final — manager records their final rating.
export const setManagerFinalRating = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (!canManageReview(review, req.user)) return res.status(403).json({ message: 'You cannot action this review.' });

    const cycle = await PerformanceCycle.findById(review.cycle).select('stage');
    if (!cycle || cycle.stage !== 'half_year') return res.status(409).json({ message: 'The final rating can only be set during the half-year review.' });

    const { rating, rationale } = readFinal(req.body);
    if (!rating) return res.status(400).json({ message: 'Please choose a valid final rating.' });

    review.managerFinalRating = rating;
    review.managerFinalRationale = rationale;
    review.timeline.push({ event: 'manager_final_rating', actor: req.user.id, note: rating });
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(viewerView(review, req.user));
  } catch (err) {
    console.error('setManagerFinalRating error:', err);
    return res.status(500).json({ message: 'Failed to save the final rating.' });
  }
};

// ── HR moderation (HR/admin) ────────────────────────────────────────────────────

// POST /api/performance/reviews/:id/moderate — set the moderated rating of record.
// HR can override the employee/manager ratings; the change is logged on the timeline.
export const moderateReview = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    const rating = FINAL_RATINGS.includes(req.body.rating) ? req.body.rating : null;
    if (!rating) return res.status(400).json({ message: 'Please choose a valid moderated rating.' });
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 1000) : '';

    const prev = review.moderatedFinalRating;
    review.moderatedFinalRating = rating;
    review.moderationNote = note;
    if (canTransitionReview(review.status, 'moderation')) review.status = 'moderation';
    review.timeline.push({
      event: 'moderated',
      actor: req.user.id,
      note: `${prev ? `${prev} → ` : ''}${rating}${note ? ` · ${note}` : ''}`,
    });
    review.updatedBy = req.user.id;
    await review.save();

    // Let both voices know the rating of record is set.
    const [staff, cyc] = await Promise.all([
      Staff.findById(review.staff).select('firstName lastName email'),
      PerformanceCycle.findById(review.cycle).select('label'),
    ]);
    await notifyPerformance({
      to: staff?.email,
      recipientName: staff?.firstName || 'there',
      subject: 'Performance review moderated',
      intro: `Your performance review for ${cyc?.label || 'this cycle'} has been moderated. The final rating of record is <strong>${rating}</strong>.`,
      cycleLabel: cyc?.label,
      extra: note ? `Note: ${note}` : undefined,
      cta: '/hub/performance',
    });
    return res.json(viewerView(review, req.user));
  } catch (err) {
    console.error('moderateReview error:', err);
    return res.status(500).json({ message: 'Failed to moderate the review.' });
  }
};

// POST /api/performance/reviews/:id/reopen — send a review back for further edits.
export const reopenReview = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid review id.' });

    const review = await PerformanceReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 1000) : '';
    review.status = 'reopened';
    review.timeline.push({ event: 'reopened', actor: req.user.id, note: note || undefined });
    review.updatedBy = req.user.id;
    await review.save();
    return res.json(viewerView(review, req.user));
  } catch (err) {
    console.error('reopenReview error:', err);
    return res.status(500).json({ message: 'Failed to reopen the review.' });
  }
};

// ── Reporting (Phase 7) ─────────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/performance/cycles/:id/export — CSV of all reviews in a cycle (HR/admin).
export const exportCycle = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid cycle id.' });
    const cycle = await PerformanceCycle.findById(id);
    if (!cycle) return res.status(404).json({ message: 'Cycle not found.' });

    const reviews = await PerformanceReview.find({ cycle: id }).populate('staff', 'firstName lastName staffCode').lean();
    const header = ['Staff', 'Staff code', 'Department', 'Status', 'Employee rating', 'Manager rating', 'Moderated rating', 'Suggested band'];
    const rows = [header];
    for (const r of reviews) {
      const s = computeSuggestedScore(r, 'manager');
      rows.push([
        fullName(r.staff), r.staff?.staffCode || '', r.departmentSnapshot || '', r.status,
        r.employeeFinalRating || '', r.managerFinalRating || '', r.moderatedFinalRating || '', s ? String(s.band) : '',
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="performance-${cycle.label.replace(/\s+/g, '_')}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportCycle error:', err);
    return res.status(500).json({ message: 'Failed to export the cycle.' });
  }
};

// GET /api/performance/me/history — the caller's reviews across all cycles (read-only).
export const getMyHistory = async (req, res) => {
  try {
    const reviews = await PerformanceReview.find({ staff: req.user.id })
      .populate('cycle', 'label stage')
      .sort({ createdAt: -1 })
      .lean();
    const items = reviews.map((r) => ({
      _id: r._id,
      cycle: r.cycle,
      status: r.status,
      employeeFinalRating: r.employeeFinalRating || null,
      managerFinalRating: r.managerFinalRating || null,
      moderatedFinalRating: r.moderatedFinalRating || null,
      updatedAt: r.updatedAt,
    }));
    return res.json(items);
  } catch (err) {
    console.error('getMyHistory error:', err);
    return res.status(500).json({ message: 'Failed to load your performance history.' });
  }
};
