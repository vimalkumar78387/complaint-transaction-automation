import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const TicketTracker: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [ticketNumber, setTicketNumber] = useState(searchParams.get('ticket') || '');
  const [ticketData, setTicketData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!ticketNumber.trim()) return;
    
    setLoading(true);
    // In a real implementation, this would call the API
    setTimeout(() => {
      setTicketData({
        ticket_number: ticketNumber,
        status: 'in_progress',
        subject: 'Payment Issue with Transaction #12345',
        created_at: new Date().toISOString(),
        description: 'Customer is experiencing issues with a failed payment transaction.',
        updates: [
          { status: 'open', timestamp: new Date(Date.now() - 86400000).toISOString(), message: 'Ticket created and assigned to support team' },
          { status: 'in_progress', timestamp: new Date(Date.now() - 43200000).toISOString(), message: 'Investigation started - checking transaction logs' },
        ]
      });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Track Your Complaint</h1>
          <p className="mt-2 text-gray-600">Enter your ticket number to check the current status</p>
        </div>

        <div className="card p-6 mb-8">
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="Enter ticket number (e.g., TK1234567890)"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !ticketNumber.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Track'}
            </button>
          </div>
        </div>

        {ticketData && (
          <div className="card p-6">
            <div className="border-b border-gray-200 pb-4 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Ticket #{ticketData.ticket_number}
              </h2>
              <div className="mt-2 flex items-center space-x-4">
                <span className={`status-${ticketData.status}`}>
                  {ticketData.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className="text-sm text-gray-500">
                  Created {new Date(ticketData.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Subject</h3>
              <p className="text-gray-700">{ticketData.subject}</p>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700">{ticketData.description}</p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Status Updates</h3>
              <div className="space-y-4">
                {ticketData.updates.map((update: any, index: number) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className={`h-3 w-3 rounded-full mt-2 ${
                        update.status === 'open' ? 'bg-primary-400' :
                        update.status === 'in_progress' ? 'bg-warning-400' :
                        update.status === 'resolved' ? 'bg-success-400' :
                        'bg-gray-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`status-${update.status}`}>
                          {update.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(update.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-700">{update.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Need more help?</h4>
              <p className="text-blue-700 text-sm">
                If you have any questions about your complaint, feel free to contact our support team. 
                We're here to help and will keep you updated on any progress.
              </p>
            </div>
          </div>
        )}

        {!ticketData && ticketNumber && !loading && (
          <div className="card p-6 text-center">
            <p className="text-gray-500">No ticket found with that number. Please check and try again.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketTracker;