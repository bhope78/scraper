#!/usr/bin/env node

/**
 * Webhook Notifier for GitHub Actions Integration
 * Sends structured notifications to various webhook endpoints
 */

const https = require('https');
const http = require('http');

class WebhookNotifier {
    constructor() {
        this.defaultTimeout = 10000;
        this.maxRetries = 3;
        this.retryDelay = 2000;
    }

    /**
     * Send notification to Discord webhook
     */
    async sendDiscordNotification(webhookUrl, data) {
        const embed = {
            title: data.title || 'Scraper Notification',
            description: data.message,
            color: this.getColorForStatus(data.status),
            timestamp: new Date().toISOString(),
            fields: [
                { name: 'Status', value: data.status, inline: true },
                { name: 'Run ID', value: data.runId || 'Unknown', inline: true },
                { name: 'Repository', value: data.repository || 'Unknown', inline: true }
            ],
            footer: {
                text: 'CalCareers Scraper Monitoring'
            }
        };

        if (data.details) {
            embed.fields.push({ name: 'Details', value: data.details, inline: false });
        }

        const payload = {
            embeds: [embed]
        };

        return this.sendWebhook(webhookUrl, payload);
    }

    /**
     * Send notification to Slack webhook
     */
    async sendSlackNotification(webhookUrl, data) {
        const color = this.getSlackColorForStatus(data.status);
        
        const payload = {
            text: data.title || 'Scraper Notification',
            attachments: [
                {
                    color: color,
                    fields: [
                        {
                            title: 'Status',
                            value: data.status,
                            short: true
                        },
                        {
                            title: 'Run ID',
                            value: data.runId || 'Unknown',
                            short: true
                        },
                        {
                            title: 'Message',
                            value: data.message,
                            short: false
                        }
                    ],
                    footer: 'CalCareers Scraper',
                    ts: Math.floor(Date.now() / 1000)
                }
            ]
        };

        if (data.details) {
            payload.attachments[0].fields.push({
                title: 'Details',
                value: data.details,
                short: false
            });
        }

        return this.sendWebhook(webhookUrl, payload);
    }

    /**
     * Send generic webhook notification
     */
    async sendGenericNotification(webhookUrl, data) {
        const payload = {
            timestamp: new Date().toISOString(),
            service: 'calcareers-scraper',
            event: data.event || 'notification',
            status: data.status,
            message: data.message,
            runId: data.runId,
            repository: data.repository,
            details: data.details,
            metadata: {
                workflow: data.workflow,
                trigger: data.trigger,
                branch: data.branch,
                commit: data.commit
            }
        };

        return this.sendWebhook(webhookUrl, payload);
    }

    /**
     * Send webhook with retry logic
     */
    async sendWebhook(url, payload) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`📡 Sending webhook (attempt ${attempt}/${this.maxRetries})...`);
                
                const result = await this.makeHttpRequest(url, payload);
                console.log('✅ Webhook sent successfully');
                return result;

            } catch (error) {
                console.warn(`⚠️  Webhook attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === this.maxRetries) {
                    throw new Error(`Webhook failed after ${this.maxRetries} attempts: ${error.message}`);
                }

                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
            }
        }
    }

    /**
     * Make HTTP request with promise wrapper
     */
    makeHttpRequest(url, payload) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            const postData = JSON.stringify(payload);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'CalCareers-Scraper-Webhook/1.0'
                },
                timeout: this.defaultTimeout
            };

            const req = protocol.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            statusCode: res.statusCode,
                            response: data
                        });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Get Discord color for status
     */
    getColorForStatus(status) {
        const colors = {
            'success': 0x00ff00,    // Green
            'healthy': 0x00ff00,    // Green
            'failure': 0xff0000,    // Red
            'error': 0xff0000,      // Red
            'unhealthy': 0xff0000,  // Red
            'warning': 0xffaa00,    // Orange
            'unknown': 0x888888     // Gray
        };

        return colors[status.toLowerCase()] || colors.unknown;
    }

    /**
     * Get Slack color for status
     */
    getSlackColorForStatus(status) {
        const colors = {
            'success': 'good',
            'healthy': 'good',
            'failure': 'danger',
            'error': 'danger',
            'unhealthy': 'danger',
            'warning': 'warning',
            'unknown': '#888888'
        };

        return colors[status.toLowerCase()] || colors.unknown;
    }

    /**
     * Send notification to multiple endpoints
     */
    async sendToMultipleEndpoints(endpoints, data) {
        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                let result;
                
                switch (endpoint.type) {
                    case 'discord':
                        result = await this.sendDiscordNotification(endpoint.url, data);
                        break;
                    case 'slack':
                        result = await this.sendSlackNotification(endpoint.url, data);
                        break;
                    case 'generic':
                    default:
                        result = await this.sendGenericNotification(endpoint.url, data);
                        break;
                }
                
                results.push({
                    endpoint: endpoint.name || endpoint.url,
                    status: 'success',
                    result: result
                });
                
            } catch (error) {
                console.error(`❌ Failed to send to ${endpoint.name || endpoint.url}: ${error.message}`);
                results.push({
                    endpoint: endpoint.name || endpoint.url,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Create notification data from GitHub Actions environment
     */
    static createFromGitHubActions(status, message, details = null) {
        return {
            status: status,
            message: message,
            details: details,
            runId: process.env.GITHUB_RUN_ID,
            repository: process.env.GITHUB_REPOSITORY,
            workflow: process.env.GITHUB_WORKFLOW,
            trigger: process.env.GITHUB_EVENT_NAME,
            branch: process.env.GITHUB_REF_NAME,
            commit: process.env.GITHUB_SHA?.substring(0, 7),
            title: `${process.env.GITHUB_WORKFLOW || 'Scraper'} - ${status.toUpperCase()}`
        };
    }
}

// CLI usage
if (require.main === module) {
    const notifier = new WebhookNotifier();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const webhookUrl = args[0];
    const type = args[1] || 'generic';
    const status = args[2] || 'unknown';
    const message = args[3] || 'Test notification';
    
    if (!webhookUrl) {
        console.error('Usage: node webhook-notifier.js <webhook-url> [type] [status] [message]');
        console.error('Types: discord, slack, generic');
        process.exit(1);
    }
    
    // Create test notification data
    const data = WebhookNotifier.createFromGitHubActions(status, message);
    
    // Send notification based on type
    const sendNotification = async () => {
        try {
            let result;
            
            switch (type) {
                case 'discord':
                    result = await notifier.sendDiscordNotification(webhookUrl, data);
                    break;
                case 'slack':
                    result = await notifier.sendSlackNotification(webhookUrl, data);
                    break;
                default:
                    result = await notifier.sendGenericNotification(webhookUrl, data);
                    break;
            }
            
            console.log('✅ Notification sent successfully');
            console.log('Response:', result);
            
        } catch (error) {
            console.error(`❌ Failed to send notification: ${error.message}`);
            process.exit(1);
        }
    };
    
    sendNotification();
}

module.exports = WebhookNotifier;