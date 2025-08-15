#!/usr/bin/env node

/**
 * Bulletproof Authentication Manager for Cloudflare API
 * Handles multiple authentication methods with fallback strategies
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class AuthManager {
    constructor() {
        this.apiToken = null;
        this.isAuthenticated = false;
        this.authMethod = null;
        this.validationCache = new Map();
        this.maxRetries = 3;
        this.retryDelay = 2000;
    }

    /**
     * Initialize authentication with multiple fallback methods
     */
    async initialize() {
        console.log('🔐 Initializing Cloudflare authentication...');
        
        const methods = [
            this.authenticateWithEnvironmentVariable.bind(this),
            this.authenticateWithWranglerConfig.bind(this),
            this.authenticateWithConfigFile.bind(this)
        ];

        for (const method of methods) {
            try {
                await method();
                if (this.isAuthenticated) {
                    console.log(`✅ Authentication successful using ${this.authMethod}`);
                    return true;
                }
            } catch (error) {
                console.warn(`⚠️  Authentication method failed: ${error.message}`);
            }
        }

        throw new Error('❌ All authentication methods failed');
    }

    /**
     * Method 1: Environment variable authentication
     */
    async authenticateWithEnvironmentVariable() {
        console.log('🔑 Trying environment variable authentication...');
        
        const token = process.env.CLOUDFLARE_API_TOKEN;
        if (!token) {
            throw new Error('CLOUDFLARE_API_TOKEN environment variable not found');
        }

        // Clean the token (remove quotes and escape sequences)
        this.apiToken = token.replace(/^["']|["']$/g, '').trim();
        
        if (this.apiToken.length < 10) {
            throw new Error('Token appears to be invalid (too short)');
        }

        await this.validateToken();
        this.authMethod = 'environment_variable';
        this.isAuthenticated = true;
    }

    /**
     * Method 2: Wrangler whoami authentication
     */
    async authenticateWithWranglerConfig() {
        console.log('🔑 Trying wrangler config authentication...');
        
        try {
            const { stdout } = await execAsync('npx wrangler whoami');
            if (stdout.includes('@')) {
                console.log('📧 Found authenticated wrangler session');
                this.authMethod = 'wrangler_config';
                this.isAuthenticated = true;
                return;
            }
        } catch (error) {
            throw new Error('No authenticated wrangler session found');
        }
    }

    /**
     * Method 3: Config file authentication
     */
    async authenticateWithConfigFile() {
        console.log('🔑 Trying config file authentication...');
        
        const configPaths = [
            path.join(process.env.HOME || '/', '.wrangler', 'config', 'default.toml'),
            path.join(process.cwd(), '.wrangler.toml'),
            path.join(process.cwd(), 'wrangler.toml')
        ];

        for (const configPath of configPaths) {
            try {
                const content = await fs.readFile(configPath, 'utf8');
                const tokenMatch = content.match(/api_token\s*=\s*["']([^"']+)["']/);
                if (tokenMatch) {
                    this.apiToken = tokenMatch[1];
                    await this.validateToken();
                    this.authMethod = 'config_file';
                    this.isAuthenticated = true;
                    return;
                }
            } catch (error) {
                // Continue to next config path
            }
        }

        throw new Error('No valid config file found');
    }

    /**
     * Validate the API token with Cloudflare
     */
    async validateToken() {
        if (!this.apiToken) {
            throw new Error('No API token to validate');
        }

        // Check cache first
        const cacheKey = this.apiToken.substring(0, 8);
        if (this.validationCache.has(cacheKey)) {
            return this.validationCache.get(cacheKey);
        }

        console.log('🔍 Validating API token...');

        try {
            const { stdout } = await execAsync(
                `curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
                -H "Authorization: Bearer ${this.apiToken}" \
                -H "Content-Type: application/json"`,
                { timeout: 10000 }
            );

            const response = JSON.parse(stdout);
            
            if (!response.success) {
                throw new Error(`Token validation failed: ${response.errors?.[0]?.message || 'Unknown error'}`);
            }

            const tokenInfo = response.result;
            console.log(`✅ Token valid - ID: ${tokenInfo.id}`);
            console.log(`📅 Expires: ${tokenInfo.expires_on || 'Never'}`);
            
            // Check D1 permissions
            if (tokenInfo.policies && tokenInfo.policies.length > 0) {
                const hasD1Permission = tokenInfo.policies.some(policy => 
                    policy.resources?.includes('zone:*') || 
                    policy.resources?.includes('account:*') ||
                    policy.effect === 'allow'
                );
                
                if (!hasD1Permission) {
                    console.warn('⚠️  Token may not have D1 permissions');
                }
            }

            // Cache successful validation
            this.validationCache.set(cacheKey, tokenInfo);
            return tokenInfo;

        } catch (error) {
            throw new Error(`Token validation failed: ${error.message}`);
        }
    }

    /**
     * Get environment variables for child processes
     */
    getEnvironment() {
        if (!this.isAuthenticated) {
            throw new Error('Authentication not initialized');
        }

        const env = { ...process.env };
        
        if (this.apiToken) {
            env.CLOUDFLARE_API_TOKEN = this.apiToken;
        }

        // Remove any problematic variables
        delete env.CLOUDFLARE_EMAIL;
        delete env.CLOUDFLARE_API_KEY;

        return env;
    }

    /**
     * Execute wrangler command with proper authentication
     */
    async executeWranglerCommand(command, options = {}) {
        if (!this.isAuthenticated) {
            await this.initialize();
        }

        const env = this.getEnvironment();
        const fullCommand = command.startsWith('wrangler') ? command : `npx wrangler ${command}`;
        
        console.log(`🚀 Executing: ${fullCommand}`);

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await execAsync(fullCommand, {
                    env,
                    timeout: options.timeout || 30000,
                    ...options
                });

                return result;
            } catch (error) {
                console.warn(`⚠️  Attempt ${attempt}/${this.maxRetries} failed: ${error.message}`);
                
                if (attempt === this.maxRetries) {
                    throw error;
                }

                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
            }
        }
    }

    /**
     * Test D1 database connectivity
     */
    async testD1Connection(databaseName = 'Calhr') {
        console.log(`🔍 Testing D1 database connection: ${databaseName}`);

        try {
            const result = await this.executeWranglerCommand(
                `d1 execute ${databaseName} --remote --command "SELECT 1 as test" --json`
            );

            const output = JSON.parse(result.stdout);
            if (output[0]?.results?.[0]?.test === 1) {
                console.log('✅ D1 database connection successful');
                return true;
            } else {
                throw new Error('Unexpected response from database');
            }
        } catch (error) {
            console.error(`❌ D1 connection test failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get authentication status and diagnostics
     */
    getDiagnostics() {
        return {
            isAuthenticated: this.isAuthenticated,
            authMethod: this.authMethod,
            hasToken: !!this.apiToken,
            tokenPreview: this.apiToken ? `${this.apiToken.substring(0, 8)}...` : null,
            environment: process.env.GITHUB_ACTIONS ? 'github_actions' : 'local',
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset authentication state
     */
    reset() {
        this.apiToken = null;
        this.isAuthenticated = false;
        this.authMethod = null;
        this.validationCache.clear();
    }
}

module.exports = AuthManager;