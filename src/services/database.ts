import { Pool } from 'pg';

export class Database {
  private pool: Pool;
  private connected: boolean = false;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'complaint_automation',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'AWyZQisj',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      client.release();
      this.connected = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async initializeTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create tickets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          ticket_number VARCHAR(50) UNIQUE NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          merchant_email VARCHAR(255),
          subject TEXT NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
          priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          transaction_id VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP WITH TIME ZONE,
          assigned_to VARCHAR(255),
          tags TEXT[],
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create transactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          transaction_id VARCHAR(100) UNIQUE NOT NULL,
          payer_email VARCHAR(255) NOT NULL,
          merchant_email VARCHAR(255) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR(3) DEFAULT 'USD',
          status VARCHAR(50) DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'processing', 'success', 'failed', 'refunded', 'cancelled')),
          payment_method VARCHAR(50),
          gateway_response JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create status_updates table for tracking all status changes
      await client.query(`
        CREATE TABLE IF NOT EXISTS status_updates (
          id SERIAL PRIMARY KEY,
          entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('ticket', 'transaction')),
          entity_id INTEGER NOT NULL,
          old_status VARCHAR(50),
          new_status VARCHAR(50) NOT NULL,
          updated_by VARCHAR(255),
          update_reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create email_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS email_logs (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id),
          transaction_id VARCHAR(100),
          recipient_email VARCHAR(255) NOT NULL,
          email_type VARCHAR(50) NOT NULL,
          subject TEXT NOT NULL,
          body TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
          sent_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create whatsapp_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_logs (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id),
          transaction_id VARCHAR(100),
          phone_number VARCHAR(20) NOT NULL,
          message_type VARCHAR(50) NOT NULL,
          message_content TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
          whatsapp_message_id VARCHAR(255),
          sent_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'
        )
      `);

      // Create webhook_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_logs (
          id SERIAL PRIMARY KEY,
          source VARCHAR(100) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          payload JSONB NOT NULL,
          processed_at TIMESTAMP WITH TIME ZONE,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions(payer_email)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_status_updates_entity ON status_updates(entity_type, entity_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_ticket ON email_logs(ticket_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_ticket ON whatsapp_logs(ticket_id)');

      await client.query('COMMIT');
      console.log('✅ Database tables initialized successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error initializing database tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async transaction(callback: (client: any) => Promise<any>): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.connected = false;
    console.log('📥 Database connection closed');
  }
}