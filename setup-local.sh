#!/bin/bash

# Setup script for local development environment
# Run this script after cloning the repository

echo "🚀 Setting up Complaint & Transaction Automation System locally..."
echo "================================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL is not installed. Please install PostgreSQL v12 or higher."
    echo "   Download from: https://www.postgresql.org/download/"
    echo "   Or use Docker: docker run --name postgres-complaint -e POSTGRES_DB=complaint_automation -e POSTGRES_USER=complaint_user -e POSTGRES_PASSWORD=your_password -p 5432:5432 -d postgres:13"
fi

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Backend dependencies installed successfully"
else
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd client
npm install

if [ $? -eq 0 ]; then
    echo "✅ Frontend dependencies installed successfully"
else
    echo "❌ Failed to install frontend dependencies"
    exit 1
fi

cd ..

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://complaint_user:your_password@localhost:5432/complaint_automation

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random-123456789

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
EOF
    echo "✅ .env file created with default values"
    echo "⚠️  Please update the .env file with your actual configuration values!"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env file with your actual database and API credentials"
echo "2. Set up your PostgreSQL database:"
echo "   CREATE DATABASE complaint_automation;"
echo "   CREATE USER complaint_user WITH PASSWORD 'your_password';"
echo "   GRANT ALL PRIVILEGES ON DATABASE complaint_automation TO complaint_user;"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Open your browser and go to:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "📚 For detailed instructions, see README.md"
echo ""
echo "Happy coding! 🚀"