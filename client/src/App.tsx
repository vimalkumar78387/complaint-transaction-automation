import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import Transactions from './pages/Transactions';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Login from './pages/Login';
import TicketTracker from './pages/TicketTracker';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SocketProvider>
          <Router>
            <div className="App">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/track" element={<TicketTracker />} />
                <Route
                  path="/*"
                  element={
                    <PrivateRoute>
                      <Layout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/tickets" element={<Tickets />} />
                          <Route path="/transactions" element={<Transactions />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/settings" element={<Settings />} />
                        </Routes>
                      </Layout>
                    </PrivateRoute>
                  }
                />
              </Routes>
            </div>
          </Router>
        </SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;