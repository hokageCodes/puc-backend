import { describe, it, expect } from 'vitest';
import { buildApproverChain } from '../controllers/leaveController.js';

const TL = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const LM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const HR = 'aaaaaaaaaaaaaaaaaaaaaaa3';

const actionable = (chain) => chain.filter((s) => s.status === 'pending');

describe('buildApproverChain', () => {
  it('keeps every step when the three approvers are different people', () => {
    const chain = buildApproverChain({ teamLeadId: TL, lineManagerId: LM, hrId: HR });

    expect(chain.map((s) => s.role)).toEqual(['teamLead', 'lineManager', 'hr']);
    expect(actionable(chain)).toHaveLength(3);
  });

  it('collapses to one approval when the same person holds all three roles', () => {
    const chain = buildApproverChain({ teamLeadId: TL, lineManagerId: TL, hrId: TL });

    // All three roles are still recorded...
    expect(chain.map((s) => s.role)).toEqual(['teamLead', 'lineManager', 'hr']);
    // ...but the person is only asked once.
    const pending = actionable(chain);
    expect(pending).toHaveLength(1);
    expect(pending[0].role).toBe('teamLead');
    expect(chain.filter((s) => s.status === 'skipped').map((s) => s.role))
      .toEqual(['lineManager', 'hr']);
  });

  it('explains why a step was skipped', () => {
    const chain = buildApproverChain({ teamLeadId: TL, lineManagerId: TL, hrId: HR });

    expect(chain[1].status).toBe('skipped');
    expect(chain[1].comment).toContain('Team Lead');
    expect(actionable(chain).map((s) => s.role)).toEqual(['teamLead', 'hr']);
  });

  it('collapses a repeat that is not adjacent', () => {
    const chain = buildApproverChain({ teamLeadId: TL, lineManagerId: LM, hrId: TL });

    expect(actionable(chain).map((s) => s.role)).toEqual(['teamLead', 'lineManager']);
    expect(chain[2].status).toBe('skipped');
  });

  it('never collapses an unassigned HR step into a named approver', () => {
    // assignee null means "any HR" — a different person, not a repeat.
    const chain = buildApproverChain({ teamLeadId: TL, lineManagerId: TL, hrId: null });

    const pending = actionable(chain);
    expect(pending.map((s) => s.role)).toEqual(['teamLead', 'hr']);
    expect(pending[1].assignee).toBeNull();
  });

  it('omits roles nobody is assigned to, and still asks HR', () => {
    const chain = buildApproverChain({ teamLeadId: null, lineManagerId: null, hrId: HR });

    expect(chain).toHaveLength(1);
    expect(chain[0].role).toBe('hr');
    expect(chain[0].status).toBe('pending');
  });

  it('accepts populated documents as well as raw ids', () => {
    const chain = buildApproverChain({
      teamLeadId: { _id: TL, firstName: 'Ada' },
      lineManagerId: { _id: TL, firstName: 'Ada' },
      hrId: { _id: HR, firstName: 'Bola' },
    });

    expect(actionable(chain).map((s) => s.role)).toEqual(['teamLead', 'hr']);
  });
});
