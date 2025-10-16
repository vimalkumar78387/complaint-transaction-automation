import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface SocketContextType {
  socket: any | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    if (isAuthenticated && token) {
      const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
      
      const newSocket = io(socketUrl, {
        auth: {
          token,
        },
        transports: ['websocket'],
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        
        // Join user-specific room
        newSocket.emit('join-room', `user-${token}`);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      // Listen for real-time updates
      newSocket.on('ticket_created', (data: any) => {
        addToast({
          type: 'info',
          title: 'New Ticket Created',
          message: `Ticket #${data.ticket.ticket_number} has been created`,
        });
      });

      newSocket.on('ticket_updated', (data: any) => {
        addToast({
          type: 'info',
          title: 'Ticket Updated',
          message: `Ticket #${data.ticket.ticket_number} status changed to ${data.newStatus}`,
        });
      });

      newSocket.on('transaction_created', (data: any) => {
        addToast({
          type: 'info',
          title: 'New Transaction',
          message: `Transaction ${data.transaction.transaction_id} created`,
        });
      });

      newSocket.on('transaction_updated', (data: any) => {
        const statusColors = {
          success: 'success',
          failed: 'error',
          refunded: 'warning',
        } as const;

        addToast({
          type: statusColors[data.newStatus as keyof typeof statusColors] || 'info',
          title: 'Transaction Updated',
          message: `Transaction ${data.transaction.transaction_id} is now ${data.newStatus}`,
        });
      });

      newSocket.on('system_alert', (data: any) => {
        addToast({
          type: data.level === 'high' ? 'error' : data.level === 'medium' ? 'warning' : 'info',
          title: 'System Alert',
          message: data.message,
          duration: data.level === 'high' ? 10000 : 5000,
        });
      });

      newSocket.on('connect_error', (error: any) => {
        console.error('Socket connection error:', error);
        addToast({
          type: 'error',
          title: 'Connection Error',
          message: 'Failed to connect to real-time updates',
        });
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
        setSocket(null);
        setIsConnected(false);
      };
    }
  }, [isAuthenticated, token, addToast]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};