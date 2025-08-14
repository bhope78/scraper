#!/usr/bin/env node

/**
 * D1 Configuration Helper - Local Version
 * Works with OAuth authentication for local testing
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class D1Config {
    constructor(apiToken) {
        this.apiToken = apiToken;
        this.config = {};
    }

    /**
     * Fetch all configuration from D1
     */
    async loadConfig() {
        try {
            // First, get the database name from environment or use default
            const dbName = process.env.D1_DATABASE_NAME || 'Calhr';
            
            console.log(`📋 Loading configuration from D1 database: ${dbName}`);
            
            // For local/OAuth, don't set CLOUDFLARE_API_TOKEN
            const command = `npx wrangler d1 execute ${dbName} --remote --command "SELECT key, value FROM scraper_config" --json`;
            
            const { stdout } = await execAsync(command);
            
            const result = JSON.parse(stdout);
            
            if (result && result[0] && result[0].results) {
                // Convert array of {key, value} to object
                result[0].results.forEach(row => {
                    this.config[row.key] = row.value;
                });
                
                console.log('✅ Configuration loaded successfully');
                console.log(`📊 Loaded ${Object.keys(this.config).length} configuration items`);
            } else {
                throw new Error('No configuration found in database');
            }
            
            return this.config;
        } catch (error) {
            console.error('❌ Failed to load configuration:', error.message);
            throw error;
        }
    }

    /**
     * Get a specific configuration value
     */
    get(key) {
        return this.config[key];
    }

    /**
     * Get all configuration
     */
    getAll() {
        return this.config;
    }

    /**
     * Update a configuration value in D1
     */
    async updateConfig(key, value, description = null) {
        try {
            const dbName = this.config.database_name || 'Calhr';
            const descPart = description ? `, description = '${description}'` : '';
            
            const command = `npx wrangler d1 execute ${dbName} --remote --command "UPDATE scraper_config SET value = '${value}'${descPart}, updated_at = datetime('now') WHERE key = '${key}'"`;
            
            await execAsync(command);
            
            // Update local cache
            this.config[key] = value;
            
            console.log(`✅ Updated config: ${key} = ${value}`);
        } catch (error) {
            console.error(`❌ Failed to update config ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Validate required configuration
     */
    validateConfig(requiredKeys = ['account_id', 'database_id', 'database_name', 'table_name']) {
        const missing = requiredKeys.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required configuration: ${missing.join(', ')}`);
        }
        
        console.log('✅ All required configuration present');
        return true;
    }
}

// Export for use in other scripts
module.exports = D1Config;