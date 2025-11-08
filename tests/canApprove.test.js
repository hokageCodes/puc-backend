import { describe, it, expect } from 'vitest';
import { canApprove } from '../middleware/auth.js';
import { ROLES } from '../config/rbac.js';

const buildRequest = ({
  staff = {},
  approverChain = [],
} = {}) => ({
  staff,
  approverChain,
});

const buildUser = ({
  id = 'user-id',
  roles = [],
  division = 'legal',
} = {}) => ({
  id,
  roles,
  division,
});

describe('canApprove helper', () => {
  it('allows admin regardless of chain', () => {
    const request = buildRequest();
    const user = buildUser({ roles: [ROLES.ADMIN] });
    expect(canApprove(request, user)).toBe(true);
  });

  it('allows HR regardless of chain', () => {
    const request = buildRequest();
    const user = buildUser({ roles: [ROLES.HR] });
    expect(canApprove(request, user)).toBe(true);
  });

  it('blocks approvals when staff division is admin', () => {
    const request = buildRequest({
      staff: { division: 'admin' },
      approverChain: [{ role: 'teamLead', status: 'pending' }],
    });
    const user = buildUser({ roles: [ROLES.TEAM_LEAD], id: 'tl-1' });
    expect(canApprove(request, user)).toBe(false);
  });

  it('allows pending teamLead step when user matches reporting chain', () => {
    const request = buildRequest({
      staff: { teamLeadId: 'tl-1' },
      approverChain: [
        { role: 'teamLead', status: 'pending' },
        { role: 'lineManager', status: 'blocked' },
      ],
    });
    const user = buildUser({ roles: [ROLES.TEAM_LEAD], id: 'tl-1' });
    expect(canApprove(request, user)).toBe(true);
  });

  it('rejects teamLead if IDs do not match', () => {
    const request = buildRequest({
      staff: { teamLeadId: 'tl-2' },
      approverChain: [{ role: 'teamLead', status: 'pending' }],
    });
    const user = buildUser({ roles: [ROLES.TEAM_LEAD], id: 'tl-1' });
    expect(canApprove(request, user)).toBe(false);
  });

  it('allows lineManager at pending step when user matches', () => {
    const request = buildRequest({
      staff: { lineManagerId: 'lm-1' },
      approverChain: [
        { role: 'teamLead', status: 'approved' },
        { role: 'lineManager', status: 'pending' },
      ],
    });
    const user = buildUser({ roles: [ROLES.LINE_MANAGER], id: 'lm-1' });
    expect(canApprove(request, user)).toBe(true);
  });

  it('rejects when no pending step exists', () => {
    const request = buildRequest({
      staff: { teamLeadId: 'tl-1' },
      approverChain: [
        { role: 'teamLead', status: 'approved' },
        { role: 'lineManager', status: 'approved' },
      ],
    });
    const user = buildUser({ roles: [ROLES.LINE_MANAGER], id: 'lm-1' });
    expect(canApprove(request, user)).toBe(false);
  });

  it('rejects when user lacks required role even if IDs match', () => {
    const request = buildRequest({
      staff: { teamLeadId: 'tl-1' },
      approverChain: [{ role: 'teamLead', status: 'pending' }],
    });
    const user = buildUser({ id: 'tl-1', roles: [ROLES.STAFF] });
    expect(canApprove(request, user)).toBe(false);
  });
});

