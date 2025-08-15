#!/usr/bin/env node

/**
 * D1 Enhanced Insert Helper
 * Database Expert - Production-ready D1 operations with bulletproof error handling
 */

const D1ConnectionManager = require('./d1-connection-manager');

class D1InsertEnhanced {
    constructor(options = {}) {
        this.connectionManager = new D1ConnectionManager({
            apiToken: options.apiToken,
            databaseName: options.databaseName || 'Calhr',
            tableName: options.tableName || 'ccJobs',
            verbose: options.verbose || false,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000
        });

        this.config = {
            batchSize: options.batchSize || 25,
            insertMode: options.insertMode || 'upsert', // 'insert', 'update', 'upsert'
            validateData: options.validateData !== false, // Default true
            enableMetrics: options.enableMetrics !== false, // Default true
        };

        this.metrics = {
            totalProcessed: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            startTime: null,
            endTime: null
        };

        this.expectedColumns = [
            'link_title', 'job_control', 'salary_range', 'department',
            'location', 'telework', 'publish_date', 'filing_deadline',
            'job_posting_url', 'work_type_schedule', 'working_title'
        ];
    }

    /**
     * Initialize the enhanced insert system
     */
    async initialize() {
        console.log('🚀 Initializing D1 Enhanced Insert System...');
        
        try {
            await this.connectionManager.initialize();
            
            // Verify table schema
            if (this.config.validateData) {
                await this.validateTableSchema();
            }
            
            console.log('✅ D1 Enhanced Insert System ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize D1 Enhanced Insert:', error.message);
            throw error;
        }
    }

    /**
     * Validate table schema matches expected structure
     */
    async validateTableSchema() {
        try {
            const schema = await this.connectionManager.getTableSchema();
            const actualColumns = schema.map(col => col.name).filter(name => name !== 'id');
            
            const missingColumns = this.expectedColumns.filter(col => !actualColumns.includes(col));
            const extraColumns = actualColumns.filter(col => !this.expectedColumns.includes(col));
            
            if (missingColumns.length > 0) {
                throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
            }
            
            if (extraColumns.length > 0) {
                console.log(`ℹ️  Extra columns found: ${extraColumns.join(', ')}`);
            }
            
            console.log(`✅ Schema validated: ${actualColumns.length} columns`);
        } catch (error) {
            throw new Error(`Schema validation failed: ${error.message}`);
        }
    }

    /**
     * Process jobs with enhanced error handling and metrics
     */
    async processJobs(jobs, options = {}) {
        if (!Array.isArray(jobs) || jobs.length === 0) {
            throw new Error('Invalid jobs array provided');
        }

        this.metrics.startTime = new Date();
        this.metrics.totalProcessed = jobs.length;

        console.log(`📦 Processing ${jobs.length} jobs with Enhanced D1 Insert...`);
        console.log(`   Mode: ${this.config.insertMode.toUpperCase()}`);
        console.log(`   Batch Size: ${this.config.batchSize}`);
        console.log(`   Validation: ${this.config.validateData ? 'Enabled' : 'Disabled'}`);

        try {
            // Validate all jobs before processing
            if (this.config.validateData) {
                await this.validateJobs(jobs);
            }

            // Process in batches
            const results = await this.processBatches(jobs, options);
            
            this.metrics.endTime = new Date();
            await this.generateMetricsReport();
            
            return results;
        } catch (error) {
            this.metrics.endTime = new Date();
            console.error('❌ Job processing failed:', error.message);
            throw error;
        }
    }

    /**
     * Validate job data structure
     */
    async validateJobs(jobs) {
        console.log('🔍 Validating job data...');
        
        const validationErrors = [];
        
        jobs.forEach((job, index) => {
            // Check required fields
            if (!job.job_control) {
                validationErrors.push(`Job ${index}: Missing job_control`);
            }
            
            if (!job.link_title) {
                validationErrors.push(`Job ${index}: Missing link_title`);
            }
            
            // Validate data types and formats
            if (job.publish_date && !this.isValidDate(job.publish_date)) {
                validationErrors.push(`Job ${index}: Invalid publish_date format`);
            }
            
            if (job.filing_deadline && !this.isValidDate(job.filing_deadline)) {
                validationErrors.push(`Job ${index}: Invalid filing_deadline format`);
            }
            
            // Check for excessively long fields (SQLite limits)
            Object.keys(job).forEach(key => {
                if (typeof job[key] === 'string' && job[key].length > 10000) {
                    validationErrors.push(`Job ${index}: Field '${key}' too long (${job[key].length} chars)`);
                }
            });
        });
        
        if (validationErrors.length > 0) {
            console.error('❌ Validation errors found:');
            validationErrors.slice(0, 10).forEach(error => console.error(`   ${error}`));
            if (validationErrors.length > 10) {
                console.error(`   ... and ${validationErrors.length - 10} more errors`);
            }
            throw new Error(`Data validation failed: ${validationErrors.length} errors found`);
        }
        
        console.log('✅ Job data validation passed');
    }

    /**
     * Process jobs in batches
     */
    async processBatches(jobs, options = {}) {
        const batchSize = options.batchSize || this.config.batchSize;
        const results = [];
        
        for (let i = 0; i < jobs.length; i += batchSize) {
            const batch = jobs.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(jobs.length / batchSize);
            
            console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} jobs)...`);
            
            try {
                const batchResults = await this.processBatch(batch, options);
                results.push(...batchResults);
                
                // Update metrics
                batchResults.forEach(result => {
                    if (result.success) {
                        if (result.action === 'inserted') this.metrics.inserted++;
                        else if (result.action === 'updated') this.metrics.updated++;
                        else this.metrics.skipped++;
                    } else {
                        this.metrics.errors++;
                    }
                });
                
                console.log(`   ✅ Batch ${batchNumber} completed`);
                
                // Progress indicator
                const processed = Math.min(i + batchSize, jobs.length);
                const progress = (processed / jobs.length * 100).toFixed(1);
                console.log(`   📊 Progress: ${processed}/${jobs.length} (${progress}%)`);
                
            } catch (error) {
                console.error(`❌ Batch ${batchNumber} failed:`, error.message);
                
                // Add failed batch to results
                batch.forEach(job => {
                    results.push({
                        success: false,
                        job_control: job.job_control,
                        error: `Batch failure: ${error.message}`
                    });
                    this.metrics.errors++;
                });
                
                if (options.stopOnBatchError) {
                    throw error;
                }
            }
            
            // Rate limiting delay
            if (i + batchSize < jobs.length) {
                await this.sleep(options.batchDelay || 500);
            }
        }
        
        return results;
    }

    /**
     * Process a single batch of jobs
     */
    async processBatch(jobs, options = {}) {
        const results = [];
        
        for (const job of jobs) {
            try {
                let result;
                
                switch (this.config.insertMode) {
                    case 'insert':
                        result = await this.insertJob(job);
                        break;
                    case 'update':
                        result = await this.updateJob(job);
                        break;
                    case 'upsert':
                    default:
                        result = await this.upsertJob(job);
                        break;
                }
                
                results.push({
                    success: true,
                    job_control: job.job_control,
                    action: result.action,
                    ...result
                });
                
            } catch (error) {
                console.error(`❌ Failed to process job ${job.job_control}:`, error.message);
                results.push({
                    success: false,
                    job_control: job.job_control,
                    error: error.message
                });
            }
            
            // Small delay between individual jobs
            await this.sleep(options.jobDelay || 100);
        }
        
        return results;
    }

    /**
     * Insert a new job
     */
    async insertJob(job) {
        const sql = this.buildInsertSQL(job);
        await this.connectionManager.query(sql);
        
        console.log(`✅ Inserted: ${job.job_control} - ${job.working_title}`);
        return { action: 'inserted' };
    }

    /**
     * Update an existing job
     */
    async updateJob(job) {
        // First check if job exists
        const existingJob = await this.getExistingJob(job.job_control);
        if (!existingJob) {
            throw new Error(`Job ${job.job_control} not found for update`);
        }
        
        const sql = this.buildUpdateSQL(job, existingJob.id);
        await this.connectionManager.query(sql);
        
        console.log(`📝 Updated: ${job.job_control} - ${job.working_title}`);
        return { action: 'updated' };
    }

    /**
     * Upsert (insert or update) a job
     */
    async upsertJob(job) {
        // Check if job exists
        const existingJob = await this.getExistingJob(job.job_control);
        
        if (existingJob) {
            // Check if update is needed
            if (this.hasJobChanged(existingJob, job)) {
                const sql = this.buildUpdateSQL(job, existingJob.id);
                await this.connectionManager.query(sql);
                console.log(`📝 Updated: ${job.job_control} - ${job.working_title}`);
                return { action: 'updated' };
            } else {
                console.log(`⏭️  Skipped: ${job.job_control} (no changes)`);
                return { action: 'skipped', reason: 'no_changes' };
            }
        } else {
            // Insert new job
            const sql = this.buildInsertSQL(job);
            await this.connectionManager.query(sql);
            console.log(`✅ Inserted: ${job.job_control} - ${job.working_title}`);
            return { action: 'inserted' };
        }
    }

    /**
     * Get existing job by job_control
     */
    async getExistingJob(jobControl) {
        const sql = `SELECT * FROM ${this.connectionManager.config.tableName} WHERE job_control = '${this.escapeSQL(jobControl)}'`;
        const results = await this.connectionManager.query(sql);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Check if job data has changed
     */
    hasJobChanged(existingJob, newJob) {
        const fieldsToCheck = this.expectedColumns;
        
        for (const field of fieldsToCheck) {
            const existingValue = String(existingJob[field] || '').trim();
            const newValue = String(newJob[field] || '').trim();
            
            if (existingValue !== newValue) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Build INSERT SQL statement
     */
    buildInsertSQL(job) {
        const columns = this.expectedColumns.join(', ');
        const values = this.expectedColumns.map(col => this.formatValue(job[col])).join(', ');
        
        return `INSERT INTO ${this.connectionManager.config.tableName} (${columns}) VALUES (${values})`;
    }

    /**
     * Build UPDATE SQL statement
     */
    buildUpdateSQL(job, jobId) {
        const updates = this.expectedColumns
            .map(col => `${col} = ${this.formatValue(job[col])}`)
            .join(', ');
            
        return `UPDATE ${this.connectionManager.config.tableName} SET ${updates} WHERE id = ${jobId}`;
    }

    /**
     * Format value for SQL
     */
    formatValue(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        
        return `'${this.escapeSQL(String(value))}'`;
    }

    /**
     * Escape SQL string
     */
    escapeSQL(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/'/g, "''");
    }

    /**
     * Validate date format
     */
    isValidDate(dateString) {
        if (!dateString) return true; // Allow null/empty dates
        
        // Check YYYY-MM-DD format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateString)) return false;
        
        // Check if date is valid
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    /**
     * Generate comprehensive metrics report
     */
    async generateMetricsReport() {
        const duration = this.metrics.endTime - this.metrics.startTime;
        const successRate = this.metrics.totalProcessed > 0 ? 
            ((this.metrics.totalProcessed - this.metrics.errors) / this.metrics.totalProcessed * 100).toFixed(1) : 0;

        console.log('\n📊 PROCESSING COMPLETE - METRICS REPORT');
        console.log('=' .repeat(50));
        console.log(`   📦 Total Processed: ${this.metrics.totalProcessed}`);
        console.log(`   ✅ Inserted: ${this.metrics.inserted}`);
        console.log(`   📝 Updated: ${this.metrics.updated}`);
        console.log(`   ⏭️  Skipped: ${this.metrics.skipped}`);
        console.log(`   ❌ Errors: ${this.metrics.errors}`);
        console.log(`   📈 Success Rate: ${successRate}%`);
        console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(1)} seconds`);
        
        if (this.metrics.totalProcessed > 0) {
            const avgTime = duration / this.metrics.totalProcessed;
            console.log(`   ⚡ Avg Time/Job: ${avgTime.toFixed(0)}ms`);
        }

        // Database health check
        try {
            const finalCount = await this.connectionManager.getRecordCount();
            console.log(`   💾 Final Record Count: ${finalCount}`);
        } catch (error) {
            console.log(`   💾 Final Record Count: Unable to retrieve (${error.message})`);
        }

        // Connection manager metrics
        const connMetrics = this.connectionManager.getStatus().metrics;
        console.log(`\n🔧 CONNECTION METRICS:`);
        console.log(`   📊 Total Queries: ${connMetrics.totalQueries}`);
        console.log(`   ✅ Successful: ${connMetrics.successfulQueries}`);
        console.log(`   ❌ Failed: ${connMetrics.failedQueries}`);
        console.log(`   ⚡ Avg Response: ${connMetrics.averageResponseTime.toFixed(0)}ms`);

        console.log('\n✨ Enhanced D1 Insert completed successfully!');
    }

    /**
     * Get current record count
     */
    async getRecordCount() {
        return await this.connectionManager.getRecordCount();
    }

    /**
     * Get system health status
     */
    async getHealthStatus() {
        return await this.connectionManager.getHealthStatus();
    }

    /**
     * Helper methods
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get processing metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
}

module.exports = D1InsertEnhanced;