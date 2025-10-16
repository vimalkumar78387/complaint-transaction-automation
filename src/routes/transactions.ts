import express from 'express';
import { TransactionController } from '../controllers/transactionController';

const router = express.Router();

// GET /api/transactions - Get all transactions with filtering
router.get('/', (req, res) => TransactionController.getTransactions(req as any, res));

// GET /api/transactions/stats - Get transaction statistics
router.get('/stats', (req, res) => TransactionController.getTransactionStats(req as any, res));

// GET /api/transactions/:id - Get single transaction by ID
router.get('/:id', (req, res) => TransactionController.getTransaction(req as any, res));

// POST /api/transactions - Create new transaction (for testing)
router.post('/', (req, res) => TransactionController.createTransaction(req as any, res));

// PUT /api/transactions/:id/status - Update transaction status manually
router.put('/:id/status', (req, res) => TransactionController.updateTransactionStatus(req as any, res));

// POST /api/transactions/batch-update - Batch update transaction statuses
router.post('/batch-update', (req, res) => TransactionController.batchUpdateTransactions(req as any, res));

// POST /api/transactions/:id/refresh - Refresh single transaction status from external API
router.post('/:id/refresh', (req, res) => TransactionController.refreshTransactionStatus(req as any, res));

export default router;