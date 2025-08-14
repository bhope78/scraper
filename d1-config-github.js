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
            account_id: 'aa3156a55993be3bb2b637b7619ddc23',
            database_id: 'fcde85de-7c22-46a5-8eaf-f68a7aa0c1b9',
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