import axios from 'axios';
import { Database } from './database';

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template';
  content: string;
  ticketId?: number;
  transactionId?: string;
  messageType: string;
  metadata?: any;
}

export class WhatsAppService {
  private baseUrl: string;
  private accessToken: string;
  private phoneNumberId: string;
  private configured: boolean = false;

  constructor() {
    this.accessToken = process.env.WHATSAPP_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.baseUrl = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
    
    this.configured = !!(this.accessToken && this.phoneNumberId);
    
    if (this.configured) {
      console.log('✅ WhatsApp service configured successfully');
    } else {
      console.log('⚠️ WhatsApp service not configured - missing credentials');
    }
  }

  async sendMessage(message: WhatsAppMessage, database?: Database): Promise<boolean> {
    if (!this.configured) {
      console.log('📱 WhatsApp service not configured - simulating message send');
      await this.logMessage(message, 'sent', database);
      return true;
    }

    try {
      const payload = {
        messaging_product: 'whatsapp',
        to: message.to,
        type: message.type,
        [message.type]: message.type === 'text' ? {
          body: message.content
        } : {
          name: message.content,
          language: { code: 'en' }
        }
      };

      const response = await axios.post(this.baseUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📱 WhatsApp message sent successfully to ${message.to}`);
      await this.logMessage(message, 'sent', database, response.data.messages?.[0]?.id);
      return true;
    } catch (error: any) {
      console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
      await this.logMessage(message, 'failed', database, undefined, error.response?.data?.error?.message || error.message);
      return false;
    }
  }

  async sendStatusUpdate(phoneNumber: string, ticketId: number, status: string, additionalInfo?: string, database?: Database): Promise<boolean> {
    const message: WhatsAppMessage = {
      to: phoneNumber,
      type: 'text',
      content: this.getStatusUpdateMessage(ticketId, status, additionalInfo),
      ticketId,
      messageType: 'status_update'
    };

    return await this.sendMessage(message, database);
  }

  async sendTransactionUpdate(phoneNumber: string, transactionId: string, status: string, amount?: number, currency?: string, database?: Database): Promise<boolean> {
    const message: WhatsAppMessage = {
      to: phoneNumber,
      type: 'text',
      content: this.getTransactionUpdateMessage(transactionId, status, amount, currency),
      transactionId,
      messageType: 'transaction_update'
    };

    return await this.sendMessage(message, database);
  }

  async sendTrackingLink(phoneNumber: string, ticketNumber: string, database?: Database): Promise<boolean> {
    const trackingUrl = `${process.env.FRONTEND_URL}/track?ticket=${ticketNumber}`;
    
    const message: WhatsAppMessage = {
      to: phoneNumber,
      type: 'text',
      content: `🎫 Track your complaint #${ticketNumber} status:\n\n${trackingUrl}\n\nYou can check your complaint status anytime using this link. We'll also send you updates here on WhatsApp as we progress.`,
      messageType: 'tracking_link',
      metadata: { ticketNumber, trackingUrl }
    };

    return await this.sendMessage(message, database);
  }

  private getStatusUpdateMessage(ticketId: number, status: string, additionalInfo?: string): string {
    const statusEmojis = {
      open: '🆕',
      in_progress: '🔄',
      resolved: '✅',
      closed: '📋'
    };

    const statusMessages = {
      open: 'Your complaint has been received and is open for review.',
      in_progress: 'We are actively working on your complaint.',
      resolved: 'Great news! Your complaint has been resolved.',
      closed: 'Your complaint has been closed.'
    };

    const emoji = statusEmojis[status as keyof typeof statusEmojis] || '📝';
    const statusMessage = statusMessages[status as keyof typeof statusMessages] || `Status updated to: ${status}`;

    let message = `${emoji} *Complaint Update #${ticketId}*\n\n${statusMessage}`;
    
    if (additionalInfo) {
      message += `\n\n*Details:* ${additionalInfo}`;
    }
    
    message += `\n\n*Updated:* ${new Date().toLocaleString()}\n\nNeed help? Reply to this message.`;
    
    return message;
  }

  private getTransactionUpdateMessage(transactionId: string, status: string, amount?: number, currency: string = 'USD'): string {
    const statusEmojis = {
      initiated: '🚀',
      pending: '⏳',
      processing: '🔄',
      success: '✅',
      failed: '❌',
      refunded: '💰',
      cancelled: '❌'
    };

    const statusMessages = {
      initiated: 'Your transaction has been initiated.',
      pending: 'Your transaction is pending verification.',
      processing: 'Your transaction is being processed.',
      success: 'Transaction completed successfully!',
      failed: 'Transaction could not be processed.',
      refunded: 'Your transaction has been refunded.',
      cancelled: 'Transaction has been cancelled.'
    };

    const emoji = statusEmojis[status as keyof typeof statusEmojis] || '💳';
    const statusMessage = statusMessages[status as keyof typeof statusMessages] || `Transaction status: ${status}`;

    let message = `${emoji} *Transaction Update*\n\n*ID:* ${transactionId}\n*Status:* ${status.toUpperCase()}\n`;
    
    if (amount !== undefined) {
      message += `*Amount:* ${currency} ${amount.toFixed(2)}\n`;
    }
    
    message += `*Updated:* ${new Date().toLocaleString()}\n\n${statusMessage}`;

    if (status === 'failed') {
      message += '\n\n💡 *Next Steps:* Contact support if you need assistance or want to retry.';
    } else if (status === 'success') {
      message += '\n\n🎉 Thank you for your business!';
    }

    return message;
  }

  private async logMessage(message: WhatsAppMessage, status: string, database?: Database, whatsappMessageId?: string, errorMessage?: string) {
    if (!database) return;

    try {
      await database.query(
        `INSERT INTO whatsapp_logs (ticket_id, transaction_id, phone_number, message_type, message_content, status, whatsapp_message_id, sent_at, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          message.ticketId || null,
          message.transactionId || null,
          message.to,
          message.messageType,
          message.content,
          status,
          whatsappMessageId || null,
          status === 'sent' ? new Date() : null,
          errorMessage || null,
          JSON.stringify(message.metadata || {})
        ]
      );
    } catch (error) {
      console.error('❌ Error logging WhatsApp message:', error);
    }
  }

  // Handle incoming webhook from WhatsApp
  async handleWebhook(webhookData: any, database?: Database): Promise<void> {
    try {
      if (webhookData.entry && webhookData.entry[0] && webhookData.entry[0].changes) {
        for (const change of webhookData.entry[0].changes) {
          if (change.field === 'messages' && change.value.messages) {
            for (const message of change.value.messages) {
              await this.processIncomingMessage(message, database);
            }
          }
          
          if (change.field === 'messages' && change.value.statuses) {
            for (const status of change.value.statuses) {
              await this.processMessageStatus(status, database);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing WhatsApp webhook:', error);
    }
  }

  private async processIncomingMessage(message: any, database?: Database): Promise<void> {
    if (!database) return;

    try {
      // Extract message details
      const phoneNumber = message.from;
      const messageText = message.text?.body || '';
      const messageId = message.id;

      // Check if this is a response to a ticket tracking request
      if (messageText.toLowerCase().includes('track') || messageText.toLowerCase().includes('status')) {
        // Send tracking information
        await this.sendTrackingHelp(phoneNumber, database);
      }

      // Log the incoming message
      await database.query(
        `INSERT INTO whatsapp_logs (phone_number, message_type, message_content, status, whatsapp_message_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [phoneNumber, 'incoming', messageText, 'received', messageId, new Date()]
      );

      console.log(`📱 Received WhatsApp message from ${phoneNumber}: ${messageText}`);
    } catch (error) {
      console.error('❌ Error processing incoming WhatsApp message:', error);
    }
  }

  private async processMessageStatus(status: any, database?: Database): Promise<void> {
    if (!database) return;

    try {
      await database.query(
        `UPDATE whatsapp_logs 
         SET status = $1, sent_at = $2 
         WHERE whatsapp_message_id = $3`,
        [status.status, new Date(), status.id]
      );

      console.log(`📱 WhatsApp message ${status.id} status updated to: ${status.status}`);
    } catch (error) {
      console.error('❌ Error updating WhatsApp message status:', error);
    }
  }

  private async sendTrackingHelp(phoneNumber: string, database?: Database): Promise<void> {
    const helpMessage = `🔍 *Complaint Tracking Help*

To track your complaint status, please send us your ticket number in this format:
*#TICKET123*

Or visit our tracking page:
${process.env.FRONTEND_URL}/track

We'll provide you with the latest status and updates!`;

    const message: WhatsAppMessage = {
      to: phoneNumber,
      type: 'text',
      content: helpMessage,
      messageType: 'help'
    };

    await this.sendMessage(message, database);
  }

  isConfigured(): boolean {
    return this.configured;
  }

  // Verify webhook token
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ WhatsApp webhook verified successfully');
      return challenge;
    } else {
      console.log('❌ WhatsApp webhook verification failed');
      return null;
    }
  }

  // Helper method to extract phone number from email (if stored in user profile)
  extractPhoneFromUserData(userData: any): string | null {
    // This would typically look up phone number from user profile in database
    // For now, return a placeholder or extract from metadata
    return userData.phone || userData.whatsapp || null;
  }
}