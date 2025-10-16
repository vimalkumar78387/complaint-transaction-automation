# End-to-End Complaint & Transaction Automation System (SP 3.0)

🚀 **Complete automation workflow for customer complaint and transaction status updates**

## 📋 Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Setup Instructions](#local-setup-instructions)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### 7-Step Automation Workflow:
1. **Email-to-Ticket Automation** - Automatic ticket creation from emails with auto-acknowledgment
2. **CRM Integration** - Intelligent auto-replies based on ticket type
3. **WhatsApp Tracking Links** - Real-time status tracking via WhatsApp
4. **Transaction API Integration** - Real-time transaction status monitoring
5. **Automated Notifications** - Email/WhatsApp notifications for status changes
6. **Merchant Consolidated Updates** - Bulk status updates for merchants
7. **Automatic Ticket Closure** - Smart closure based on resolution criteria

### Additional Features:
- 📊 Real-time dashboard with live updates
- 🎨 Professional UI with color-coded status indicators
- 🔐 JWT-based authentication system
- 📱 Responsive design for all devices
- 🔄 Complete audit trail and logging
- ⚡ Socket.IO for real-time notifications
- 🤖 Automated cron jobs for background tasks

## 🛠️ Tech Stack

### Backend:
- **Node.js** with **Express.js**
- **TypeScript** for type safety
- **PostgreSQL** database
- **Socket.IO** for real-time communication
- **Nodemailer** for email automation
- **WhatsApp Business API** integration
- **JWT** for authentication
- **bcryptjs** for password hashing
- **node-cron** for scheduled tasks

### Frontend:
- **React 18** with **TypeScript**
- **Tailwind CSS v3.x** for styling
- **Heroicons** for icons
- **Socket.IO Client** for real-time updates
- **React Router** for navigation
- **Axios** for API calls

## 📋 Prerequisites

Before running this project locally, ensure you have the following installed:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)
3. **Git** - [Download here](https://git-scm.com/downloads)
4. **VS Code** - [Download here](https://code.visualstudio.com/)

### Recommended VS Code Extensions:
- TypeScript and JavaScript Language Features
- PostgreSQL (by Chris Kolkman)
- REST Client (for API testing)
- GitLens
- Prettier - Code formatter
- ES7+ React/Redux/React-Native snippets

## 🚀 Local Setup Instructions

### Step 1: Clone the Repository
```bash
git clone https://github.com/vimalkumar78387/complaint-transaction-automation.git
cd complaint-transaction-automation
```

### Step 2: Install Dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### Step 3: Set Up PostgreSQL Database

#### Option A: Using PostgreSQL locally
1. Start PostgreSQL service
2. Create a new database:
```sql
CREATE DATABASE complaint_automation;
CREATE USER complaint_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE complaint_automation TO complaint_user;
```

#### Option B: Using Docker (Alternative)
```bash
docker run --name postgres-complaint \
  -e POSTGRES_DB=complaint_automation \
  -e POSTGRES_USER=complaint_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:13
```

### Step 4: Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL=postgresql://complaint_user:your_password@localhost:5432/complaint_automation

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random

# Email Configuration (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# WhatsApp Business API Configuration
WHATSAPP_API_URL=https://api.whatsapp.com/send
WHATSAPP_ACCESS_TOKEN=your-whatsapp-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# Transaction API Configuration
TRANSACTION_API_URL=https://api.transaction-provider.com
TRANSACTION_API_KEY=your-transaction-api-key

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Webhook Configuration
WEBHOOK_SECRET=your-webhook-secret-key
```

### Step 5: Set Up Email Authentication (Gmail)

For Gmail SMTP:
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. Use the generated app password in `EMAIL_PASS`

## 🏃‍♂️ Running the Application

### Method 1: Development Mode (Recommended)
```bash
# Run both backend and frontend concurrently
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- Frontend development server on `http://localhost:3000`

### Method 2: Separate Terminal Windows

#### Terminal 1 - Backend:
```bash
npm run dev:backend
```

#### Terminal 2 - Frontend:
```bash
npm run dev:frontend
```

### Method 3: Production Build
```bash
# Build the frontend
npm run build:frontend

# Start production server
npm start
```

## 🌐 Accessing the Application

Once running, you can access:

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Health Check**: http://localhost:3001/health
- **Dashboard API**: http://localhost:3001/api/dashboard

### Default Login Credentials
```
Email: admin@example.com
Password: admin123
```

## 📡 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Ticket Management
- `GET /api/tickets` - Get all tickets
- `POST /api/tickets` - Create new ticket
- `GET /api/tickets/:id` - Get ticket by ID
- `PUT /api/tickets/:id` - Update ticket
- `DELETE /api/tickets/:id` - Delete ticket

### Transaction Management
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create new transaction
- `GET /api/transactions/:id` - Get transaction by ID
- `PUT /api/transactions/:id` - Update transaction

### Webhooks
- `POST /api/webhooks/email` - Email webhook for ticket creation
- `POST /api/webhooks/transaction` - Transaction status webhook

### Dashboard
- `GET /api/dashboard/overview` - Dashboard statistics
- `GET /api/dashboard/tickets/recent` - Recent tickets
- `GET /api/dashboard/metrics` - System metrics

## 🗄️ Database Schema

The application creates the following tables automatically:

1. **tickets** - Customer complaint tickets
2. **transactions** - Transaction records
3. **status_updates** - Audit trail for status changes
4. **email_logs** - Email communication logs
5. **whatsapp_logs** - WhatsApp message logs
6. **webhook_logs** - Webhook processing logs

## 🧪 Testing

### API Testing with curl:
```bash
# Health check
curl http://localhost:3001/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Create ticket
curl -X POST http://localhost:3001/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"subject":"Test Issue","description":"Test description","customer_email":"test@example.com","priority":"high"}'
```

### Frontend Testing:
1. Open http://localhost:3000
2. Login with default credentials
3. Navigate through the dashboard
4. Create test tickets and transactions

## 🔧 Troubleshooting

### Common Issues:

#### 1. Database Connection Issues
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list | grep postgresql  # macOS

# Test database connection
psql -h localhost -U complaint_user -d complaint_automation
```

#### 2. Port Already in Use
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port in .env
PORT=3002
```

#### 3. Email Configuration Issues
- Verify Gmail app password is correct
- Check if 2FA is enabled
- Test with a simple email client first

#### 4. Frontend Build Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules client/node_modules
npm install
cd client && npm install
```

#### 5. TypeScript Compilation Errors
```bash
# Check TypeScript version
npx tsc --version

# Rebuild TypeScript files
npm run build
```

### Development Tips:

1. **VS Code Setup**:
   - Install recommended extensions
   - Enable TypeScript error checking
   - Use integrated terminal for running commands

2. **Database Management**:
   - Use pgAdmin or VS Code PostgreSQL extension
   - Check logs in `src/database/init.sql` for schema

3. **API Testing**:
   - Use REST Client extension in VS Code
   - Create `.http` files for testing endpoints

4. **Real-time Features**:
   - Open multiple browser tabs to test Socket.IO
   - Check browser console for WebSocket connections

## 📝 Next Steps

After getting the project running:

1. **Customize Configuration**:
   - Update email templates in `src/services/emailService.ts`
   - Modify WhatsApp message templates
   - Configure transaction API endpoints

2. **Production Deployment**:
   - Set up proper environment variables
   - Configure reverse proxy (nginx)
   - Set up SSL certificates
   - Configure production database

3. **Extended Features**:
   - Add more ticket types
   - Implement advanced reporting
   - Add file upload functionality
   - Integrate with more external APIs

## 🤝 Support

If you encounter any issues:

1. Check the console logs (both browser and terminal)
2. Verify environment variables are set correctly
3. Ensure all dependencies are installed
4. Check database connectivity

For additional help, refer to the troubleshooting section or create an issue in the repository.

---

**Happy Coding! 🚀**