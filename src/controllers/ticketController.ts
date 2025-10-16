import { Request, Response } from 'express';
// import { v4 as uuidv4 } from 'uuid'; // Not used
import { Database } from '../services/database';
import { EmailService } from '../services/emailService';
import { WhatsAppService } from '../services/whatsappService';
import { Ticket, TicketCreationData, TicketUpdateData, TicketFilter, TicketStats } from '../models/Ticket';

interface ExtendedRequest extends Request {
  database: Database;
  emailService: EmailService;
  whatsappService: WhatsAppService;
  io: any;
}

export class TicketController {
  
  // Create a new ticket
  static async createTicket(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const ticketData: TicketCreationData = req.body;
      
      // Validate required fields
      if (!ticketData.customer_email || !ticketData.subject) {
        return res.status(400).json({
          success: false,
          message: 'Customer email and subject are required'
        });
      }

      // Generate unique ticket number
      const ticketNumber = `TK${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      // Create ticket in database
      const result = await req.database.query(
        `INSERT INTO tickets (ticket_number, customer_email, merchant_email, subject, description, priority, transaction_id, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          ticketNumber,
          ticketData.customer_email,
          ticketData.merchant_email || null,
          ticketData.subject,
          ticketData.description || null,
          ticketData.priority || 'medium',
          ticketData.transaction_id || null,
          ticketData.tags || [],
          JSON.stringify(ticketData.metadata || {})
        ]
      );

      const ticket = result.rows[0];

      // Log status update
      await req.database.query(
        `INSERT INTO status_updates (entity_type, entity_id, old_status, new_status, update_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        ['ticket', ticket.id, null, 'open', 'Ticket created']
      );

      // Send acknowledgment email
      const whatsappLink = `${process.env.FRONTEND_URL}/track?ticket=${ticketNumber}`;
      const customerName = ticketData.customer_email.split('@')[0]; // Simple name extraction
      
      const emailTemplate = req.emailService.getTicketAcknowledgmentTemplate(
        ticketNumber,
        customerName,
        whatsappLink
      );

      await req.emailService.sendEmail({
        to: ticketData.customer_email,
        template: emailTemplate,
        ticketId: ticket.id,
        type: 'acknowledgment'
      }, req.database);

      // Send WhatsApp tracking link (if phone number available)
      // Note: In real implementation, you'd look up phone number from user profile
      const phoneNumber = ticketData.metadata?.phone;
      if (phoneNumber) {
        await req.whatsappService.sendTrackingLink(phoneNumber, ticketNumber, req.database);
      }

      // Emit real-time update
      req.io.emit('ticket_created', {
        ticket,
        timestamp: new Date()
      });

      return res.status(201).json({
        success: true,
        message: 'Ticket created successfully',
        data: ticket
      });

    } catch (error) {
      console.error('Error creating ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create ticket',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  // Get all tickets with filtering and pagination
  static async getTickets(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const filters: TicketFilter = {
        status: req.query.status as string,
        priority: req.query.priority as string,
        customer_email: req.query.customer_email as string,
        merchant_email: req.query.merchant_email as string,
        assigned_to: req.query.assigned_to as string,
        date_from: req.query.date_from as string,
        date_to: req.query.date_to as string,
        search: req.query.search as string,
        transaction_id: req.query.transaction_id as string
      };

      // Build WHERE clause
      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      if (filters.status) {
        whereConditions.push(`status = $${paramIndex++}`);
        queryParams.push(filters.status);
      }

      if (filters.priority) {
        whereConditions.push(`priority = $${paramIndex++}`);
        queryParams.push(filters.priority);
      }

      if (filters.customer_email) {
        whereConditions.push(`customer_email ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.customer_email}%`);
      }

      if (filters.merchant_email) {
        whereConditions.push(`merchant_email ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.merchant_email}%`);
      }

      if (filters.assigned_to) {
        whereConditions.push(`assigned_to ILIKE $${paramIndex++}`);
        queryParams.push(`%${filters.assigned_to}%`);
      }

      if (filters.transaction_id) {
        whereConditions.push(`transaction_id = $${paramIndex++}`);
        queryParams.push(filters.transaction_id);
      }

      if (filters.date_from) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        queryParams.push(filters.date_from);
      }

      if (filters.date_to) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        queryParams.push(filters.date_to);
      }

      if (filters.search) {
        whereConditions.push(`(subject ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++} OR ticket_number ILIKE $${paramIndex++})`);
        queryParams.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        paramIndex += 2; // We used 3 parameters for the search
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get tickets
      const ticketsQuery = `
        SELECT * FROM tickets 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      queryParams.push(limit, offset);
      const ticketsResult = await req.database.query(ticketsQuery, queryParams);

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM tickets ${whereClause}`;
      const countResult = await req.database.query(countQuery, queryParams.slice(0, -2)); // Remove limit and offset

      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / limit);

      return res.json({
        success: true,
        data: {
          tickets: ticketsResult.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Error fetching tickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch tickets'
      });
    }
  }

  // Get single ticket by ID or ticket number
  static async getTicket(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      // Check if it's a ticket number or ID
      const isTicketNumber = id.startsWith('TK');
      const query = isTicketNumber 
        ? 'SELECT * FROM tickets WHERE ticket_number = $1'
        : 'SELECT * FROM tickets WHERE id = $1';

      const result = await req.database.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      const ticket = result.rows[0];

      // Get status history
      const statusHistory = await req.database.query(
        `SELECT * FROM status_updates 
         WHERE entity_type = 'ticket' AND entity_id = $1 
         ORDER BY created_at DESC`,
        [ticket.id]
      );

      // Get associated transaction if exists
      let transaction = null;
      if (ticket.transaction_id) {
        const transactionResult = await req.database.query(
          'SELECT * FROM transactions WHERE transaction_id = $1',
          [ticket.transaction_id]
        );
        transaction = transactionResult.rows[0] || null;
      }

      return res.json({
        success: true,
        data: {
          ticket,
          statusHistory: statusHistory.rows,
          transaction
        }
      });

    } catch (error) {
      console.error('Error fetching ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch ticket'
      });
    }
  }

  // Update ticket
  static async updateTicket(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const updateData: TicketUpdateData = req.body;

      // Get current ticket
      const currentResult = await req.database.query(
        'SELECT * FROM tickets WHERE id = $1',
        [id]
      );

      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      const currentTicket = currentResult.rows[0];

      // Build update query
      const updateFields = [];
      const queryParams = [];
      let paramIndex = 1;

      if (updateData.status) {
        updateFields.push(`status = $${paramIndex++}`);
        queryParams.push(updateData.status);
      }

      if (updateData.priority) {
        updateFields.push(`priority = $${paramIndex++}`);
        queryParams.push(updateData.priority);
      }

      if (updateData.assigned_to !== undefined) {
        updateFields.push(`assigned_to = $${paramIndex++}`);
        queryParams.push(updateData.assigned_to);
      }

      if (updateData.tags) {
        updateFields.push(`tags = $${paramIndex++}`);
        queryParams.push(updateData.tags);
      }

      if (updateData.metadata) {
        updateFields.push(`metadata = $${paramIndex++}`);
        queryParams.push(JSON.stringify(updateData.metadata));
      }

      // Always update the updated_at timestamp
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      // Handle resolution
      if (updateData.status === 'resolved' && currentTicket.status !== 'resolved') {
        updateFields.push(`resolved_at = CURRENT_TIMESTAMP`);
      }

      queryParams.push(id);
      const updateQuery = `
        UPDATE tickets 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await req.database.query(updateQuery, queryParams);
      const updatedTicket = result.rows[0];

      // Log status update if status changed
      if (updateData.status && updateData.status !== currentTicket.status) {
        await req.database.query(
          `INSERT INTO status_updates (entity_type, entity_id, old_status, new_status, update_reason, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'ticket',
            updatedTicket.id,
            currentTicket.status,
            updateData.status,
            updateData.resolution || 'Status updated',
            req.body.updated_by || 'system'
          ]
        );

        // Send status update notifications
        await TicketController.sendStatusNotifications(
          updatedTicket, 
          updateData.status, 
          req.emailService, 
          req.whatsappService, 
          req.database,
          updateData.resolution
        );
      }

      // Emit real-time update
      req.io.emit('ticket_updated', {
        ticket: updatedTicket,
        oldStatus: currentTicket.status,
        newStatus: updateData.status,
        timestamp: new Date()
      });

      return res.json({
        success: true,
        message: 'Ticket updated successfully',
        data: updatedTicket
      });

    } catch (error) {
      console.error('Error updating ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ticket'
      });
    }
  }

  // Delete ticket (soft delete by setting status to closed)
  static async deleteTicket(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      const result = await req.database.query(
        `UPDATE tickets 
         SET status = 'closed', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      return res.json({
        success: true,
        message: 'Ticket closed successfully'
      });

    } catch (error) {
      console.error('Error deleting ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to close ticket'
      });
    }
  }

  // Get ticket statistics
  static async getTicketStats(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      // Get overall stats
      const statsResult = await req.database.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
          COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed,
          COUNT(CASE WHEN priority = 'low' THEN 1 END) as priority_low,
          COUNT(CASE WHEN priority = 'medium' THEN 1 END) as priority_medium,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as priority_high,
          COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as priority_urgent,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_resolution_hours
        FROM tickets
      `);

      const stats = statsResult.rows[0];
      const total = parseInt(stats.total);
      const resolved = parseInt(stats.resolved);
      const closed = parseInt(stats.closed);

      const ticketStats: TicketStats = {
        total,
        open: parseInt(stats.open),
        in_progress: parseInt(stats.in_progress),
        resolved,
        closed,
        by_priority: {
          low: parseInt(stats.priority_low),
          medium: parseInt(stats.priority_medium),
          high: parseInt(stats.priority_high),
          urgent: parseInt(stats.priority_urgent)
        },
        avg_resolution_time: parseFloat(stats.avg_resolution_hours) || 0,
        resolution_rate: total > 0 ? ((resolved + closed) / total) * 100 : 0
      };

      return res.json({
        success: true,
        data: ticketStats
      });

    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch ticket statistics'
      });
    }
  }

  // Send status notifications via email and WhatsApp
  private static async sendStatusNotifications(
    ticket: Ticket, 
    newStatus: string, 
    emailService: EmailService, 
    whatsappService: WhatsAppService, 
    database: Database,
    resolution?: string
  ) {
    try {
      // Send email notification to customer
      if (newStatus === 'resolved' && resolution) {
        // Send closure email
        const customerName = ticket.customer_email.split('@')[0];
        const closureTemplate = emailService.getTicketClosureTemplate(
          ticket.ticket_number, 
          customerName, 
          resolution
        );

        await emailService.sendEmail({
          to: ticket.customer_email,
          template: closureTemplate,
          ticketId: ticket.id,
          type: 'closure'
        }, database);
      }

      // Send WhatsApp notification (if phone number available)
      // In real implementation, you'd look up phone number from user profile
      const phoneNumber = ticket.metadata?.phone;
      if (phoneNumber) {
        await whatsappService.sendStatusUpdate(
          phoneNumber, 
          ticket.id!, 
          newStatus, 
          resolution,
          database
        );
      }

    } catch (error) {
      console.error('Error sending status notifications:', error);
    }
  }

  // Process email to create ticket (for CRM integration)
  static async processIncomingEmail(emailData: any, database: Database, emailService: EmailService, _whatsappService: WhatsAppService, io: any) {
    try {
      const ticketData: TicketCreationData = {
        customer_email: emailData.from,
        subject: emailData.subject,
        description: emailData.body,
        priority: 'medium',
        metadata: {
          original_email_id: emailData.id,
          email_thread_id: emailData.threadId,
          received_at: emailData.receivedAt
        }
      };

      // Create ticket
      const ticketNumber = `TK${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      const result = await database.query(
        `INSERT INTO tickets (ticket_number, customer_email, subject, description, priority, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          ticketNumber,
          ticketData.customer_email,
          ticketData.subject,
          ticketData.description,
          ticketData.priority,
          JSON.stringify(ticketData.metadata)
        ]
      );

      const ticket = result.rows[0];

      // Send acknowledgment
      const whatsappLink = `${process.env.FRONTEND_URL}/track?ticket=${ticketNumber}`;
      const customerName = ticketData.customer_email.split('@')[0];
      
      const emailTemplate = emailService.getTicketAcknowledgmentTemplate(
        ticketNumber,
        customerName,
        whatsappLink
      );

      await emailService.sendEmail({
        to: ticketData.customer_email,
        template: emailTemplate,
        ticketId: ticket.id,
        type: 'acknowledgment'
      }, database);

      // Emit real-time update
      io.emit('ticket_created', {
        ticket,
        source: 'email',
        timestamp: new Date()
      });

      console.log(`✅ Ticket ${ticketNumber} created from incoming email`);
      return ticket;

    } catch (error) {
      console.error('❌ Error processing incoming email:', error);
      throw error;
    }
  }
}