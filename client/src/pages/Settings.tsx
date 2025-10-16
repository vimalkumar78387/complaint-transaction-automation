import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure system settings and automation rules
        </p>
      </div>
      
      <div className="card p-8 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">System Configuration</h3>
        <p className="text-gray-500">
          This page will allow configuration of email templates, WhatsApp settings, automation rules, and integrations.
        </p>
        <div className="mt-4 text-sm text-gray-400">
          Features: Email Templates, WhatsApp Configuration, API Settings, Notification Rules, User Management
        </div>
      </div>
    </div>
  );
};

export default Settings;