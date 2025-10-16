import express from 'express';
import { WebhookController } from '../controllers/webhookController';

const router = express.Router();

// POST /api/webhooks/whatsapp - WhatsApp webhook
router.get('/whatsapp', (req, res) => WebhookController.verifyWhatsAppWebhook(req as any, res));
router.post('/whatsapp', (req, res) => WebhookController.handleWhatsAppWebhook(req as any, res));

// POST /api/webhooks/email - Email webhook (for CRM integration)
router.post('/email', (req, res) => WebhookController.handleEmailWebhook(req as any, res));

// POST /api/webhooks/transaction - Transaction status webhook
router.post('/transaction', (req, res) => WebhookController.handleTransactionWebhook(req as any, res));

// POST /api/webhooks/crm - General CRM webhook
router.post('/crm', (req, res) => WebhookController.handleCRMWebhook(req as any, res));

// GET /api/webhooks/logs - Get webhook logs
router.get('/logs', (req, res) => WebhookController.getWebhookLogs(req as any, res));

export default router;