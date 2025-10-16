import express from 'express';
import { TicketController } from '../controllers/ticketController';

const router = express.Router();

// GET /api/tickets - Get all tickets with filtering and pagination
router.get('/', (req, res) => TicketController.getTickets(req as any, res));

// GET /api/tickets/stats - Get ticket statistics
router.get('/stats', (req, res) => TicketController.getTicketStats(req as any, res));

// GET /api/tickets/:id - Get single ticket by ID or ticket number
router.get('/:id', (req, res) => TicketController.getTicket(req as any, res));

// POST /api/tickets - Create new ticket
router.post('/', (req, res) => TicketController.createTicket(req as any, res));

// PUT /api/tickets/:id - Update ticket
router.put('/:id', (req, res) => TicketController.updateTicket(req as any, res));

// DELETE /api/tickets/:id - Close ticket (soft delete)
router.delete('/:id', (req, res) => TicketController.deleteTicket(req as any, res));

export default router;