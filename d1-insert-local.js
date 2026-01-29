#!/usr/bin/env node

/**
 * D1 Insert Helper
 * Handles inserting jobs into D1 database
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
     * Format date for SQL - handles various date formats gracefully
     */
    formatDate(date) {
        if (!date) return 'NULL';

        // If it's already a string in YYYY-MM-DD format, use it
        if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `'${date}'`;
        }

        // Handle common text values (Until Filled, Continuous, etc.)
        if (typeof date === 'string') {
            const lowerDate = date.toLowerCase().trim();
            if (lowerDate === 'until filled' || lowerDate === 'continuous' ||
                lowerDate === 'open' || lowerDate === 'ongoing' ||
                lowerDate.includes('until') || lowerDate.includes('continuous')) {
                return `'${date.replace(/'/g, "''")}'`;
            }

            // Try to parse MM/DD/YYYY or similar formats
            try {
                const parsed = new Date(date);
                if (!isNaN(parsed.getTime())) {
                    return `'${parsed.toISOString().split('T')[0]}'`;
                }
            } catch (e) {
                // If parsing fails, store as-is
            }

            // Store as-is if we can't parse it
            return `'${date.replace(/'/g, "''")}'`;
        }

        // Try to convert to ISO date
        try {
            const parsed = new Date(date);
            if (!isNaN(parsed.getTime())) {
                return `'${parsed.toISOString().split('T')[0]}'`;
            }
        } catch (e) {
            // Fall through to NULL
        }

        return 'NULL';
    }

    /**
     * Check if job exists in D1
     */
    async jobExists(jobControl) {
        try {
            const command = `npx wrangler d1 execute ${this.dbName} --remote --command "SELECT id FROM ${this.tableName} WHERE job_control = '${jobControl}'" --json`;
            
            const { stdout } = await execAsync(command);
            
            const result = JSON.parse(stdout);
            return result[0].results.length > 0;
        } catch (error) {
            console.error(`❌ Error checking job ${jobControl}:`, error.message);
            return false;
        }
    }

    /**
     * Insert a single job with detailed logging
     */
    async insertJob(job) {
        const jobId = job.job_control || 'UNKNOWN';

        try {
            // Validate required field
            if (!job.job_control) {
                console.error(`❌ [${jobId}] Missing required field: job_control`);
                return { success: false, reason: 'missing job_control' };
            }

            // Check if job already exists
            if (await this.jobExists(job.job_control)) {
                console.log(`⏭️  [${jobId}] Already exists, skipping`);
                return { success: false, reason: 'duplicate' };
            }

            // Build SQL with safe values
            const values = {
                working_title: this.escapeSQL(job.working_title),
                department: this.escapeSQL(job.department),
                job_control: this.escapeSQL(job.job_control),
                location: this.escapeSQL(job.location),
                salary_range: this.escapeSQL(job.salary_range),
                telework: this.escapeSQL(job.telework),
                worktype_schedule: this.escapeSQL(job.worktype_schedule || job.work_type_schedule),
                publish_date: this.formatDate(job.publish_date),
                filing_date: this.formatDate(job.filing_date || job.filing_deadline),
                link_title: this.escapeSQL(job.link_title),
                job_description_duties: this.escapeSQL(job.job_description_duties),
                position_num: this.escapeSQL(job.position_num),
                special_requirements: this.escapeSQL(job.special_requirements),
                application_instructions: this.escapeSQL(job.application_instructions),
                desirable_qual: this.escapeSQL(job.desirable_qual),
                soq: this.escapeSQL(job.soq),
                contact_info: this.escapeSQL(job.contact_info),
                additional_instructions: this.escapeSQL(job.additional_instructions),
                equal_opportunity: this.escapeSQL(job.equal_opportunity),
                duty_statement: this.escapeSQL(job.duty_statement)
            };

            const sql = `INSERT INTO ${this.tableName} (
                working_title, department, job_control, location, salary_range,
                telework, worktype_schedule, publish_date, filing_date,
                link_title, job_description_duties, position_num,
                special_requirements, application_instructions, desirable_qual,
                soq, contact_info, additional_instructions, equal_opportunity,
                duty_statement
            ) VALUES (
                ${values.working_title},
                ${values.department},
                ${values.job_control},
                ${values.location},
                ${values.salary_range},
                ${values.telework},
                ${values.worktype_schedule},
                ${values.publish_date},
                ${values.filing_date},
                ${values.link_title},
                ${values.job_description_duties},
                ${values.position_num},
                ${values.special_requirements},
                ${values.application_instructions},
                ${values.desirable_qual},
                ${values.soq},
                ${values.contact_info},
                ${values.additional_instructions},
                ${values.equal_opportunity},
                ${values.duty_statement}
            )`;

            const command = `npx wrangler d1 execute ${this.dbName} --remote --command "${sql.replace(/\n/g, ' ').replace(/\s+/g, ' ')}"`;

            await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large commands
            });

            console.log(`✅ [${jobId}] Inserted: ${job.working_title || 'N/A'} @ ${job.department || 'N/A'}`);
            return { success: true };
        } catch (error) {
            // Extract the actual error message from wrangler output
            let errorMsg = error.message;
            if (error.stdout && error.stdout.includes('"text"')) {
                try {
                    const parsed = JSON.parse(error.stdout);
                    errorMsg = parsed.error?.notes?.[0]?.text || errorMsg;
                } catch (e) {}
            }

            console.error(`❌ [${jobId}] Insert failed: ${errorMsg}`);
            console.error(`   📋 Title: ${job.working_title || 'N/A'}`);
            console.error(`   🏢 Dept: ${job.department || 'N/A'}`);
            console.error(`   📅 Dates: pub=${job.publish_date}, file=${job.filing_date || job.filing_deadline}`);

            return { success: false, reason: errorMsg };
        }
    }

    /**
     * Insert multiple jobs in batches
     */
    async insertBatch(jobs) {
        console.log(`📦 Inserting batch of ${jobs.length} jobs...`);
        const results = {
            inserted: 0,
            duplicates: 0,
            errors: 0
        };

        for (let i = 0; i < jobs.length; i += this.batchSize) {
            const batch = jobs.slice(i, i + this.batchSize);
            console.log(`\n🔄 Processing batch ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(jobs.length/this.batchSize)}`);
            
            for (const job of batch) {
                const result = await this.insertJob(job);
                
                if (result.success) {
                    results.inserted++;
                } else if (result.reason === 'duplicate') {
                    results.duplicates++;
                } else {
                    results.errors++;
                }
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log('\n📊 Batch insert complete:');
        console.log(`   ✅ Inserted: ${results.inserted}`);
        console.log(`   ⏭️  Duplicates: ${results.duplicates}`);
        console.log(`   ❌ Errors: ${results.errors}`);
        
        return results;
    }

    /**
     * Get total job count
     */
    async getJobCount() {
        try {
            const command = `npx wrangler d1 execute ${this.dbName} --remote --command "SELECT COUNT(*) as count FROM ${this.tableName}" --json`;
            
            const { stdout } = await execAsync(command);
            
            const result = JSON.parse(stdout);
            return result[0].results[0].count;
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
            const command = `npx wrangler d1 execute ${this.dbName} --remote --command "SELECT job_control, working_title, department, created_at FROM ${this.tableName} ORDER BY created_at DESC LIMIT ${limit}" --json`;
            
            const { stdout } = await execAsync(command);
            
            const result = JSON.parse(stdout);
            return result[0].results;
        } catch (error) {
            console.error('❌ Failed to get recent jobs:', error.message);
            return [];
        }
    }
}

// Export for use in other scripts
module.exports = D1Insert;

// If run directly, test with sample data
if (require.main === module) {
    async function test() {
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        
        if (!apiToken) {
            console.error('❌ CLOUDFLARE_API_TOKEN environment variable is required');
            process.exit(1);
        }
        
        const d1Insert = new D1Insert(apiToken);
        
        // Test with sample job
        const sampleJob = {
            working_title: 'TEST Software Engineer',
            department: 'TEST Department',
            job_control: `TEST-${Date.now()}`,
            location: 'Sacramento, CA',
            salary_range: '$5,000 - $8,000',
            telework: 'Optional',
            worktype_schedule: 'Full Time',
            publish_date: '2025-08-14',
            filing_date: '2025-08-31',
            link_title: 'Software Engineer',
            job_description_duties: 'This is a test job description.',
            position_num: 'TEST123',
            special_requirements: 'Test requirements',
            application_instructions: 'Test instructions',
            desirable_qual: 'Test qualifications',
            soq: 'Test SOQ',
            contact_info: 'test@example.com',
            additional_instructions: 'Test additional',
            equal_opportunity: 'Equal opportunity employer',
            duty_statement: 'Test duty statement'
        };
        
        console.log('🧪 Testing D1 insert functionality...\n');
        
        // Insert test job
        const result = await d1Insert.insertJob(sampleJob);
        console.log('Insert result:', result);
        
        // Get total count
        const count = await d1Insert.getJobCount();
        console.log(`\n📊 Total jobs in database: ${count}`);
        
        // Get recent jobs
        const recent = await d1Insert.getRecentJobs(3);
        console.log('\n📋 Recent jobs:');
        recent.forEach(job => {
            console.log(`   - ${job.job_control}: ${job.working_title} (${job.department})`);
        });
    }
    
    test();
}