#!/usr/bin/env node

/**
 * D1 Bulletproof Connection Manager
 * Database Expert - Enterprise-grade connection handling with retry logic
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class D1ConnectionManager {
    constructor(options = {}) {
        this.config = {
            apiToken: options.apiToken || process.env.CLOUDFLARE_API_TOKEN,
            databaseName: options.databaseName || 'Calhr',
            tableName: options.tableName || 'ccJobs',
            accountId: options.accountId || 'a2d15074d39d49779729f74c83fc8189',
            databaseId: options.databaseId || 'f9fe4ade-a55b-4600-bf24-64172903c2c6',
            
            // Retry configuration
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000, // ms
            backoffMultiplier: options.backoffMultiplier || 2,
            
            // Timeout configuration
            queryTimeout: options.queryTimeout || 30000, // 30 seconds
            connectionTimeout: options.connectionTimeout || 60000, // 60 seconds
            
            // Performance tuning
            maxBuffer: options.maxBuffer || 10 * 1024 * 1024, // 10MB
            batchSize: options.batchSize || 25,
            
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
            isLocal: !process.env.GITHUB_ACTIONS,
            
            // Logging
            verbose: options.verbose || false,
            logLevel: options.logLevel || 'info' // error, warn, info, debug
        };

        this.connectionState = {
            isAuthenticated: false,
            lastConnectionTest: null,
            connectionHealth: 'unknown', // healthy, degraded, unhealthy, unknown
            consecutiveFailures: 0,
            lastError: null
        };

        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageResponseTime: 0,
            lastResponseTime: 0
        };

        this.log('info', 'D1 Connection Manager initialized', {
            environment: this.config.isGitHubActions ? 'GitHub Actions' : 'Local',
            database: this.config.databaseName,
            table: this.config.tableName
        });
    }

    /**
     * Initialize and validate connection
     */
    async initialize() {
        this.log('info', 'Initializing D1 connection...');
        
        try {
            // Validate environment
            await this.validateEnvironment();
            
            // Test authentication
            await this.validateAuthentication();
            
            // Test database connectivity
            await this.testConnection();
            
            this.connectionState.isAuthenticated = true;
            this.connectionState.connectionHealth = 'healthy';
            this.log('info', 'D1 connection initialized successfully');
            
            return true;
        } catch (error) {
            this.connectionState.lastError = error;
            this.connectionState.connectionHealth = 'unhealthy';
            this.log('error', 'Failed to initialize D1 connection', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate environment prerequisites
     */
    async validateEnvironment() {
        // Check Node.js version
        const nodeVersionResult = await execAsync('node --version');
        const nodeVersion = nodeVersionResult.stdout.trim();
        const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
        
        if (majorVersion < 20) {
            throw new Error(`Node.js v20+ required. Current: ${nodeVersion}. Run: nvm use 20`);
        }

        // Check wrangler availability
        try {
            await execAsync('npx wrangler --version', { timeout: 10000 });
        } catch (error) {
            throw new Error(`Wrangler not available: ${error.message}`);
        }

        this.log('debug', 'Environment validation passed', { nodeVersion });
    }

    /**
     * Validate authentication
     */
    async validateAuthentication() {
        if (!this.config.apiToken) {
            throw new Error('CLOUDFLARE_API_TOKEN is required. Set it as an environment variable.');
        }

        if (this.config.apiToken.length < 32) {
            throw new Error('CLOUDFLARE_API_TOKEN appears to be invalid (too short)');
        }

        // Test authentication with wrangler
        try {
            const authResult = await this.executeWithRetry(
                'npx wrangler whoami',
                { skipDatabaseName: true }
            );
            
            this.log('debug', 'Authentication validated', { account: authResult.stdout.trim() });
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    /**
     * Test basic database connectivity
     */
    async testConnection() {
        try {
            const result = await this.query('SELECT 1 as test');
            if (!result || !result[0] || result[0].test !== 1) {
                throw new Error('Invalid response from database');
            }
            
            this.connectionState.lastConnectionTest = new Date();
            this.log('debug', 'Database connectivity test passed');
        } catch (error) {
            throw new Error(`Database connectivity test failed: ${error.message}`);
        }
    }

    /**
     * Execute SQL query with automatic retry logic
     */
    async query(sql, options = {}) {
        const startTime = Date.now();
        this.metrics.totalQueries++;

        try {
            const result = await this.executeWithRetry(
                `npx wrangler d1 execute ${this.config.databaseName} --remote --command "${this.escapeSqlForShell(sql)}" --json`,
                options
            );

            const parsed = JSON.parse(result.stdout);
            const queryResult = parsed[0]?.results || [];

            // Update metrics
            const responseTime = Date.now() - startTime;
            this.metrics.successfulQueries++;
            this.metrics.lastResponseTime = responseTime;
            this.metrics.averageResponseTime = 
                (this.metrics.averageResponseTime * (this.metrics.successfulQueries - 1) + responseTime) / 
                this.metrics.successfulQueries;

            this.connectionState.consecutiveFailures = 0;
            this.connectionState.connectionHealth = 'healthy';

            this.log('debug', 'Query executed successfully', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                responseTime,
                resultCount: queryResult.length
            });

            return queryResult;

        } catch (error) {
            this.metrics.failedQueries++;
            this.connectionState.consecutiveFailures++;
            this.connectionState.lastError = error;

            // Update health status based on consecutive failures
            if (this.connectionState.consecutiveFailures >= 3) {
                this.connectionState.connectionHealth = 'unhealthy';
            } else if (this.connectionState.consecutiveFailures >= 1) {
                this.connectionState.connectionHealth = 'degraded';
            }

            this.log('error', 'Query execution failed', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                error: error.message,
                consecutiveFailures: this.connectionState.consecutiveFailures
            });

            throw error;
        }
    }

    /**
     * Execute command with retry logic and exponential backoff
     */
    async executeWithRetry(command, options = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const env = this.config.apiToken ? 
                    { ...process.env, CLOUDFLARE_API_TOKEN: this.config.apiToken } : 
                    process.env;

                const execOptions = {
                    env,
                    timeout: options.timeout || this.config.queryTimeout,
                    maxBuffer: this.config.maxBuffer
                };

                const result = await execAsync(command, execOptions);
                
                // If we get here, command succeeded
                if (attempt > 1) {
                    this.log('info', `Command succeeded on attempt ${attempt}`);
                }
                
                return result;

            } catch (error) {
                lastError = error;
                
                this.log('warn', `Command failed on attempt ${attempt}`, {
                    error: error.message,
                    stderr: error.stderr,
                    command: command.substring(0, 100) + '...'
                });

                // Don't retry on authentication errors
                if (this.isAuthenticationError(error)) {
                    this.log('error', 'Authentication error detected, not retrying');
                    break;
                }

                // Don't retry on syntax errors
                if (this.isSyntaxError(error)) {
                    this.log('error', 'SQL syntax error detected, not retrying');
                    break;
                }

                // If this wasn't the last attempt, wait before retrying
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
                    this.log('info', `Retrying in ${delay}ms... (attempt ${attempt + 1}/${this.config.maxRetries})`);
                    await this.sleep(delay);
                }
            }
        }

        // All retries exhausted
        throw new Error(`Command failed after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Batch execute multiple SQL statements
     */
    async batchQuery(sqlStatements, options = {}) {
        const batchSize = options.batchSize || this.config.batchSize;
        const results = [];
        
        this.log('info', `Executing batch of ${sqlStatements.length} statements in batches of ${batchSize}`);

        for (let i = 0; i < sqlStatements.length; i += batchSize) {
            const batch = sqlStatements.slice(i, i + batchSize);
            const batchResults = [];

            for (const sql of batch) {
                try {
                    const result = await this.query(sql, options);
                    batchResults.push({ success: true, result, sql });
                } catch (error) {
                    batchResults.push({ success: false, error: error.message, sql });
                    
                    if (options.stopOnError) {
                        throw error;
                    }
                }

                // Small delay between queries to avoid rate limiting
                if (options.delay !== false) {
                    await this.sleep(options.delay || 100);
                }
            }

            results.push(...batchResults);
            
            this.log('debug', `Completed batch ${Math.floor(i / batchSize) + 1}`, {
                processed: Math.min(i + batchSize, sqlStatements.length),
                total: sqlStatements.length
            });
        }

        return results;
    }

    /**
     * Get database health status
     */
    async getHealthStatus() {
        try {
            const startTime = Date.now();
            await this.query('SELECT 1 as health_check');
            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                responseTime,
                lastCheck: new Date(),
                metrics: this.metrics,
                connectionState: this.connectionState
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                lastCheck: new Date(),
                metrics: this.metrics,
                connectionState: this.connectionState
            };
        }
    }

    /**
     * Get table record count
     */
    async getRecordCount(tableName = null) {
        const table = tableName || this.config.tableName;
        const result = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
        return result[0]?.count || 0;
    }

    /**
     * Get table schema information
     */
    async getTableSchema(tableName = null) {
        const table = tableName || this.config.tableName;
        const result = await this.query(`PRAGMA table_info(${table})`);
        return result;
    }

    /**
     * Verify database and table exist
     */
    async verifyDatabase() {
        try {
            // Check if database exists
            const dbListResult = await this.executeWithRetry(
                'npx wrangler d1 list --json',
                { skipDatabaseName: true }
            );
            
            const databases = JSON.parse(dbListResult.stdout);
            const targetDb = databases.find(db => 
                db.uuid === this.config.databaseId || 
                db.name === this.config.databaseName
            );

            if (!targetDb) {
                throw new Error(`Database ${this.config.databaseName} not found`);
            }

            // Check if table exists
            const tables = await this.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${this.config.tableName}'`);
            
            if (tables.length === 0) {
                throw new Error(`Table ${this.config.tableName} not found`);
            }

            return {
                database: targetDb,
                tableExists: true,
                recordCount: await this.getRecordCount()
            };

        } catch (error) {
            throw new Error(`Database verification failed: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */
    escapeSqlForShell(sql) {
        return sql.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }

    isAuthenticationError(error) {
        const authErrors = [
            'authentication failed',
            'invalid token',
            'unauthorized',
            'forbidden',
            'not authenticated'
        ];
        
        const errorMessage = (error.message || '').toLowerCase();
        return authErrors.some(authError => errorMessage.includes(authError));
    }

    isSyntaxError(error) {
        const syntaxErrors = [
            'syntax error',
            'sql error',
            'near "',
            'no such table',
            'no such column'
        ];
        
        const errorMessage = (error.message || '').toLowerCase();
        return syntaxErrors.some(syntaxError => errorMessage.includes(syntaxError));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    log(level, message, data = {}) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const configLevel = levels[this.config.logLevel] || 2;
        
        if (levels[level] <= configLevel) {
            const timestamp = new Date().toISOString();
            const prefix = level.toUpperCase().padEnd(5);
            
            if (Object.keys(data).length > 0) {
                console.log(`[${timestamp}] ${prefix} ${message}`, data);
            } else {
                console.log(`[${timestamp}] ${prefix} ${message}`);
            }
        }
    }

    /**
     * Get comprehensive connection status
     */
    getStatus() {
        return {
            config: {
                database: this.config.databaseName,
                table: this.config.tableName,
                environment: this.config.isGitHubActions ? 'GitHub Actions' : 'Local',
                hasApiToken: !!this.config.apiToken
            },
            connectionState: this.connectionState,
            metrics: this.metrics
        };
    }

    /**
     * Reset connection state and metrics
     */
    reset() {
        this.connectionState = {
            isAuthenticated: false,
            lastConnectionTest: null,
            connectionHealth: 'unknown',
            consecutiveFailures: 0,
            lastError: null
        };

        this.metrics = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageResponseTime: 0,
            lastResponseTime: 0
        };

        this.log('info', 'Connection state and metrics reset');
    }
}

module.exports = D1ConnectionManager;