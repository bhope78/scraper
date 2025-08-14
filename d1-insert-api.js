#!/usr/bin/env node

/**
 * D1 Insert Helper using Cloudflare REST API
 * Handles inserting jobs into D1 database without wrangler
 */

const https = require('https');

class D1Insert {
    constructor(apiToken, dbName = 'Calhr', tableName = 'ccJobs') {
        this.apiToken = apiToken;
        this.dbName = dbName;
        this.tableName = tableName;
        this.accountId = 'aa3156a55993be3bb2b637b7619ddc23';
        this.databaseId = 'fcde85de-7c22-46a5-8eaf-f68a7aa0c1b9';
    }

    /**
     * Escape single quotes for SQL
     */
    escapeSQL(str) {
        if (str === null || str === undefined) return 'NULL';
        return `'${String(str).replace(/'/g, "''")}'`;
    }

    /**
     * Format date for SQL
     */
    formatDate(date) {
        // If no date provided or it's explicitly "Not specified", keep that text
        if (!date) {
            return `'Not specified'`;
        }
        
        // Keep the original text value, whatever it is
        if (typeof date === 'string') {
            // Check if it's already in YYYY-MM-DD format
            if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return `'${date}'`;
            }
            // Check if it looks like a date that needs parsing (MM/DD/YYYY or similar)
            if (date.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
                try {
                    const parsedDate = new Date(date);
                    if (!isNaN(parsedDate.getTime())) {
                        return `'${parsedDate.toISOString().split('T')[0]}'`;
                    }
                } catch (e) {
                    // If parsing fails, keep the original text
                }
            }
            // For ANY text (Until Filled, Continuous, Not specified, etc.), keep it exactly as is
            return `'${date.replace(/'/g, "''")}'`;  // Escape single quotes for SQL
        }
        
        // If it's not a string, try to convert it
        return `'${String(date).replace(/'/g, "''")}'`;
    }

    /**
     * Sleep helper for rate limiting
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute SQL query using Cloudflare API with retry logic
     */
    async executeSQL(sql, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Add delay between attempts to avoid rate limiting
                if (attempt > 1) {
                    await this.sleep(1000 * attempt); // Exponential backoff: 1s, 2s, 3s
                }
                
                const result = await this._executeSQLInternal(sql);
                return result;
            } catch (error) {
                if (error.message.includes('Invalid non-JSON request') || 
                    error.message.includes('400 Bad Request') ||
                    error.message.includes('Failed to parse response')) {
                    
                    if (attempt === retries) {
                        throw error; // Final attempt failed
                    }
                    console.log(`⏳ Rate limited, retrying in ${attempt}s... (attempt ${attempt}/${retries})`);
                } else {
                    throw error; // Non-retryable error
                }
            }
        }
    }

    /**
     * Internal SQL execution
     */
    async _executeSQLInternal(sql) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ sql });
            
            const options = {
                hostname: 'api.cloudflare.com',
                port: 443,
                path: `/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (parsed.success) {
                            resolve(parsed.result);
                        } else {
                            reject(new Error(parsed.errors?.[0]?.message || 'Query failed'));
                        }
                    } catch (e) {
                        // Check if it's an HTML error response (rate limiting)
                        if (responseData.includes('<html>') && responseData.includes('400 Bad Request')) {
                            reject(new Error('Invalid non-JSON request - rate limited'));
                        } else {
                            reject(new Error(`Failed to parse response: ${responseData}`));
                        }
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Check if job exists in D1
     */
    async jobExists(jobControl) {
        try {
            // Add small delay before checking to avoid rate limits
            await this.sleep(100);
            const sql = `SELECT id FROM ${this.tableName} WHERE job_control = '${jobControl}' LIMIT 1`;
            const result = await this.executeSQL(sql);
            return result && result[0] && result[0].results && result[0].results.length > 0;
        } catch (error) {
            console.error(`❌ Error checking job ${jobControl}:`, error.message);
            return false;
        }
    }

    /**
     * Insert a single job
     */
    async insertJob(job) {
        try {
            // Delay to avoid rate limiting (200ms between insertions)
            await this.sleep(200);
            
            // Check if job already exists
            if (await this.jobExists(job.job_control)) {
                console.log(`⏭️  Job ${job.job_control} already exists, skipping`);
                return { success: false, reason: 'duplicate' };
            }

            const sql = `INSERT INTO ${this.tableName} (
                working_title, department, job_control, location, salary_range,
                telework, worktype_schedule, publish_date, filing_date,
                link_title, job_description_duties, position_num,
                special_requirements, application_instructions, desirable_qual,
                soq, contact_info, additional_instructions, equal_opportunity,
                duty_statement
            ) VALUES (
                ${this.escapeSQL(job.working_title)},
                ${this.escapeSQL(job.department)},
                ${this.escapeSQL(job.job_control)},
                ${this.escapeSQL(job.location)},
                ${this.escapeSQL(job.salary_range)},
                ${this.escapeSQL(job.telework)},
                ${this.escapeSQL(job.worktype_schedule || job.work_type_schedule)},
                ${this.formatDate(job.publish_date)},
                ${this.formatDate(job.filing_date)},
                ${this.escapeSQL(job.link_title)},
                ${this.escapeSQL(job.job_description_duties)},
                ${this.escapeSQL(job.position_num)},
                ${this.escapeSQL(job.special_requirements)},
                ${this.escapeSQL(job.application_instructions)},
                ${this.escapeSQL(job.desirable_qual)},
                ${this.escapeSQL(job.soq)},
                ${this.escapeSQL(job.contact_info)},
                ${this.escapeSQL(job.additional_instructions)},
                ${this.escapeSQL(job.equal_opportunity)},
                ${this.escapeSQL(job.duty_statement)}
            )`;

            await this.executeSQL(sql);
            console.log(`✅ Inserted job: ${job.job_control} - ${job.working_title}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to insert job ${job.job_control}:`, error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Get total job count
     */
    async getJobCount() {
        try {
            const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
            const result = await this.executeSQL(sql);
            return result?.[0]?.results?.[0]?.count || 0;
        } catch (error) {
            console.error('❌ Failed to get job count:', error.message);
            return 0;
        }
    }

    /**
     * Get recent jobs
     */
    async getRecentJobs(limit = 5) {
        try {
            const sql = `SELECT job_control, working_title, department, created_at FROM ${this.tableName} ORDER BY created_at DESC LIMIT ${limit}`;
            const result = await this.executeSQL(sql);
            return result?.[0]?.results || [];
        } catch (error) {
            console.error('❌ Failed to get recent jobs:', error.message);
            return [];
        }
    }
}

// Export for use in other scripts
module.exports = D1Insert;