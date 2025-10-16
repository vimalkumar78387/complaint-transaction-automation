import axios from 'axios';
import { Database } from './database';

export interface Transaction {
  id?: number;
  transaction_id: string;
  payer_email: string;
  merchant_email: string;
  amount: number;
  currency: string;
  status: 'initiated' | 'pending' | 'processing' | 'success' | 'failed' | 'refunded' | 'cancelled';
  payment_method?: string;
  gateway_response?: any;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
  metadata?: any;
}

export interface TransactionStatusResponse {
  transaction_id: string;
  status: string;
  amount: number;
  currency: string;
  payment_method: string;
  gateway_response: any;
  last_updated: string;
  metadata?: any;
}

export class TransactionService {
  private apiUrl: string;
  private apiKey: string;
  private configured: boolean = false;

  constructor() {
    this.apiUrl = process.env.TRANSACTION_API_URL || '';
    this.apiKey = process.env.TRANSACTION_API_KEY || '';
    this.configured = !!(this.apiUrl && this.apiKey);
    
    if (this.configured) {
      console.log('✅ Transaction service configured successfully');
    } else {
      console.log('⚠️ Transaction service not configured - using mock data');
    }
  }

  async fetchTransactionStatus(transactionId: string): Promise<TransactionStatusResponse | null> {
    if (!this.configured) {
      // Return mock data for testing
      return this.getMockTransactionStatus(transactionId);
    }

    try {
      const response = await axios.get(`${this.apiUrl}/transactions/${transactionId}/status`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error: any) {
      console.error(`❌ Error fetching transaction status for ${transactionId}:`, error.response?.data || error.message);
      return null;
    }
  }

  async updateTransactionStatus(transactionId: string, database: Database): Promise<Transaction | null> {
    try {
      // Fetch current status from external API
      const statusResponse = await this.fetchTransactionStatus(transactionId);
      if (!statusResponse) {
        return null;
      }

      // Get current transaction from database
      const currentResult = await database.query(
        'SELECT * FROM transactions WHERE transaction_id = $1',
        [transactionId]
      );

      let transaction: Transaction;

      if (currentResult.rows.length === 0) {
        // Create new transaction record
        const insertResult = await database.query(
          `INSERT INTO transactions (transaction_id, payer_email, merchant_email, amount, currency, status, payment_method, gateway_response, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (transaction_id) DO UPDATE SET
           status = EXCLUDED.status,
           gateway_response = EXCLUDED.gateway_response,
           updated_at = CURRENT_TIMESTAMP,
           completed_at = CASE 
             WHEN EXCLUDED.status IN ('success', 'failed', 'refunded', 'cancelled') 
             THEN CURRENT_TIMESTAMP 
             ELSE completed_at 
           END
           RETURNING *`,
          [
            statusResponse.transaction_id,
            statusResponse.metadata?.payer_email || 'unknown@example.com',
            statusResponse.metadata?.merchant_email || 'merchant@example.com',
            statusResponse.amount,
            statusResponse.currency,
            statusResponse.status,
            statusResponse.payment_method,
            JSON.stringify(statusResponse.gateway_response),
            JSON.stringify(statusResponse.metadata || {})
          ]
        );
        transaction = insertResult.rows[0];
      } else {
        const currentTransaction = currentResult.rows[0];
        
        // Update existing transaction if status changed
        if (currentTransaction.status !== statusResponse.status) {
          const updateResult = await database.query(
            `UPDATE transactions 
             SET status = $1, gateway_response = $2, updated_at = CURRENT_TIMESTAMP,
                 completed_at = CASE 
                   WHEN $1 IN ('success', 'failed', 'refunded', 'cancelled') 
                   THEN CURRENT_TIMESTAMP 
                   ELSE completed_at 
                 END
             WHERE transaction_id = $3
             RETURNING *`,
            [statusResponse.status, JSON.stringify(statusResponse.gateway_response), transactionId]
          );
          transaction = updateResult.rows[0];

          // Log status update
          await database.query(
            `INSERT INTO status_updates (entity_type, entity_id, old_status, new_status, update_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            ['transaction', transaction.id, currentTransaction.status, statusResponse.status, 'External API update']
          );
        } else {
          transaction = currentTransaction;
        }
      }

      return transaction;
    } catch (error) {
      console.error(`❌ Error updating transaction status for ${transactionId}:`, error);
      return null;
    }
  }

  async getTransactionsByStatus(status: string, database: Database): Promise<Transaction[]> {
    try {
      const result = await database.query(
        'SELECT * FROM transactions WHERE status = $1 ORDER BY updated_at DESC',
        [status]
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching transactions by status:', error);
      return [];
    }
  }

  async getTransactionsByEmail(email: string, database: Database): Promise<Transaction[]> {
    try {
      const result = await database.query(
        'SELECT * FROM transactions WHERE payer_email = $1 OR merchant_email = $1 ORDER BY updated_at DESC',
        [email]
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching transactions by email:', error);
      return [];
    }
  }

  async getTransactionStats(database: Database): Promise<any> {
    try {
      const result = await database.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'initiated' THEN 1 END) as initiated,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as success,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_success_amount,
          AVG(CASE WHEN status = 'success' THEN amount ELSE NULL END) as avg_success_amount,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_completion_hours
        FROM transactions
      `);

      const stats = result.rows[0];
      return {
        total: parseInt(stats.total),
        by_status: {
          initiated: parseInt(stats.initiated),
          pending: parseInt(stats.pending),
          processing: parseInt(stats.processing),
          success: parseInt(stats.success),
          failed: parseInt(stats.failed),
          refunded: parseInt(stats.refunded),
          cancelled: parseInt(stats.cancelled)
        },
        financial: {
          total_success_amount: parseFloat(stats.total_success_amount) || 0,
          avg_success_amount: parseFloat(stats.avg_success_amount) || 0
        },
        performance: {
          success_rate: parseInt(stats.total) > 0 ? (parseInt(stats.success) / parseInt(stats.total)) * 100 : 0,
          avg_completion_hours: parseFloat(stats.avg_completion_hours) || 0
        }
      };
    } catch (error) {
      console.error('❌ Error fetching transaction stats:', error);
      return null;
    }
  }

  // Mock transaction status for testing when external API is not available
  private getMockTransactionStatus(transactionId: string): TransactionStatusResponse {
    const statuses = ['initiated', 'pending', 'processing', 'success', 'failed'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return {
      transaction_id: transactionId,
      status: randomStatus,
      amount: Math.floor(Math.random() * 1000) + 10,
      currency: 'USD',
      payment_method: 'credit_card',
      gateway_response: {
        gateway_id: `gw_${Math.random().toString(36).substr(2, 9)}`,
        response_code: randomStatus === 'success' ? '00' : '99',
        response_message: randomStatus === 'success' ? 'Transaction successful' : 'Transaction failed'
      },
      last_updated: new Date().toISOString(),
      metadata: {
        payer_email: 'customer@example.com',
        merchant_email: 'merchant@example.com'
      }
    };
  }

  // Batch update multiple transactions
  async batchUpdateTransactions(transactionIds: string[], database: Database): Promise<Transaction[]> {
    const updatedTransactions: Transaction[] = [];
    
    for (const transactionId of transactionIds) {
      try {
        const transaction = await this.updateTransactionStatus(transactionId, database);
        if (transaction) {
          updatedTransactions.push(transaction);
        }
      } catch (error) {
        console.error(`❌ Error updating transaction ${transactionId}:`, error);
      }
    }
    
    return updatedTransactions;
  }

  // Get pending transactions that need status updates
  async getPendingTransactions(database: Database): Promise<string[]> {
    try {
      const result = await database.query(
        `SELECT transaction_id FROM transactions 
         WHERE status IN ('initiated', 'pending', 'processing') 
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
         ORDER BY updated_at ASC
         LIMIT 50`
      );
      
      return result.rows.map((row: any) => row.transaction_id);
    } catch (error) {
      console.error('❌ Error fetching pending transactions:', error);
      return [];
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  // Create a new transaction (for testing or when initiated from our system)
  async createTransaction(transactionData: Partial<Transaction>, database: Database): Promise<Transaction | null> {
    try {
      const result = await database.query(
        `INSERT INTO transactions (transaction_id, payer_email, merchant_email, amount, currency, status, payment_method, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          transactionData.transaction_id,
          transactionData.payer_email,
          transactionData.merchant_email,
          transactionData.amount,
          transactionData.currency || 'USD',
          transactionData.status || 'initiated',
          transactionData.payment_method,
          JSON.stringify(transactionData.metadata || {})
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      return null;
    }
  }
}