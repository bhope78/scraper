#!/usr/bin/env node

/**
 * D1 Insert Helper - Updated for new schema with update capability
 * Handles inserting and updating jobs in D1 database
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class D1Insert {
    constructor(apiToken, dbName = 'Calhr', tableName = 'ccJobs') {
        this.apiToken = apiToken;
        this.dbName = dbName;
        this.tableName = tableName;
        this.batchSize = 25; // D1 has limits on command size
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
        if (!date) return 'NULL';
        // If it's already a string in the right format, use it
        if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `'${date}'`;
        }
        // Otherwise convert to ISO date
        return `'${new Date(date).toISOString().split('T')[0]}'`;
    }

    /**
     * Get existing job data from D1
     */
    async getExistingJob(jobControl) {
        try {
            // If we have an API token, prepend it to the command
            const prefix = this.apiToken ? `CLOUDFLARE_API_TOKEN="${this.apiToken}" ` : '';
            const command = `${prefix}npx wrangler d1 execute ${this.dbName} --remote --command "SELECT * FROM ${this.tableName} WHERE job_control = '${jobControl}'" --json`;
            
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr && !stderr.includes('wrangler')) {
                console.error(`⚠️ Wrangler stderr for job ${jobControl}:`, stderr);
            }
            
            const result = JSON.parse(stdout);
            if (result[0].results.length > 0) {
                return result[0].results[0];
            }
            return null;
        } catch (error) {
            console.error(`❌ Error checking job ${jobControl}:`, error.message);
            if (error.stderr) {
                console.error(`   Stderr:`, error.stderr);
            }
            return null;
        }
    }

    /**
     * Check if job data has changed
     */
    hasJobChanged(existingJob, newJob) {
        const fieldsToCheck = [
            'link_title',
            'salary_range',
            'department',
            'location',
            'telework',
            'publish_date',
            'filing_deadline',
            'job_posting_url',
            'work_type_schedule',
            'working_title'
        ];

        for (const field of fieldsToCheck) {
            const existingValue = existingJob[field] || '';
            const newValue = newJob[field] || '';
            
            // Normalize and compare
            if (String(existingValue).trim() !== String(newValue).trim()) {
                console.log(`  🔄 Field changed: ${field}`);
                console.log(`     Old: "${existingValue}"`);
                console.log(`     New: "${newValue}"`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Update existing job
     */
    async updateJob(jobId, job) {
        try {
            const sql = `UPDATE ${this.tableName} SET 
                link_title = ${this.escapeSQL(job.link_title)},
                salary_range = ${this.escapeSQL(job.salary_range)},
                department = ${this.escapeSQL(job.department)},
                location = ${this.escapeSQL(job.location)},
                telework = ${this.escapeSQL(job.telework)},
                publish_date = ${this.escapeSQL(job.publish_date)},
                filing_deadline = ${this.escapeSQL(job.filing_deadline)},
                job_posting_url = ${this.escapeSQL(job.job_posting_url)},
                work_type_schedule = ${this.escapeSQL(job.work_type_schedule)},
                working_title = ${this.escapeSQL(job.working_title)}
            WHERE id = ${jobId}`;

            const prefix = this.apiToken ? `CLOUDFLARE_API_TOKEN="${this.apiToken}" ` : '';
            const command = `${prefix}npx wrangler d1 execute ${this.dbName} --remote --command "${sql.replace(/\n/g, ' ').replace(/\s+/g, ' ')}"`;
            
            await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large commands
            });
            
            console.log(`📝 Updated job: ${job.job_control} - ${job.working_title}`);
            return { success: true, action: 'updated' };
        } catch (error) {
            console.error(`❌ Failed to update job ${job.job_control}:`, error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Insert or update a single job
     */
    async upsertJob(job) {
        try {
            // Check if job already exists
            const existingJob = await this.getExistingJob(job.job_control);
            
            if (existingJob) {
                // Check if data has changed
                if (this.hasJobChanged(existingJob, job)) {
                    // Update the job
                    return await this.updateJob(existingJob.id, job);
                } else {
                    // No changes, skip
                    console.log(`⏭️  Job ${job.job_control} exists with no changes, skipping`);
                    return { success: false, reason: 'no_changes' };
                }
            }

            // Insert new job - matching exact column names
            const sql = `INSERT INTO ${this.tableName} (
                link_title,
                job_control,
                salary_range,
                department,
                location,
                telework,
                publish_date,
                filing_deadline,
                job_posting_url,
                work_type_schedule,
                working_title
            ) VALUES (
                ${this.escapeSQL(job.link_title)},
                ${this.escapeSQL(job.job_control)},
                ${this.escapeSQL(job.salary_range)},
                ${this.escapeSQL(job.department)},
                ${this.escapeSQL(job.location)},
                ${this.escapeSQL(job.telework)},
                ${this.escapeSQL(job.publish_date)},
                ${this.escapeSQL(job.filing_deadline)},
                ${this.escapeSQL(job.job_posting_url)},
                ${this.escapeSQL(job.work_type_schedule)},
                ${this.escapeSQL(job.working_title)}
            )`;

            const prefix = this.apiToken ? `CLOUDFLARE_API_TOKEN="${this.apiToken}" ` : '';
            const command = `${prefix}npx wrangler d1 execute ${this.dbName} --remote --command "${sql.replace(/\n/g, ' ').replace(/\s+/g, ' ')}"`;
            
            await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large commands
            });
            
            console.log(`✅ Inserted new job: ${job.job_control} - ${job.working_title}`);
            return { success: true, action: 'inserted' };
        } catch (error) {
            console.error(`❌ Failed to process job ${job.job_control}:`, error.message);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Get job count
     */
    async getJobCount() {
        try {
            const prefix = this.apiToken ? `CLOUDFLARE_API_TOKEN="${this.apiToken}" ` : '';
            const command = `${prefix}npx wrangler d1 execute ${this.dbName} --remote --command "SELECT COUNT(*) as count FROM ${this.tableName}" --json`;
            
            const { stdout } = await execAsync(command);
            const result = JSON.parse(stdout);
            
            if (result[0].results.length > 0) {
                return result[0].results[0].count;
            }
            return 0;
        } catch (error) {
            console.error('❌ Error getting job count:', error.message);
            if (error.stderr) {
                console.error('   Stderr:', error.stderr);
            }
            return 0;
        }
    }

    /**
     * Process multiple jobs with upsert logic
     */
    async processBatch(jobs) {
        console.log(`📦 Processing batch of ${jobs.length} jobs...`);
        const results = {
            inserted: 0,
            updated: 0,
            no_changes: 0,
            errors: 0
        };

        for (const job of jobs) {
            const result = await this.upsertJob(job);
            
            if (result.success) {
                if (result.action === 'inserted') {
                    results.inserted++;
                } else if (result.action === 'updated') {
                    results.updated++;
                }
            } else if (result.reason === 'no_changes') {
                results.no_changes++;
            } else {
                results.errors++;
            }
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\n📊 Batch processing complete:');
        console.log(`   ✅ Inserted: ${results.inserted}`);
        console.log(`   📝 Updated: ${results.updated}`);
        console.log(`   ⏭️  No changes: ${results.no_changes}`);
        console.log(`   ❌ Errors: ${results.errors}`);
        
        return results;
    }
}

module.exports = D1Insert;