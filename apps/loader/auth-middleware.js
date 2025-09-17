/**
 * Security Research Loader Authentication Middleware
 * Implements JWT-based auth with rate limiting for research endpoints
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

class AuthMiddleware {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || this.generateSecret();
    this.rateLimits = new Map(); // IP -> { count, lastReset }
    this.maxRequests = options.maxRequests || 100; // per window
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.researchApiKey = options.researchApiKey || process.env.RESEARCH_API_KEY;
  }

  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate research session token
   * Used for legitimate security research access
   */
  generateResearchToken(payload = {}) {
    const tokenPayload = {
      ...payload,
      type: 'research',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    
    return jwt.sign(tokenPayload, this.jwtSecret);
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Rate limiting implementation
   */
  checkRateLimit(ip) {
    const now = Date.now();
    const userLimit = this.rateLimits.get(ip);

    if (!userLimit) {
      this.rateLimits.set(ip, { count: 1, lastReset: now });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    // Reset window if expired
    if (now - userLimit.lastReset > this.windowMs) {
      this.rateLimits.set(ip, { count: 1, lastReset: now });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    // Check if limit exceeded
    if (userLimit.count >= this.maxRequests) {
      return { 
        allowed: false, 
        remaining: 0,
        resetTime: new Date(userLimit.lastReset + this.windowMs)
      };
    }

    // Increment count
    userLimit.count++;
    return { 
      allowed: true, 
      remaining: this.maxRequests - userLimit.count 
    };
  }

  /**
   * Express middleware for authentication
   */
  authenticate() {
    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      
      // Rate limiting check
      const rateLimit = this.checkRateLimit(ip);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          resetTime: rateLimit.resetTime,
          message: 'Too many requests from this IP'
        });
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': this.maxRequests,
        'X-RateLimit-Remaining': rateLimit.remaining,
        'X-RateLimit-Reset': new Date(Date.now() + this.windowMs).toISOString()
      });

      // Check for research API key (for automated tools)
      const apiKey = req.headers['x-research-key'] || req.query.research_key;
      if (apiKey === this.researchApiKey) {
        req.user = { type: 'research-api', verified: true };
        return next();
      }

      // Check JWT token
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Provide JWT token or research API key'
        });
      }

      try {
        const decoded = this.verifyToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(403).json({
          error: 'Invalid token',
          message: error.message
        });
      }
    };
  }

  /**
   * Middleware for payload access logging
   */
  logAccess() {
    return (req, res, next) => {
      const timestamp = new Date().toISOString();
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'unknown';
      const payload = req.params.payload || req.path;

      console.log(`🔍 [${timestamp}] Research access: ${ip} -> ${payload} (${userAgent})`);
      next();
    };
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanupRateLimits() {
    const now = Date.now();
    for (const [ip, data] of this.rateLimits.entries()) {
      if (now - data.lastReset > this.windowMs * 2) { // Keep for 2 windows
        this.rateLimits.delete(ip);
      }
    }
  }
}

export { AuthMiddleware };