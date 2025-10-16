import nodemailer from 'nodemailer';
import { Database } from './database';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailData {
  to: string;
  template: EmailTemplate;
  ticketId?: number;
  transactionId?: string;
  type: string;
  metadata?: any;
}

export class EmailService {
  private transporter!: nodemailer.Transporter;
  private configured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      this.configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
      
      if (this.configured) {
        console.log('✅ Email service configured successfully');
      } else {
        console.log('⚠️ Email service not configured - missing SMTP credentials');
      }
    } catch (error) {
      console.error('❌ Error configuring email service:', error);
    }
  }

  async sendEmail(emailData: EmailData, database?: Database): Promise<boolean> {
    if (!this.configured) {
      console.log('📧 Email service not configured - simulating email send');
      await this.logEmail(emailData, 'sent', database);
      return true;
    }

    try {
      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to: emailData.to,
        subject: emailData.template.subject,
        html: emailData.template.html,
        text: emailData.template.text || this.stripHtml(emailData.template.html),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email sent successfully to ${emailData.to}`);
      
      await this.logEmail(emailData, 'sent', database);
      return true;
    } catch (error) {
      console.error('❌ Error sending email:', error);
      await this.logEmail(emailData, 'failed', database, (error as Error).message);
      return false;
    }
  }

  private async logEmail(emailData: EmailData, status: string, database?: Database, errorMessage?: string) {
    if (!database) return;

    try {
      await database.query(
        `INSERT INTO email_logs (ticket_id, transaction_id, recipient_email, email_type, subject, body, status, sent_at, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          emailData.ticketId || null,
          emailData.transactionId || null,
          emailData.to,
          emailData.type,
          emailData.template.subject,
          emailData.template.html,
          status,
          status === 'sent' ? new Date() : null,
          errorMessage || null,
          JSON.stringify(emailData.metadata || {})
        ]
      );
    } catch (error) {
      console.error('❌ Error logging email:', error);
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  // Email Templates
  getTicketAcknowledgmentTemplate(ticketNumber: string, customerName: string, whatsappLink: string): EmailTemplate {
    return {
      subject: `Ticket #${ticketNumber} - We've received your complaint`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">Complaint Acknowledgment</h2>
            
            <p>Dear ${customerName},</p>
            
            <p>Thank you for contacting our support team. We have received your complaint and created a ticket for you:</p>
            
            <div style="background-color: #fff; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
              <strong>Ticket Number: #${ticketNumber}</strong>
            </div>
            
            <p>Our team is now reviewing your case and will provide updates as we progress. You can track your complaint status anytime using WhatsApp:</p>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${whatsappLink}" style="background-color: #25d366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                📱 Track via WhatsApp
              </a>
            </div>
            
            <p>We appreciate your patience and will work diligently to resolve your issue.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated message. Please do not reply to this email. For updates, use the WhatsApp link above.
            </p>
          </div>
        </div>
      `
    };
  }

  getTransactionStatusUpdateTemplate(transactionId: string, status: string, amount: number, currency: string = 'USD'): EmailTemplate {
    const statusColors = {
      initiated: '#3498db',
      pending: '#f39c12',
      processing: '#e67e22',
      success: '#27ae60',
      failed: '#e74c3c',
      refunded: '#9b59b6',
      cancelled: '#95a5a6'
    };

    const statusMessages = {
      initiated: 'Your transaction has been initiated and is being processed.',
      pending: 'Your transaction is pending verification.',
      processing: 'Your transaction is currently being processed.',
      success: 'Your transaction has been completed successfully!',
      failed: 'Unfortunately, your transaction could not be processed.',
      refunded: 'Your transaction has been refunded.',
      cancelled: 'Your transaction has been cancelled.'
    };

    return {
      subject: `Transaction ${transactionId} - Status: ${status.toUpperCase()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">Transaction Status Update</h2>
            
            <div style="background-color: #fff; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Transaction Details</h3>
              <p><strong>Transaction ID:</strong> ${transactionId}</p>
              <p><strong>Amount:</strong> ${currency} ${amount.toFixed(2)}</p>
              <p><strong>Status:</strong> <span style="color: ${statusColors[status as keyof typeof statusColors] || '#666'}; text-transform: uppercase; font-weight: bold;">${status}</span></p>
              <p><strong>Updated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="background-color: ${statusColors[status as keyof typeof statusColors] || '#666'}; color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;">${statusMessages[status as keyof typeof statusMessages] || 'Transaction status has been updated.'}</p>
            </div>
            
            ${status === 'failed' ? `
              <div style="background-color: #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; color: #2d3436;"><strong>Next Steps:</strong> Please contact our support team if you need assistance or want to retry the transaction.</p>
              </div>
            ` : ''}
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated transaction update. If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `
    };
  }

  getMerchantNotificationTemplate(merchantName: string, updates: any[]): EmailTemplate {
    const updatesHtml = updates.map(update => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${update.type}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${update.id}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <span style="color: ${this.getStatusColor(update.status)}; font-weight: bold;">
            ${update.status.toUpperCase()}
          </span>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(update.updatedAt).toLocaleString()}</td>
      </tr>
    `).join('');

    return {
      subject: `Merchant Update - ${updates.length} new status changes`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #2c3e50; margin-bottom: 20px;">Merchant Status Updates</h2>
            
            <p>Dear ${merchantName},</p>
            
            <p>Here are the latest updates for your transactions and tickets:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #fff;">
              <thead>
                <tr style="background-color: #34495e; color: white;">
                  <th style="padding: 12px; text-align: left;">Type</th>
                  <th style="padding: 12px; text-align: left;">ID</th>
                  <th style="padding: 12px; text-align: left;">Status</th>
                  <th style="padding: 12px; text-align: left;">Updated</th>
                </tr>
              </thead>
              <tbody>
                ${updatesHtml}
              </tbody>
            </table>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${process.env.FRONTEND_URL}/merchant-dashboard" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                View Full Dashboard
              </a>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #666; font-size: 12px;">
              This is an automated merchant notification. You can manage your notification preferences in your dashboard.
            </p>
          </div>
        </div>
      `
    };
  }

  getTicketClosureTemplate(ticketNumber: string, customerName: string, resolution: string): EmailTemplate {
    return {
      subject: `Ticket #${ticketNumber} - Resolved and Closed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #27ae60; margin-bottom: 20px;">✅ Ticket Resolved & Closed</h2>
            
            <p>Dear ${customerName},</p>
            
            <p>We're pleased to inform you that your complaint has been resolved:</p>
            
            <div style="background-color: #fff; padding: 15px; border-left: 4px solid #27ae60; margin: 20px 0;">
              <strong>Ticket Number: #${ticketNumber}</strong><br>
              <strong>Status:</strong> <span style="color: #27ae60;">RESOLVED</span>
            </div>
            
            <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #155724;">Resolution Details:</h4>
              <p style="margin-bottom: 0; color: #155724;">${resolution}</p>
            </div>
            
            <p>If you're satisfied with the resolution, no further action is required. If you have any additional concerns, please don't hesitate to contact us.</p>
            
            <p>Thank you for your patience and for giving us the opportunity to assist you.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #666; font-size: 12px;">
              This ticket has been automatically closed. If you need to reopen it, please reply to this email or create a new support request.
            </p>
          </div>
        </div>
      `
    };
  }

  private getStatusColor(status: string): string {
    const colors = {
      open: '#3498db',
      in_progress: '#f39c12',
      resolved: '#27ae60',
      closed: '#95a5a6',
      initiated: '#3498db',
      pending: '#f39c12',
      processing: '#e67e22',
      success: '#27ae60',
      failed: '#e74c3c',
      refunded: '#9b59b6',
      cancelled: '#95a5a6'
    };
    return colors[status as keyof typeof colors] || '#666';
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async testConnection(): Promise<boolean> {
    if (!this.configured) return false;
    
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection test failed:', error);
      return false;
    }
  }
}