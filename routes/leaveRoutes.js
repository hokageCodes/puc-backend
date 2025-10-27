import express from 'express';
import {
  createLeaveRequest,
  getMyLeaves,
  getPendingApprovals,
  approveLeave,
  rejectLeave,
  cancelLeaveRequest,
  getTeamLeaves,
  getDepartmentLeaves,
  getAllLeaves
} from '../controllers/leaveController.js';

import {
  getMyBalance,
  initializeStaffBalance,
  adjustBalance,
  getAllBalances
} from '../controllers/leaveBalanceController.js';

import {
  getAllLeaveTypes,
  getAllLeaveTypesAdmin,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType
} from '../controllers/leaveTypeController.js';

import {
  getPersonalCalendar,
  getTeamCalendar,
  getDepartmentCalendar,
  getCompanyCalendar
} from '../controllers/calendarController.js';

import {
  generateStaffReport,
  generateTeamReport,
  generateDepartmentReport,
  generateCompanyReport
} from '../controllers/reportController.js';

import { authenticateStaff, isTeamLead, isLineManager, isHR } from '../middleware/roleAuth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateStaff);

// Leave Request Routes
router.post('/request', createLeaveRequest);
router.get('/my-leaves', getMyLeaves);
router.get('/pending-approvals', getPendingApprovals);
router.post('/:id/approve', approveLeave);
router.post('/:id/reject', rejectLeave);
router.delete('/:id/cancel', cancelLeaveRequest);
router.get('/team-leaves', isTeamLead, getTeamLeaves);
router.get('/department-leaves', isLineManager, getDepartmentLeaves);
router.get('/all', isHR, getAllLeaves);

// Leave Balance Routes
router.get('/balance/my', getMyBalance);
router.get('/balance/all', isHR, getAllBalances);
router.post('/balance/initialize', isHR, initializeStaffBalance);
router.put('/balance/:id', isHR, adjustBalance);

// Leave Type Routes
router.get('/types', getAllLeaveTypes);
router.get('/types/admin', isHR, getAllLeaveTypesAdmin);
router.post('/types', isHR, createLeaveType);
router.put('/types/:id', isHR, updateLeaveType);
router.delete('/types/:id', isHR, deleteLeaveType);

// Calendar Routes
router.get('/calendar/personal', getPersonalCalendar);
router.get('/calendar/team', isTeamLead, getTeamCalendar);
router.get('/calendar/department', isLineManager, getDepartmentCalendar);
router.get('/calendar/company', isHR, getCompanyCalendar);

// Report Routes
router.get('/reports/staff', generateStaffReport);
router.get('/reports/team', isTeamLead, generateTeamReport);
router.get('/reports/department', isLineManager, generateDepartmentReport);
router.get('/reports/company', isHR, generateCompanyReport);

export default router;

