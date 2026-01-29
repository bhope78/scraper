#!/usr/bin/env node

/**
 * D1 Configuration Helper - GitHub Actions Version
 * Returns hardcoded configuration for GitHub Actions
 */

class D1Config {
    constructor(apiToken) {
        this.apiToken = apiToken;
        // Hardcode configuration for GitHub Actions
        this.config = {
            account_id: 'a2d15074d39d49779729f74c83fc8189',
            database_id: 'f9fe4ade-a55b-4600-bf24-64172903c2c6',
            database_name: 'Calhr',
            table_name: 'ccJobs',
            max_jobs_per_page: '100',
            scraper_delay_ms: '2000',
            batch_size: '25'
        };
    }

    /**
     * Load configuration (for GitHub Actions, just return hardcoded values)
     */
    async loadConfig() {
        console.log('📋 Loading configuration for GitHub Actions...');
        console.log(`✅ Configuration loaded successfully`);
        console.log(`📊 Loaded ${Object.keys(this.config).length} configuration items`);
        return this.config;
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