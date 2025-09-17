#!/usr/bin/env node

/**
 * Security Research Credential Rotator
 * Generates rotating SOCKS5 credentials for research proxies
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class SecureCredRotator {
  constructor() {
    this.configPath = path.join(process.cwd(), 'configs', 'master-rules.yaml');
    this.credentialStore = path.join(process.cwd(), '.credentials', 'proxy-creds.enc');
  }

  /**
   * Generate time-based rotating credentials
   * Uses HMAC with current hour for deterministic but rotating creds
   */
  generateRotatingCreds() {
    const now = new Date();
    const hourSeed = Math.floor(now.getTime() / (1000 * 60 * 60)); // Changes every hour
    
    // Generate deterministic but rotating credentials
    const userSeed = crypto.createHmac('sha256', process.env.CRED_SEED || 'research-proxy-2024')
                          .update(`user-${hourSeed}`)
                          .digest('hex')
                          .substring(0, 12);
    
    const passSeed = crypto.createHmac('sha256', process.env.CRED_SEED || 'research-proxy-2024')
                          .update(`pass-${hourSeed}`)
                          .digest('hex')
                          .substring(0, 16);

    return {
      user: `r_${userSeed}`,
      pass: `${passSeed}`,
      expires: new Date(now.getTime() + (60 * 60 * 1000)).toISOString() // 1 hour
    };
  }

  /**
   * Update master-rules.yaml with rotating credentials
   */
  async updateCredentials() {
    try {
      const newCreds = this.generateRotatingCreds();
      const configContent = await fs.readFile(this.configPath, 'utf8');
      
      // Replace hardcoded credentials with rotating ones
      const updatedConfig = configContent
        .replace(/user: twozpyil/g, `user: ${newCreds.user}`)
        .replace(/pass: y4syr3w1dcuz/g, `pass: ${newCreds.pass}`)
        .replace(/updated: [^\\n]+/g, `updated: ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]} UTC`);

      await fs.writeFile(this.configPath, updatedConfig, 'utf8');
      
      console.log(`🔐 Credentials rotated successfully`);
      console.log(`📅 Next rotation: ${newCreds.expires}`);
      
      return newCreds;
    } catch (error) {
      console.error('❌ Failed to rotate credentials:', error.message);
      throw error;
    }
  }

  /**
   * Store encrypted credentials for server sync
   */
  async storeEncryptedCreds(creds) {
    try {
      await fs.mkdir(path.dirname(this.credentialStore), { recursive: true });
      
      const key = crypto.scryptSync(process.env.CRED_SEED || 'research-proxy-2024', 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipherGCM('aes-256-gcm', key);
      cipher.setAAD(Buffer.from('proxy-creds'));

      let encrypted = cipher.update(JSON.stringify(creds), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      const payload = {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        data: encrypted
      };

      await fs.writeFile(this.credentialStore, JSON.stringify(payload), 'utf8');
    } catch (error) {
      console.error('❌ Failed to store encrypted credentials:', error.message);
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const rotator = new SecureCredRotator();
  
  (async () => {
    try {
      const creds = await rotator.updateCredentials();
      await rotator.storeEncryptedCreds(creds);
      process.exit(0);
    } catch (error) {
      console.error('❌ Credential rotation failed:', error.message);
      process.exit(1);
    }
  })();
}

export { SecureCredRotator };