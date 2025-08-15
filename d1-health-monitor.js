#!/usr/bin/env node

/**
 * D1 Health Check and Monitoring System
 * Database Expert - Comprehensive monitoring and alerting for D1 databases
 */

const D1ConnectionManager = require('./d1-connection-manager');
const fs = require('fs').promises;
const path = require('path');

class D1HealthMonitor {
    constructor(options = {}) {
        this.connectionManager = new D1ConnectionManager(options);
        
        this.config = {
            // Health check intervals (in milliseconds)
            quickCheckInterval: options.quickCheckInterval || 30000, // 30 seconds
            fullCheckInterval: options.fullCheckInterval || 300000, // 5 minutes
            
            // Thresholds
            maxResponseTime: options.maxResponseTime || 5000, // 5 seconds
            maxFailureRate: options.maxFailureRate || 0.1, // 10%
            minSuccessRate: options.minSuccessRate || 0.95, // 95%
            
            // Alerting
            enableAlerts: options.enableAlerts || false,
            alertWebhook: options.alertWebhook || null,
            
            // Logging
            logToFile: options.logToFile || true,
            logDirectory: options.logDirectory || './logs',
            retentionDays: options.retentionDays || 7,
            
            // Performance tracking
            trackPerformance: options.trackPerformance || true,
            performanceWindow: options.performanceWindow || 3600000 // 1 hour
        };

        this.healthHistory = [];
        this.performanceMetrics = [];
        this.alerts = [];
        this.isMonitoring = false;
        this.intervals = {};

        this.log('info', 'D1 Health Monitor initialized');
    }

    /**
     * Start monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            this.log('warn', 'Monitoring already started');
            return;
        }

        try {
            // Initialize connection
            await this.connectionManager.initialize();
            
            // Setup log directory
            if (this.config.logToFile) {
                await this.setupLogDirectory();
            }

            // Start health checks
            this.intervals.quickCheck = setInterval(
                () => this.performQuickHealthCheck(),
                this.config.quickCheckInterval
            );

            this.intervals.fullCheck = setInterval(
                () => this.performFullHealthCheck(),
                this.config.fullCheckInterval
            );

            // Cleanup old logs
            if (this.config.logToFile) {
                this.intervals.cleanup = setInterval(
                    () => this.cleanupOldLogs(),
                    24 * 60 * 60 * 1000 // Daily
                );
            }

            this.isMonitoring = true;
            this.log('info', 'Health monitoring started');

            // Perform initial health check
            await this.performFullHealthCheck();

        } catch (error) {
            this.log('error', 'Failed to start monitoring', { error: error.message });
            throw error;
        }
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            this.log('warn', 'Monitoring not started');
            return;
        }

        // Clear all intervals
        Object.values(this.intervals).forEach(interval => clearInterval(interval));
        this.intervals = {};

        this.isMonitoring = false;
        this.log('info', 'Health monitoring stopped');
    }

    /**
     * Perform quick health check (lightweight)
     */
    async performQuickHealthCheck() {
        try {
            const startTime = Date.now();
            
            // Simple connectivity test
            await this.connectionManager.query('SELECT 1 as ping');
            
            const responseTime = Date.now() - startTime;
            const healthStatus = {
                timestamp: new Date(),
                type: 'quick',
                status: 'healthy',
                responseTime,
                details: {
                    ping: true
                }
            };

            await this.recordHealthStatus(healthStatus);
            
            // Check for performance issues
            if (responseTime > this.config.maxResponseTime) {
                await this.raiseAlert('performance', `Slow response time: ${responseTime}ms`, {
                    responseTime,
                    threshold: this.config.maxResponseTime
                });
            }

        } catch (error) {
            const healthStatus = {
                timestamp: new Date(),
                type: 'quick',
                status: 'unhealthy',
                error: error.message,
                details: {
                    ping: false
                }
            };

            await this.recordHealthStatus(healthStatus);
            await this.raiseAlert('connectivity', 'Quick health check failed', {
                error: error.message
            });
        }
    }

    /**
     * Perform comprehensive health check
     */
    async performFullHealthCheck() {
        try {
            const startTime = Date.now();
            const healthData = {
                timestamp: new Date(),
                type: 'full',
                status: 'healthy',
                checks: {},
                metrics: {},
                details: {}
            };

            // 1. Connection test
            try {
                await this.connectionManager.query('SELECT 1 as test');
                healthData.checks.connectivity = true;
            } catch (error) {
                healthData.checks.connectivity = false;
                healthData.details.connectivityError = error.message;
                healthData.status = 'unhealthy';
            }

            // 2. Database verification
            try {
                const dbInfo = await this.connectionManager.verifyDatabase();
                healthData.checks.database = true;
                healthData.details.database = dbInfo;
            } catch (error) {
                healthData.checks.database = false;
                healthData.details.databaseError = error.message;
                healthData.status = 'degraded';
            }

            // 3. Table schema check
            try {
                const schema = await this.connectionManager.getTableSchema();
                healthData.checks.schema = true;
                healthData.details.columnCount = schema.length;
            } catch (error) {
                healthData.checks.schema = false;
                healthData.details.schemaError = error.message;
                healthData.status = 'degraded';
            }

            // 4. Record count check
            try {
                const recordCount = await this.connectionManager.getRecordCount();
                healthData.checks.records = true;
                healthData.details.recordCount = recordCount;
            } catch (error) {
                healthData.checks.records = false;
                healthData.details.recordsError = error.message;
            }

            // 5. Performance metrics
            const connectionStatus = this.connectionManager.getStatus();
            healthData.metrics = {
                totalQueries: connectionStatus.metrics.totalQueries,
                successfulQueries: connectionStatus.metrics.successfulQueries,
                failedQueries: connectionStatus.metrics.failedQueries,
                averageResponseTime: connectionStatus.metrics.averageResponseTime,
                successRate: connectionStatus.metrics.totalQueries > 0 ? 
                    connectionStatus.metrics.successfulQueries / connectionStatus.metrics.totalQueries : 1,
                consecutiveFailures: connectionStatus.connectionState.consecutiveFailures
            };

            // 6. Response time for full check
            healthData.responseTime = Date.now() - startTime;

            await this.recordHealthStatus(healthData);

            // Check for issues and raise alerts
            await this.evaluateHealthStatus(healthData);

            this.log('info', 'Full health check completed', {
                status: healthData.status,
                responseTime: healthData.responseTime,
                recordCount: healthData.details.recordCount
            });

        } catch (error) {
            const healthStatus = {
                timestamp: new Date(),
                type: 'full',
                status: 'unhealthy',
                error: error.message,
                checks: {},
                details: {}
            };

            await this.recordHealthStatus(healthStatus);
            await this.raiseAlert('system', 'Full health check failed', {
                error: error.message
            });
        }
    }

    /**
     * Evaluate health status and raise alerts if needed
     */
    async evaluateHealthStatus(healthData) {
        const { metrics, checks, details } = healthData;

        // Check success rate
        if (metrics.successRate < this.config.minSuccessRate && metrics.totalQueries > 10) {
            await this.raiseAlert('reliability', 
                `Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`, {
                successRate: metrics.successRate,
                threshold: this.config.minSuccessRate,
                totalQueries: metrics.totalQueries
            });
        }

        // Check consecutive failures
        if (metrics.consecutiveFailures >= 3) {
            await this.raiseAlert('reliability', 
                `High consecutive failures: ${metrics.consecutiveFailures}`, {
                consecutiveFailures: metrics.consecutiveFailures
            });
        }

        // Check database availability
        if (!checks.database) {
            await this.raiseAlert('database', 'Database not accessible', {
                error: details.databaseError
            });
        }

        // Check schema integrity
        if (!checks.schema) {
            await this.raiseAlert('schema', 'Schema validation failed', {
                error: details.schemaError
            });
        }

        // Check for data anomalies (optional)
        if (details.recordCount !== undefined) {
            await this.checkDataAnomalies(details.recordCount);
        }
    }

    /**
     * Check for data anomalies
     */
    async checkDataAnomalies(currentCount) {
        // Get recent record counts for comparison
        const recentChecks = this.healthHistory
            .filter(h => h.type === 'full' && h.details.recordCount !== undefined)
            .slice(-10); // Last 10 full checks

        if (recentChecks.length >= 5) {
            const previousCounts = recentChecks.map(h => h.details.recordCount);
            const avgCount = previousCounts.reduce((a, b) => a + b, 0) / previousCounts.length;
            
            // Check for significant drops (>50% decrease)
            if (currentCount < avgCount * 0.5) {
                await this.raiseAlert('data', 'Significant data loss detected', {
                    currentCount,
                    averageCount: Math.round(avgCount),
                    dropPercentage: Math.round((1 - currentCount / avgCount) * 100)
                });
            }
            
            // Check for no new data (same count for extended period)
            const lastFiveCounts = previousCounts.slice(-5);
            if (lastFiveCounts.every(count => count === currentCount) && currentCount > 0) {
                await this.raiseAlert('data', 'No new data detected', {
                    staleCount: currentCount,
                    duration: '5+ health checks'
                });
            }
        }
    }

    /**
     * Record health status
     */
    async recordHealthStatus(healthStatus) {
        this.healthHistory.push(healthStatus);

        // Keep only recent history (last 1000 entries)
        if (this.healthHistory.length > 1000) {
            this.healthHistory = this.healthHistory.slice(-1000);
        }

        // Log to file if enabled
        if (this.config.logToFile) {
            await this.logToFile('health', healthStatus);
        }

        // Track performance metrics
        if (this.config.trackPerformance && healthStatus.responseTime) {
            this.performanceMetrics.push({
                timestamp: healthStatus.timestamp,
                responseTime: healthStatus.responseTime,
                type: healthStatus.type
            });

            // Cleanup old performance data
            const cutoff = Date.now() - this.config.performanceWindow;
            this.performanceMetrics = this.performanceMetrics.filter(
                m => m.timestamp.getTime() > cutoff
            );
        }
    }

    /**
     * Raise alert
     */
    async raiseAlert(category, message, details = {}) {
        const alert = {
            id: this.generateAlertId(),
            timestamp: new Date(),
            category,
            message,
            details,
            severity: this.getAlertSeverity(category)
        };

        this.alerts.push(alert);

        // Keep only recent alerts (last 100)
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        // Log alert
        this.log('warn', `ALERT [${category.toUpperCase()}]: ${message}`, details);

        // Log to file
        if (this.config.logToFile) {
            await this.logToFile('alerts', alert);
        }

        // Send to webhook if configured
        if (this.config.enableAlerts && this.config.alertWebhook) {
            await this.sendWebhookAlert(alert);
        }
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const recent = this.healthHistory.slice(-50); // Last 50 checks
        const recentAlerts = this.alerts.slice(-10); // Last 10 alerts

        const summary = {
            overall: 'unknown',
            lastCheck: null,
            stats: {
                totalChecks: this.healthHistory.length,
                healthyChecks: 0,
                degradedChecks: 0,
                unhealthyChecks: 0
            },
            performance: {
                averageResponseTime: 0,
                last24Hours: []
            },
            alerts: {
                total: this.alerts.length,
                recent: recentAlerts,
                categories: {}
            },
            details: {}
        };

        if (recent.length > 0) {
            summary.lastCheck = recent[recent.length - 1];
            summary.overall = summary.lastCheck.status;

            // Calculate stats
            recent.forEach(check => {
                if (check.status === 'healthy') summary.stats.healthyChecks++;
                else if (check.status === 'degraded') summary.stats.degradedChecks++;
                else summary.stats.unhealthyChecks++;
            });

            // Performance metrics
            const withResponseTime = recent.filter(r => r.responseTime);
            if (withResponseTime.length > 0) {
                summary.performance.averageResponseTime = 
                    withResponseTime.reduce((sum, r) => sum + r.responseTime, 0) / 
                    withResponseTime.length;
            }

            // Recent record count
            const lastFull = recent.filter(r => r.type === 'full').pop();
            if (lastFull && lastFull.details.recordCount !== undefined) {
                summary.details.recordCount = lastFull.details.recordCount;
            }
        }

        // Alert categories
        this.alerts.forEach(alert => {
            summary.alerts.categories[alert.category] = 
                (summary.alerts.categories[alert.category] || 0) + 1;
        });

        return summary;
    }

    /**
     * Generate comprehensive health report
     */
    async generateHealthReport() {
        const summary = this.getHealthSummary();
        const connectionStatus = this.connectionManager.getStatus();
        
        const report = {
            timestamp: new Date(),
            summary,
            connectionManager: connectionStatus,
            systemInfo: {
                nodeVersion: process.version,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            },
            configuration: {
                database: this.connectionManager.config.databaseName,
                table: this.connectionManager.config.tableName,
                environment: this.connectionManager.config.isGitHubActions ? 'GitHub Actions' : 'Local',
                monitoring: {
                    quickCheckInterval: this.config.quickCheckInterval,
                    fullCheckInterval: this.config.fullCheckInterval,
                    isActive: this.isMonitoring
                }
            }
        };

        return report;
    }

    /**
     * Helper methods
     */
    async setupLogDirectory() {
        try {
            await fs.mkdir(this.config.logDirectory, { recursive: true });
        } catch (error) {
            this.log('error', 'Failed to create log directory', { error: error.message });
        }
    }

    async logToFile(type, data) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filename = path.join(this.config.logDirectory, `${type}-${date}.json`);
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                data
            };

            await fs.appendFile(filename, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            this.log('error', 'Failed to write to log file', { error: error.message });
        }
    }

    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.config.logDirectory);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

            for (const file of files) {
                const filePath = path.join(this.config.logDirectory, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime < cutoffDate) {
                    await fs.unlink(filePath);
                    this.log('debug', `Deleted old log file: ${file}`);
                }
            }
        } catch (error) {
            this.log('error', 'Failed to cleanup old logs', { error: error.message });
        }
    }

    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getAlertSeverity(category) {
        const severityMap = {
            connectivity: 'critical',
            database: 'critical',
            system: 'critical',
            schema: 'high',
            reliability: 'high',
            performance: 'medium',
            data: 'medium'
        };
        return severityMap[category] || 'low';
    }

    async sendWebhookAlert(alert) {
        // Placeholder for webhook integration
        // Implementation would depend on your alerting system (Slack, Discord, etc.)
        this.log('info', 'Webhook alert would be sent', { alert });
    }

    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [MONITOR] ${level.toUpperCase()}`;
        
        if (Object.keys(data).length > 0) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }
}

module.exports = D1HealthMonitor;