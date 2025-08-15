#!/usr/bin/env node

/**
 * Enhanced Error Recovery System
 * Enterprise-grade error handling and recovery mechanisms
 * 
 * Features:
 * - Comprehensive error classification and handling
 * - Exponential backoff with jitter
 * - Circuit breaker patterns
 * - Health monitoring and auto-recovery
 * - Error reporting and alerting
 * - Recovery strategy optimization
 * - Failure isolation and containment
 */

const fs = require('fs').promises;
const path = require('path');

class ErrorRecoverySystem {
    constructor(options = {}) {
        this.config = {
            // Retry configuration
            maxRetries: options.maxRetries || 5,
            baseDelay: options.baseDelay || 1000,
            maxDelay: options.maxDelay || 30000,
            backoffMultiplier: options.backoffMultiplier || 2,
            jitterPercent: options.jitterPercent || 0.1,
            
            // Circuit breaker configuration
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 60000, // 1 minute
            circuitBreakerResetTimeout: options.circuitBreakerResetTimeout || 300000, // 5 minutes
            
            // Health monitoring
            healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
            maxConsecutiveFailures: options.maxConsecutiveFailures || 10,
            
            // Error logging
            errorLogFile: options.errorLogFile || './error-recovery.log',
            maxLogFileSize: options.maxLogFileSize || 10 * 1024 * 1024, // 10MB
            
            // Recovery strategies
            enableAutoRecovery: options.enableAutoRecovery !== undefined ? options.enableAutoRecovery : true,
            enableFailureIsolation: options.enableFailureIsolation !== undefined ? options.enableFailureIsolation : true,
            
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
        };

        this.state = {
            // Global state
            totalErrors: 0,
            totalRecoveries: 0,
            consecutiveFailures: 0,
            lastErrorTime: null,
            systemHealth: 'healthy', // healthy, degraded, critical, recovering
            
            // Circuit breakers by operation type
            circuitBreakers: new Map(),
            
            // Error patterns and statistics
            errorPatterns: new Map(),
            errorHistory: [],
            
            // Recovery operations
            activeRecoveries: new Set(),
            recoveryAttempts: new Map(),
            
            // Health monitoring
            healthMetrics: {
                successRate: 100,
                averageResponseTime: 0,
                errorRate: 0,
                lastHealthCheck: null
            }
        };

        this.errorClassifiers = this.initializeErrorClassifiers();
        this.recoveryStrategies = this.initializeRecoveryStrategies();
        
        console.log('🛡️ Enhanced Error Recovery System initialized');
        
        // Start background health monitoring
        if (this.config.enableAutoRecovery) {
            this.startHealthMonitoring();
        }
    }

    /**
     * Initialize error classification system
     */
    initializeErrorClassifiers() {
        return {
            // Network errors
            network: {
                patterns: [
                    /network|connection|timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
                    /fetch|request|response|http/i
                ],
                severity: 'recoverable',
                strategy: 'exponential_backoff'
            },
            
            // Authentication errors
            authentication: {
                patterns: [
                    /auth|login|credential|token|unauthorized|forbidden|401|403/i
                ],
                severity: 'critical',
                strategy: 'authentication_recovery'
            },
            
            // Browser/automation errors
            automation: {
                patterns: [
                    /page|browser|element|selector|playwright|timeout|navigation/i,
                    /Target.*closed|Protocol error|Session.*closed/i
                ],
                severity: 'recoverable',
                strategy: 'browser_restart'
            },
            
            // Database errors
            database: {
                patterns: [
                    /database|sql|d1|wrangler|cloudflare|sqlite/i,
                    /SQLITE_|connection pool|query|transaction/i
                ],
                severity: 'recoverable',
                strategy: 'database_fallback'
            },
            
            // Rate limiting errors
            rate_limiting: {
                patterns: [
                    /rate.?limit|throttle|429|too.?many.?requests/i
                ],
                severity: 'recoverable',
                strategy: 'progressive_backoff'
            },
            
            // System resource errors
            resource: {
                patterns: [
                    /memory|disk|cpu|EMFILE|ENOMEM|ENOSPC/i
                ],
                severity: 'critical',
                strategy: 'resource_cleanup'
            },
            
            // Unknown/generic errors
            generic: {
                patterns: [/.*/],
                severity: 'unknown',
                strategy: 'generic_retry'
            }
        };
    }

    /**
     * Initialize recovery strategies
     */
    initializeRecoveryStrategies() {
        return {
            exponential_backoff: async (error, attempt, context) => {
                const delay = this.calculateBackoffDelay(attempt);
                console.log(`⏳ Exponential backoff: waiting ${delay}ms (attempt ${attempt})`);
                await this.sleep(delay);
                return { action: 'retry', delay };
            },

            authentication_recovery: async (error, attempt, context) => {
                console.log('🔐 Attempting authentication recovery...');
                
                if (context.authManager) {
                    const success = await context.authManager.refreshAuthentication();
                    if (success) {
                        return { action: 'retry', message: 'Authentication refreshed' };
                    }
                }
                
                if (attempt < 3) {
                    await this.sleep(5000);
                    return { action: 'retry', message: 'Retrying authentication' };
                }
                
                return { action: 'fail', message: 'Authentication recovery failed' };
            },

            browser_restart: async (error, attempt, context) => {
                console.log('🌐 Attempting browser restart...');
                
                try {
                    if (context.browser) {
                        await context.browser.close();
                    }
                    
                    if (context.initBrowser) {
                        await context.initBrowser();
                        return { action: 'retry', message: 'Browser restarted' };
                    }
                } catch (restartError) {
                    console.warn('⚠️ Browser restart failed:', restartError.message);
                }
                
                if (attempt < 3) {
                    await this.sleep(10000);
                    return { action: 'retry', message: 'Retrying after browser issues' };
                }
                
                return { action: 'fail', message: 'Browser recovery failed' };
            },

            database_fallback: async (error, attempt, context) => {
                console.log('💾 Attempting database fallback...');
                
                if (context.dataLayer) {
                    // Force fallback to next storage method
                    context.dataLayer.handleConnectionFailure('Database error', error);
                    return { action: 'retry', message: 'Switched to fallback storage' };
                }
                
                const delay = this.calculateBackoffDelay(attempt);
                await this.sleep(delay);
                return { action: 'retry', delay };
            },

            progressive_backoff: async (error, attempt, context) => {
                // Longer delays for rate limiting
                const baseDelay = 10000; // 10 seconds
                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 300000); // Max 5 minutes
                
                console.log(`🚦 Rate limit backoff: waiting ${delay/1000}s (attempt ${attempt})`);
                await this.sleep(delay);
                return { action: 'retry', delay };
            },

            resource_cleanup: async (error, attempt, context) => {
                console.log('🧹 Attempting resource cleanup...');
                
                try {
                    // Force garbage collection if available
                    if (global.gc) {
                        global.gc();
                    }
                    
                    // Close unnecessary resources
                    if (context.cleanup) {
                        await context.cleanup();
                    }
                    
                    await this.sleep(5000);
                    return { action: 'retry', message: 'Resources cleaned up' };
                    
                } catch (cleanupError) {
                    console.warn('⚠️ Resource cleanup failed:', cleanupError.message);
                    return { action: 'fail', message: 'Resource cleanup failed' };
                }
            },

            generic_retry: async (error, attempt, context) => {
                const delay = this.calculateBackoffDelay(attempt);
                console.log(`🔄 Generic retry: waiting ${delay}ms (attempt ${attempt})`);
                await this.sleep(delay);
                return { action: 'retry', delay };
            }
        };
    }

    /**
     * Main error handling entry point
     */
    async handleError(error, operation, context = {}) {
        this.state.totalErrors++;
        this.state.consecutiveFailures++;
        this.state.lastErrorTime = Date.now();
        
        const errorInfo = this.analyzeError(error, operation);
        
        console.error(`❌ Error in ${operation}:`, error.message);
        console.log(`🔍 Error classification: ${errorInfo.type} (${errorInfo.severity})`);
        
        // Log error for analysis
        await this.logError(error, operation, errorInfo);
        
        // Update error patterns
        this.updateErrorPatterns(errorInfo);
        
        // Check circuit breaker
        if (this.isCircuitBreakerOpen(operation)) {
            console.log(`🚫 Circuit breaker open for ${operation}, failing fast`);
            throw new Error(`Circuit breaker open for ${operation}`);
        }
        
        // Determine if recovery should be attempted
        if (!this.shouldAttemptRecovery(errorInfo, operation)) {
            this.updateCircuitBreaker(operation, false);
            throw error;
        }
        
        // Attempt recovery
        const recoveryResult = await this.attemptRecovery(error, operation, errorInfo, context);
        
        if (recoveryResult.success) {
            this.state.totalRecoveries++;
            this.state.consecutiveFailures = 0;
            this.updateCircuitBreaker(operation, true);
            this.updateSystemHealth();
            
            console.log(`✅ Recovery successful for ${operation}: ${recoveryResult.message}`);
            return recoveryResult;
        } else {
            this.updateCircuitBreaker(operation, false);
            this.updateSystemHealth();
            
            console.error(`💥 Recovery failed for ${operation}: ${recoveryResult.message}`);
            throw new Error(`Recovery failed: ${recoveryResult.message}`);
        }
    }

    /**
     * Analyze error to determine type and severity
     */
    analyzeError(error, operation) {
        const errorMessage = error.message || error.toString();
        const errorStack = error.stack || '';
        const combinedText = `${errorMessage} ${errorStack}`.toLowerCase();
        
        // Classify error type
        let errorType = 'generic';
        let severity = 'unknown';
        let strategy = 'generic_retry';
        
        for (const [type, classifier] of Object.entries(this.errorClassifiers)) {
            if (type === 'generic') continue; // Check generic last
            
            const matches = classifier.patterns.some(pattern => pattern.test(combinedText));
            if (matches) {
                errorType = type;
                severity = classifier.severity;
                strategy = classifier.strategy;
                break;
            }
        }
        
        // If no specific type found, use generic
        if (errorType === 'generic') {
            const genericClassifier = this.errorClassifiers.generic;
            severity = genericClassifier.severity;
            strategy = genericClassifier.strategy;
        }
        
        return {
            type: errorType,
            severity,
            strategy,
            message: errorMessage,
            stack: errorStack,
            operation,
            timestamp: Date.now()
        };
    }

    /**
     * Update error pattern statistics
     */
    updateErrorPatterns(errorInfo) {
        const key = `${errorInfo.operation}:${errorInfo.type}`;
        
        if (!this.state.errorPatterns.has(key)) {
            this.state.errorPatterns.set(key, {
                count: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                messages: new Set()
            });
        }
        
        const pattern = this.state.errorPatterns.get(key);
        pattern.count++;
        pattern.lastSeen = Date.now();
        pattern.messages.add(errorInfo.message);
        
        // Keep error history (limited size)
        this.state.errorHistory.push(errorInfo);
        if (this.state.errorHistory.length > 1000) {
            this.state.errorHistory = this.state.errorHistory.slice(-500);
        }
    }

    /**
     * Determine if recovery should be attempted
     */
    shouldAttemptRecovery(errorInfo, operation) {
        // Don't recover from critical errors without proper context
        if (errorInfo.severity === 'critical' && errorInfo.type === 'resource') {
            return false;
        }
        
        // Check if we've exceeded consecutive failure threshold
        if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            console.log(`🚫 Too many consecutive failures (${this.state.consecutiveFailures})`);
            return false;
        }
        
        // Check error frequency for this operation
        const key = `${operation}:${errorInfo.type}`;
        const pattern = this.state.errorPatterns.get(key);
        
        if (pattern && pattern.count > 10) {
            const timeSpan = pattern.lastSeen - pattern.firstSeen;
            const frequency = pattern.count / (timeSpan / 60000); // errors per minute
            
            if (frequency > 5) { // More than 5 errors per minute
                console.log(`🚫 High error frequency for ${key}: ${frequency.toFixed(2)}/min`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Attempt error recovery
     */
    async attemptRecovery(error, operation, errorInfo, context) {
        const recoveryKey = `${operation}:${errorInfo.type}`;
        
        if (this.state.activeRecoveries.has(recoveryKey)) {
            return {
                success: false,
                message: 'Recovery already in progress'
            };
        }
        
        this.state.activeRecoveries.add(recoveryKey);
        
        try {
            const attempts = this.state.recoveryAttempts.get(recoveryKey) || 0;
            this.state.recoveryAttempts.set(recoveryKey, attempts + 1);
            
            if (attempts >= this.config.maxRetries) {
                return {
                    success: false,
                    message: `Max recovery attempts reached (${attempts})`
                };
            }
            
            const strategy = this.recoveryStrategies[errorInfo.strategy];
            if (!strategy) {
                return {
                    success: false,
                    message: `Unknown recovery strategy: ${errorInfo.strategy}`
                };
            }
            
            const strategyResult = await strategy(error, attempts + 1, context);
            
            if (strategyResult.action === 'retry') {
                return {
                    success: true,
                    message: strategyResult.message || 'Recovery strategy completed',
                    delay: strategyResult.delay
                };
            } else {
                return {
                    success: false,
                    message: strategyResult.message || 'Recovery strategy failed'
                };
            }
            
        } finally {
            this.state.activeRecoveries.delete(recoveryKey);
        }
    }

    /**
     * Circuit breaker management
     */
    isCircuitBreakerOpen(operation) {
        const breaker = this.state.circuitBreakers.get(operation);
        if (!breaker) return false;
        
        if (breaker.state === 'open') {
            // Check if timeout has passed
            if (Date.now() - breaker.openedAt > this.config.circuitBreakerTimeout) {
                breaker.state = 'half-open';
                console.log(`🔄 Circuit breaker for ${operation} moved to half-open`);
            }
            return breaker.state === 'open';
        }
        
        return false;
    }

    updateCircuitBreaker(operation, success) {
        if (!this.state.circuitBreakers.has(operation)) {
            this.state.circuitBreakers.set(operation, {
                failures: 0,
                successes: 0,
                state: 'closed',
                openedAt: null,
                lastFailure: null
            });
        }
        
        const breaker = this.state.circuitBreakers.get(operation);
        
        if (success) {
            breaker.successes++;
            breaker.failures = 0; // Reset failure count on success
            
            if (breaker.state === 'half-open') {
                breaker.state = 'closed';
                console.log(`✅ Circuit breaker for ${operation} closed`);
            }
        } else {
            breaker.failures++;
            breaker.lastFailure = Date.now();
            
            if (breaker.failures >= this.config.circuitBreakerThreshold) {
                breaker.state = 'open';
                breaker.openedAt = Date.now();
                console.log(`🚫 Circuit breaker for ${operation} opened`);
            }
        }
    }

    /**
     * Calculate exponential backoff delay with jitter
     */
    calculateBackoffDelay(attempt) {
        const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
        
        // Add jitter to prevent thundering herd
        const jitter = cappedDelay * this.config.jitterPercent * (Math.random() - 0.5);
        
        return Math.max(cappedDelay + jitter, this.config.baseDelay);
    }

    /**
     * Update system health status
     */
    updateSystemHealth() {
        const recentErrors = this.state.errorHistory.filter(
            error => Date.now() - error.timestamp < 300000 // Last 5 minutes
        );
        
        const errorRate = recentErrors.length / 5; // Errors per minute
        
        if (this.state.consecutiveFailures >= 5 || errorRate > 10) {
            this.state.systemHealth = 'critical';
        } else if (this.state.consecutiveFailures >= 3 || errorRate > 5) {
            this.state.systemHealth = 'degraded';
        } else if (this.state.consecutiveFailures > 0) {
            this.state.systemHealth = 'recovering';
        } else {
            this.state.systemHealth = 'healthy';
        }
        
        this.state.healthMetrics.errorRate = errorRate;
        this.state.healthMetrics.lastHealthCheck = Date.now();
    }

    /**
     * Start background health monitoring
     */
    startHealthMonitoring() {
        setInterval(() => {
            this.updateSystemHealth();
            this.cleanupOldData();
            
            if (this.state.systemHealth !== 'healthy') {
                console.log(`🏥 System health: ${this.state.systemHealth}`);
                console.log(`   • Consecutive failures: ${this.state.consecutiveFailures}`);
                console.log(`   • Error rate: ${this.state.healthMetrics.errorRate.toFixed(2)}/min`);
                console.log(`   • Active recoveries: ${this.state.activeRecoveries.size}`);
            }
        }, this.config.healthCheckInterval);
    }

    /**
     * Clean up old data to prevent memory leaks
     */
    cleanupOldData() {
        const cutoffTime = Date.now() - 3600000; // 1 hour ago
        
        // Clean old error history
        this.state.errorHistory = this.state.errorHistory.filter(
            error => error.timestamp > cutoffTime
        );
        
        // Reset old recovery attempts
        for (const [key, attempts] of this.state.recoveryAttempts.entries()) {
            const pattern = this.state.errorPatterns.get(key);
            if (!pattern || pattern.lastSeen < cutoffTime) {
                this.state.recoveryAttempts.delete(key);
            }
        }
    }

    /**
     * Log error for analysis
     */
    async logError(error, operation, errorInfo) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                operation,
                errorType: errorInfo.type,
                severity: errorInfo.severity,
                message: error.message,
                stack: error.stack,
                systemHealth: this.state.systemHealth,
                consecutiveFailures: this.state.consecutiveFailures
            };
            
            const logLine = JSON.stringify(logEntry) + '\n';
            
            // Check log file size
            try {
                const stats = await fs.stat(this.config.errorLogFile);
                if (stats.size > this.config.maxLogFileSize) {
                    // Rotate log file
                    const backupFile = this.config.errorLogFile + '.old';
                    await fs.rename(this.config.errorLogFile, backupFile);
                }
            } catch (e) {
                // Log file doesn't exist yet, which is fine
            }
            
            await fs.appendFile(this.config.errorLogFile, logLine);
            
        } catch (logError) {
            console.warn('⚠️ Failed to log error:', logError.message);
        }
    }

    /**
     * Get comprehensive system status
     */
    getStatus() {
        const circuitBreakerStatus = {};
        for (const [operation, breaker] of this.state.circuitBreakers.entries()) {
            circuitBreakerStatus[operation] = {
                state: breaker.state,
                failures: breaker.failures,
                successes: breaker.successes
            };
        }
        
        const topErrorPatterns = Array.from(this.state.errorPatterns.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([key, pattern]) => ({
                operation: key,
                count: pattern.count,
                frequency: pattern.count / ((pattern.lastSeen - pattern.firstSeen) / 60000 || 1)
            }));
        
        return {
            systemHealth: this.state.systemHealth,
            totalErrors: this.state.totalErrors,
            totalRecoveries: this.state.totalRecoveries,
            consecutiveFailures: this.state.consecutiveFailures,
            recoveryRate: this.state.totalErrors > 0 ? 
                (this.state.totalRecoveries / this.state.totalErrors * 100).toFixed(2) + '%' : '0%',
            circuitBreakers: circuitBreakerStatus,
            activeRecoveries: Array.from(this.state.activeRecoveries),
            topErrorPatterns,
            healthMetrics: this.state.healthMetrics
        };
    }

    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup recovery system
     */
    async cleanup() {
        console.log('🧹 Error recovery system cleanup...');
        
        // Log final status
        const status = this.getStatus();
        console.log('📊 Final Error Recovery Status:', JSON.stringify(status, null, 2));
        
        // Clear active recoveries
        this.state.activeRecoveries.clear();
        
        console.log('✅ Error recovery system cleanup complete');
    }
}

module.exports = ErrorRecoverySystem;