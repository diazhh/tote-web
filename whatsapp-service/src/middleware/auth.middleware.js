const config = require('../config/config');
const logger = require('../config/logger');

const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    logger.warn('API request without API key');
    return res.status(401).json({ error: 'API key is required' });
  }
  
  if (apiKey !== config.backendApiKey) {
    logger.warn('API request with invalid API key');
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};

module.exports = { authenticate };
