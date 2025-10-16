import express from 'express';
import { DashboardController } from '../controllers/dashboardController';

const router = express.Router();

// GET /api/dashboard/overview - Get dashboard overview with key metrics
router.get('/overview', (req, res) => DashboardController.getOverview(req as any, res));

// GET /api/dashboard/stats - Get detailed statistics
router.get('/stats', (req, res) => DashboardController.getDetailedStats(req as any, res));

// GET /api/dashboard/recent-activity - Get recent activity feed
router.get('/recent-activity', (req, res) => DashboardController.getRecentActivity(req as any, res));

// GET /api/dashboard/performance - Get performance metrics
router.get('/performance', (req, res) => DashboardController.getPerformanceMetrics(req as any, res));

// GET /api/dashboard/alerts - Get system alerts and notifications
router.get('/alerts', (req, res) => DashboardController.getAlerts(req as any, res));

// POST /api/dashboard/cron/:jobName - Manually trigger cron job
router.post('/cron/:jobName', (req, res) => DashboardController.triggerCronJob(req as any, res));

// GET /api/dashboard/cron/status - Get cron job status
router.get('/cron/status', (req, res) => DashboardController.getCronJobStatus(req as any, res));

export default router;