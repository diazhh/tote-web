require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3002,
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  backendApiKey: process.env.BACKEND_API_KEY || '',
  sessionPath: process.env.SESSION_PATH || './whatsapp-session',
  logLevel: process.env.LOG_LEVEL || 'info'
};
