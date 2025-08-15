#!/usr/bin/env node

/**
 * Failover Authentication Manager
 * Implements multiple authentication strategies with automatic failover
 */

const AuthManager = require('./auth-manager');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class FailoverAuthManager {
    constructor() {
        this.authMethods = [];
        this.currentAuth = null;
        this.fallbackDelay = 3000;
        this.healthCheckInterval = 30000; // 30 seconds
        this.lastHealthCheck = null;
        this.authHistory = [];
        this.maxHistoryLength = 10;
    }

    /**
     * Initialize all authentication methods
     */
    async initialize() {
        console.log('🔄 Initializing failover authentication system...');
        
        // Method 1: Primary API Token Authentication
        this.authMethods.push({
            name: 'primary_api_token',
            priority: 1,
            description: 'Primary Cloudflare API Token',
            auth: new AuthManager(),
            healthCheck: this.apiTokenHealthCheck.bind(this),
            fallbackConditions: ['token_expired', 'permission_denied', 'invalid_token']
        });

        // Method 2: Wrangler Session Authentication
        this.authMethods.push({
            name: 'wrangler_session',
            priority: 2,
            description: 'Wrangler Session Authentication',
            auth: null, // Will be initialized if needed
            healthCheck: this.wranglerSessionHealthCheck.bind(this),
            fallbackConditions: ['session_expired', 'not_logged_in']
        });

        // Method 3: Environment File Authentication
        this.authMethods.push({
            name: 'env_file',
            priority: 3,
            description: 'Environment File Token',
            auth: new AuthManager(),
            healthCheck: this.envFileHealthCheck.bind(this),
            fallbackConditions: ['file_not_found', 'invalid_format']
        });

        // Method 4: Interactive Authentication (local only)
        if (process.env.GITHUB_ACTIONS !== 'true') {
            this.authMethods.push({
                name: 'interactive',
                priority: 4,
                description: 'Interactive Authentication Setup',
                auth: null,
                healthCheck: this.interactiveHealthCheck.bind(this),
                fallbackConditions: ['user_cancelled']
            });
        }

        // Sort by priority
        this.authMethods.sort((a, b) => a.priority - b.priority);

        console.log(`✅ Initialized ${this.authMethods.length} authentication methods`);
        this.authMethods.forEach(method => {
            console.log(`   ${method.priority}. ${method.description}`);
        });

        return this.authenticateWithFailover();
    }

    /**
     * Attempt authentication with automatic failover
     */
    async authenticateWithFailover() {
        console.log('\n🔐 Attempting authentication with failover...');
        
        for (const method of this.authMethods) {
            try {
                console.log(`\n🔑 Trying ${method.description}...`);
                
                const result = await this.tryAuthMethod(method);
                if (result.success) {
                    this.currentAuth = method;
                    this.recordAuthSuccess(method, result);
                    console.log(`✅ Authentication successful with ${method.description}`);
                    return result;
                }

            } catch (error) {
                console.warn(`⚠️  ${method.description} failed: ${error.message}`);
                this.recordAuthFailure(method, error);
                
                // Check if this error should trigger fallback
                if (this.shouldFallback(method, error)) {
                    console.log(`🔄 Falling back from ${method.description}...`);
                    await this.delay(this.fallbackDelay);
                    continue;
                } else {
                    console.log(`🛑 ${method.description} failure is not recoverable`);
                }
            }
        }

        throw new Error('All authentication methods failed');
    }

    /**
     * Try a specific authentication method
     */
    async tryAuthMethod(method) {
        const startTime = Date.now();
        
        try {
            // Initialize auth manager if needed
            if (!method.auth) {
                method.auth = new AuthManager();
            }

            // Run health check first
            const healthResult = await method.healthCheck();
            if (!healthResult.healthy) {
                throw new Error(healthResult.reason || 'Health check failed');
            }

            // Attempt authentication
            await method.auth.initialize();
            
            // Validate with D1 connection
            await method.auth.testD1Connection('Calhr');

            const duration = Date.now() - startTime;
            return {
                success: true,
                method: method.name,
                duration: duration,
                details: method.auth.getDiagnostics()
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            throw new Error(`${method.name} failed after ${duration}ms: ${error.message}`);
        }
    }

    /**
     * Health check for API token method
     */
    async apiTokenHealthCheck() {
        const token = process.env.CLOUDFLARE_API_TOKEN;
        
        if (!token) {
            return { healthy: false, reason: 'No API token found' };
        }

        if (token.length < 30) {
            return { healthy: false, reason: 'Token appears too short' };
        }

        // Quick format validation
        if (!token.match(/^[A-Za-z0-9_-]+$/)) {
            return { healthy: false, reason: 'Token contains invalid characters' };
        }

        return { healthy: true, reason: 'Token format looks good' };
    }

    /**
     * Health check for wrangler session method
     */
    async wranglerSessionHealthCheck() {
        try {
            const { stdout } = await execAsync('npx wrangler whoami --json', { timeout: 10000 });
            const result = JSON.parse(stdout);
            
            if (result.email) {
                return { healthy: true, reason: `Logged in as ${result.email}` };
            } else {
                return { healthy: false, reason: 'Not logged in to wrangler' };
            }
        } catch (error) {
            return { healthy: false, reason: 'Wrangler session check failed' };
        }
    }

    /**
     * Health check for environment file method
     */
    async envFileHealthCheck() {
        const envFiles = [
            path.join(process.cwd(), '.env'),
            path.join(process.cwd(), '.env.local'),
            path.join(process.env.HOME || '/', '.cloudflare-token')
        ];

        for (const filePath of envFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                if (content.includes('CLOUDFLARE_API_TOKEN')) {
                    return { healthy: true, reason: `Found token in ${filePath}` };
                }
            } catch (error) {
                // Continue to next file
            }
        }

        return { healthy: false, reason: 'No environment file with token found' };
    }

    /**
     * Health check for interactive method
     */
    async interactiveHealthCheck() {
        if (process.env.GITHUB_ACTIONS === 'true') {
            return { healthy: false, reason: 'Interactive mode not available in CI' };
        }

        if (!process.stdin.isTTY) {
            return { healthy: false, reason: 'No interactive terminal available' };
        }

        return { healthy: true, reason: 'Interactive mode available' };
    }

    /**
     * Determine if we should fallback from a failed method
     */
    shouldFallback(method, error) {
        const errorMessage = error.message.toLowerCase();
        
        return method.fallbackConditions.some(condition => 
            errorMessage.includes(condition.replace('_', ' ')) ||
            errorMessage.includes(condition)
        );
    }

    /**
     * Record successful authentication
     */
    recordAuthSuccess(method, result) {
        this.authHistory.unshift({
            timestamp: new Date().toISOString(),
            method: method.name,
            status: 'success',
            duration: result.duration,
            details: result.details
        });

        this.trimHistory();
    }

    /**
     * Record failed authentication
     */
    recordAuthFailure(method, error) {
        this.authHistory.unshift({
            timestamp: new Date().toISOString(),
            method: method.name,
            status: 'failure',
            error: error.message
        });

        this.trimHistory();
    }

    /**
     * Trim authentication history
     */
    trimHistory() {
        while (this.authHistory.length > this.maxHistoryLength) {
            this.authHistory.pop();
        }
    }

    /**
     * Get current authentication status
     */
    getAuthStatus() {
        return {
            currentMethod: this.currentAuth?.name || null,
            currentDescription: this.currentAuth?.description || null,
            isAuthenticated: !!this.currentAuth,
            lastHealthCheck: this.lastHealthCheck,
            authHistory: this.authHistory.slice(0, 5), // Last 5 attempts
            availableMethods: this.authMethods.map(m => ({
                name: m.name,
                description: m.description,
                priority: m.priority
            }))
        };
    }

    /**
     * Perform periodic health check
     */
    async performHealthCheck() {
        if (!this.currentAuth) {
            return { healthy: false, reason: 'No current authentication' };
        }

        try {
            console.log('🔍 Performing periodic health check...');
            
            const healthResult = await this.currentAuth.healthCheck();
            if (!healthResult.healthy) {
                console.warn('⚠️  Health check failed, attempting re-authentication...');
                return this.authenticateWithFailover();
            }

            // Test D1 connection
            await this.currentAuth.auth.testD1Connection('Calhr');
            
            this.lastHealthCheck = new Date().toISOString();
            console.log('✅ Health check passed');
            
            return { healthy: true, method: this.currentAuth.name };

        } catch (error) {
            console.error(`❌ Health check failed: ${error.message}`);
            console.log('🔄 Attempting re-authentication...');
            
            // Clear current auth and retry
            this.currentAuth = null;
            return this.authenticateWithFailover();
        }
    }

    /**
     * Execute wrangler command with current authentication
     */
    async executeWranglerCommand(command, options = {}) {
        if (!this.currentAuth) {
            await this.authenticateWithFailover();
        }

        try {
            return await this.currentAuth.auth.executeWranglerCommand(command, options);
        } catch (error) {
            console.warn(`⚠️  Command failed, checking authentication: ${error.message}`);
            
            // Try re-authentication once
            await this.authenticateWithFailover();
            return await this.currentAuth.auth.executeWranglerCommand(command, options);
        }
    }

    /**
     * Start automatic health monitoring
     */
    startHealthMonitoring() {
        console.log(`🔄 Starting health monitoring (${this.healthCheckInterval / 1000}s interval)`);
        
        setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                console.error(`❌ Health monitoring error: ${error.message}`);
            }
        }, this.healthCheckInterval);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
            console.log('🛑 Health monitoring stopped');
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate comprehensive status report
     */
    generateStatusReport() {
        const status = this.getAuthStatus();
        
        return {
            timestamp: new Date().toISOString(),
            environment: process.env.GITHUB_ACTIONS ? 'github_actions' : 'local',
            authentication: status,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                workingDirectory: process.cwd()
            },
            configuration: {
                fallbackDelay: this.fallbackDelay,
                healthCheckInterval: this.healthCheckInterval,
                maxHistoryLength: this.maxHistoryLength
            }
        };
    }
}

// CLI usage
if (require.main === module) {
    const manager = new FailoverAuthManager();
    
    const command = process.argv[2] || 'test';
    
    const runTest = async () => {
        try {
            console.log('🚀 Testing failover authentication system...');
            
            await manager.initialize();
            
            // Test a wrangler command
            console.log('\n🔍 Testing wrangler command execution...');
            const result = await manager.executeWranglerCommand('d1 list --json');
            console.log('✅ Wrangler command successful');
            
            // Display status report
            console.log('\n📊 Status Report:');
            const report = manager.generateStatusReport();
            console.log(JSON.stringify(report, null, 2));
            
        } catch (error) {
            console.error(`❌ Test failed: ${error.message}`);
            process.exit(1);
        }
    };
    
    if (command === 'test') {
        runTest();
    } else if (command === 'status') {
        manager.initialize().then(() => {
            const report = manager.generateStatusReport();
            console.log(JSON.stringify(report, null, 2));
        }).catch(error => {
            console.error(`Status check failed: ${error.message}`);
            process.exit(1);
        });
    }
}

module.exports = FailoverAuthManager;