import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Database } from './services/database';
import { EmailService } from './services/emailService';
import { WhatsAppService } from './services/whatsappService';
import { TransactionService } from './services/transactionService';
import { CronService } from './services/cronService';

// Import routes
import ticketRoutes from './routes/tickets';
import transactionRoutes from './routes/transactions';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import authRoutes from './routes/auth';

// Load environment variables
dotenv.config();

class App {
  public app: express.Application;
  public server: any;
  public io: Server;
  private database!: Database;
  private emailService!: EmailService;
  private whatsappService!: WhatsAppService;
  private transactionService!: TransactionService;
  private cronService!: CronService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.initializeServices();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeSocketHandlers();
  }

  private async initializeServices() {
    try {
      // Initialize database
      this.database = new Database();
      await this.database.connect();
      await this.database.initializeTables();

      // Initialize other services
      this.emailService = new EmailService();
      this.whatsappService = new WhatsAppService();
      this.transactionService = new TransactionService();
      this.cronService = new CronService(this.emailService, this.whatsappService, this.transactionService);
      
      // Start cron jobs
      console.log('📅 Cron jobs started');
      void this.cronService; // Reference to avoid unused variable warning

      console.log('✅ All services initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing services:', error);
      process.exit(1);
    }
  }

  private initializeMiddlewares() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, _res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Make services available to routes
    this.app.use((req: any, _res, next) => {
      req.database = this.database;
      req.emailService = this.emailService;
      req.whatsappService = this.whatsappService;
      req.transactionService = this.transactionService;
      req.io = this.io;
      next();
    });
  }

  private initializeRoutes() {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        services: {
          database: this.database.isConnected(),
          email: this.emailService.isConfigured(),
          whatsapp: this.whatsappService.isConfigured()
        }
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/tickets', ticketRoutes);
    this.app.use('/api/transactions', transactionRoutes);
    this.app.use('/api/webhooks', webhookRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);

    // Serve static files (for production)
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('client/build'));
      this.app.get('*', (_req, res) => {
        res.sendFile('client/build/index.html', { root: process.cwd() });
      });
    }
  }

  private initializeErrorHandling() {
    // 404 handler
    this.app.use('*', (_req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });

    // Global error handler
    this.app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Global error handler:', error);
      
      const status = error.status || error.statusCode || 500;
      const message = error.message || 'Internal server error';
      
      res.status(status).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });
  }

  private initializeSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`Client ${socket.id} joined room: ${room}`);
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  public start() {
    const port = process.env.PORT || 3001;
    
    this.server.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📊 Dashboard: http://localhost:${port}/api/dashboard`);
      console.log(`🔗 Health check: http://localhost:${port}/health`);
      console.log(`🎯 Frontend: http://localhost:3000`);
    });
  }
}

// Start the application
const app = new App();
app.start();

export default app;