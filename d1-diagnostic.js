#!/usr/bin/env node

/**
 * D1 Comprehensive Diagnostic Tool
 * Database Expert - Root Cause Analysis and Environment Testing
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class D1Diagnostic {
    constructor() {
        this.results = {
            environment: {},
            authentication: {},
            database: {},
            connectivity: {},
            schema: {},
            recommendations: []
        };
    }

    /**
     * Run comprehensive diagnostics
     */
    async runDiagnostics() {
        console.log('🔍 D1 Database Expert - Comprehensive Diagnostic Tool');
        console.log('=' .repeat(70));
        console.log('Analyzing environment, authentication, and connectivity...\n');

        try {
            await this.checkEnvironment();
            await this.checkAuthentication();
            await this.checkDatabase();
            await this.checkConnectivity();
            await this.checkSchema();
            await this.generateRecommendations();
            await this.displayResults();
        } catch (error) {
            console.error('❌ Diagnostic failed:', error.message);
            console.error('\nDebug information:');
            console.error(error);
        }
    }

    /**
     * Check Node.js and wrangler environment
     */
    async checkEnvironment() {
        console.log('🔧 Environment Check');
        console.log('-' .repeat(30));

        try {
            // Node.js version
            const nodeVersionResult = await execAsync('node --version');
            const nodeVersion = nodeVersionResult.stdout.trim();
            this.results.environment.nodeVersion = nodeVersion;
            
            const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
            this.results.environment.nodeVersionValid = majorVersion >= 20;
            
            console.log(`   Node.js: ${nodeVersion} ${majorVersion >= 20 ? '✅' : '❌ (Requires v20+)'}`);

            // NVM availability
            try {
                const nvmResult = await execAsync('nvm --version');
                this.results.environment.nvmAvailable = true;
                console.log(`   NVM: Available ✅`);
            } catch {
                this.results.environment.nvmAvailable = false;
                console.log(`   NVM: Not available ⚠️`);
            }

            // Wrangler version (if Node is compatible)
            if (majorVersion >= 20) {
                try {
                    const wranglerResult = await execAsync('npx wrangler --version');
                    this.results.environment.wranglerVersion = wranglerResult.stdout.trim();
                    console.log(`   Wrangler: ${this.results.environment.wranglerVersion} ✅`);
                } catch (error) {
                    this.results.environment.wranglerError = error.message;
                    console.log(`   Wrangler: Error - ${error.message} ❌`);
                }
            } else {
                this.results.environment.wranglerBlocked = true;
                console.log(`   Wrangler: Blocked by Node.js version ❌`);
            }

            // Working directory
            this.results.environment.workingDir = process.cwd();
            console.log(`   Working Dir: ${this.results.environment.workingDir}`);

            // Package.json
            try {
                const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
                this.results.environment.packageExists = true;
                this.results.environment.dependencies = packageJson.dependencies;
                console.log(`   Package.json: Found ✅`);
            } catch {
                this.results.environment.packageExists = false;
                console.log(`   Package.json: Missing ❌`);
            }

        } catch (error) {
            this.results.environment.error = error.message;
            console.log(`   Environment check failed: ${error.message} ❌`);
        }

        console.log();
    }

    /**
     * Check authentication methods
     */
    async checkAuthentication() {
        console.log('🔐 Authentication Check');
        console.log('-' .repeat(30));

        // API Token from environment
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        this.results.authentication.hasApiToken = !!apiToken;
        this.results.authentication.apiTokenLength = apiToken ? apiToken.length : 0;
        console.log(`   API Token: ${apiToken ? 'Present ✅' : 'Missing ❌'}`);
        
        if (apiToken) {
            console.log(`   Token Length: ${apiToken.length} chars`);
            console.log(`   Token Format: ${this.validateTokenFormat(apiToken) ? 'Valid ✅' : 'Invalid ❌'}`);
        }

        // Check wrangler auth status (if Node version allows)
        if (this.results.environment.nodeVersionValid) {
            try {
                const authResult = await execAsync('npx wrangler whoami', {
                    env: apiToken ? { ...process.env, CLOUDFLARE_API_TOKEN: apiToken } : process.env
                });
                this.results.authentication.wranglerAuth = authResult.stdout.trim();
                console.log(`   Wrangler Auth: Authenticated ✅`);
                console.log(`   Account: ${authResult.stdout.trim()}`);
            } catch (error) {
                this.results.authentication.wranglerAuthError = error.message;
                console.log(`   Wrangler Auth: Failed ❌`);
                console.log(`   Error: ${error.message}`);
            }
        }

        console.log();
    }

    /**
     * Check database configuration and connectivity
     */
    async checkDatabase() {
        console.log('💾 Database Configuration Check');
        console.log('-' .repeat(30));

        const dbId = 'fcde85de-7c22-46a5-8eaf-f68a7aa0c1b9';
        const dbName = 'Calhr';
        const tableName = 'ccJobs';

        this.results.database.id = dbId;
        this.results.database.name = dbName;
        this.results.database.table = tableName;

        console.log(`   Database ID: ${dbId}`);
        console.log(`   Database Name: ${dbName}`);
        console.log(`   Table Name: ${tableName}`);

        // Try to list databases
        if (this.results.environment.nodeVersionValid && this.results.authentication.hasApiToken) {
            try {
                const listResult = await execAsync('npx wrangler d1 list --json', {
                    env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN }
                });
                
                const databases = JSON.parse(listResult.stdout);
                this.results.database.list = databases;
                
                const targetDb = databases.find(db => db.uuid === dbId || db.name === dbName);
                this.results.database.found = !!targetDb;
                
                console.log(`   Database List: Retrieved ${databases.length} databases ✅`);
                console.log(`   Target Database: ${targetDb ? 'Found ✅' : 'Not Found ❌'}`);
                
                if (targetDb) {
                    console.log(`   DB Details: ${targetDb.name} (${targetDb.uuid})`);
                }
                
            } catch (error) {
                this.results.database.listError = error.message;
                console.log(`   Database List: Failed ❌`);
                console.log(`   Error: ${error.message}`);
            }
        }

        console.log();
    }

    /**
     * Test actual database connectivity
     */
    async checkConnectivity() {
        console.log('🌐 Connectivity Test');
        console.log('-' .repeat(30));

        if (!this.results.environment.nodeVersionValid) {
            console.log('   Skipped - Node.js version incompatible ⏭️');
            console.log();
            return;
        }

        if (!this.results.authentication.hasApiToken) {
            console.log('   Skipped - No API token ⏭️');
            console.log();
            return;
        }

        const dbName = 'Calhr';
        const tableName = 'ccJobs';

        // Test basic query
        try {
            const testQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
            const command = `npx wrangler d1 execute ${dbName} --remote --command "${testQuery}" --json`;
            
            console.log(`   Testing: ${testQuery}`);
            
            const result = await execAsync(command, {
                env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN },
                timeout: 30000 // 30 second timeout
            });

            const parsed = JSON.parse(result.stdout);
            const count = parsed[0]?.results[0]?.count || 0;
            
            this.results.connectivity.success = true;
            this.results.connectivity.recordCount = count;
            
            console.log(`   Remote Query: Success ✅`);
            console.log(`   Record Count: ${count}`);

        } catch (error) {
            this.results.connectivity.success = false;
            this.results.connectivity.error = error.message;
            
            console.log(`   Remote Query: Failed ❌`);
            console.log(`   Error: ${error.message}`);
            
            if (error.stdout) {
                console.log(`   Stdout: ${error.stdout}`);
            }
            if (error.stderr) {
                console.log(`   Stderr: ${error.stderr}`);
            }
        }

        // Test local vs remote discrepancy
        try {
            const localCommand = `npx wrangler d1 execute ${dbName} --local --command "SELECT COUNT(*) as count FROM ${tableName}" --json`;
            
            const localResult = await execAsync(localCommand, {
                env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN },
                timeout: 30000
            });

            const localParsed = JSON.parse(localResult.stdout);
            const localCount = localParsed[0]?.results[0]?.count || 0;
            
            this.results.connectivity.localCount = localCount;
            console.log(`   Local Count: ${localCount}`);
            
            if (this.results.connectivity.recordCount !== localCount) {
                console.log(`   Discrepancy: Local (${localCount}) ≠ Remote (${this.results.connectivity.recordCount}) ⚠️`);
                this.results.connectivity.hasDiscrepancy = true;
            } else {
                console.log(`   Sync Status: Local and Remote match ✅`);
                this.results.connectivity.hasDiscrepancy = false;
            }

        } catch (error) {
            this.results.connectivity.localError = error.message;
            console.log(`   Local Query: Failed ❌`);
        }

        console.log();
    }

    /**
     * Check database schema
     */
    async checkSchema() {
        console.log('📋 Schema Validation');
        console.log('-' .repeat(30));

        if (!this.results.connectivity.success) {
            console.log('   Skipped - No database connectivity ⏭️');
            console.log();
            return;
        }

        const dbName = 'Calhr';
        const tableName = 'ccJobs';

        try {
            // Get table schema
            const schemaQuery = `PRAGMA table_info(${tableName})`;
            const command = `npx wrangler d1 execute ${dbName} --remote --command "${schemaQuery}" --json`;
            
            const result = await execAsync(command, {
                env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN },
                timeout: 30000
            });

            const parsed = JSON.parse(result.stdout);
            const columns = parsed[0]?.results || [];
            
            this.results.schema.columns = columns;
            this.results.schema.columnCount = columns.length;
            
            console.log(`   Table Schema: Retrieved ${columns.length} columns ✅`);
            
            // Expected columns for ccJobs table
            const expectedColumns = [
                'id', 'link_title', 'job_control', 'salary_range', 'department',
                'location', 'telework', 'publish_date', 'filing_deadline',
                'job_posting_url', 'work_type_schedule', 'working_title'
            ];
            
            const actualColumns = columns.map(col => col.name);
            const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
            const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
            
            this.results.schema.expectedColumns = expectedColumns;
            this.results.schema.actualColumns = actualColumns;
            this.results.schema.missingColumns = missingColumns;
            this.results.schema.extraColumns = extraColumns;
            
            console.log(`   Expected Columns: ${expectedColumns.length}`);
            console.log(`   Actual Columns: ${actualColumns.length}`);
            
            if (missingColumns.length > 0) {
                console.log(`   Missing: ${missingColumns.join(', ')} ❌`);
            }
            
            if (extraColumns.length > 0) {
                console.log(`   Extra: ${extraColumns.join(', ')} ⚠️`);
            }
            
            if (missingColumns.length === 0 && extraColumns.length === 0) {
                console.log(`   Schema Match: Perfect ✅`);
            }

        } catch (error) {
            this.results.schema.error = error.message;
            console.log(`   Schema Check: Failed ❌`);
            console.log(`   Error: ${error.message}`);
        }

        console.log();
    }

    /**
     * Generate specific recommendations
     */
    async generateRecommendations() {
        const recommendations = [];

        // Node.js version
        if (!this.results.environment.nodeVersionValid) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Environment',
                issue: 'Node.js version too old',
                solution: 'Upgrade to Node.js v20+ using: nvm use 20 && nvm alias default 20',
                impact: 'Wrangler commands completely non-functional'
            });
        }

        // Authentication
        if (!this.results.authentication.hasApiToken) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Authentication',
                issue: 'Missing CLOUDFLARE_API_TOKEN',
                solution: 'Set environment variable: export CLOUDFLARE_API_TOKEN="your-token"',
                impact: 'No database access possible'
            });
        }

        // Local vs Remote discrepancy
        if (this.results.connectivity.hasDiscrepancy) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Data Sync',
                issue: 'Local and remote databases out of sync',
                solution: 'Run data migration or use --remote flag consistently',
                impact: 'Development and production data inconsistency'
            });
        }

        // Schema issues
        if (this.results.schema.missingColumns?.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Schema',
                issue: 'Missing required columns',
                solution: `Add columns: ${this.results.schema.missingColumns.join(', ')}`,
                impact: 'Application errors and data insertion failures'
            });
        }

        // GitHub Actions specific
        if (this.results.environment.nodeVersionValid && this.results.authentication.hasApiToken) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'CI/CD',
                issue: 'GitHub Actions configuration',
                solution: 'Ensure CLOUDFLARE_API_TOKEN secret is set and Node.js 20+ is used',
                impact: 'Automated deployments and data sync failures'
            });
        }

        this.results.recommendations = recommendations;
    }

    /**
     * Display comprehensive results
     */
    async displayResults() {
        console.log('📊 DIAGNOSTIC SUMMARY');
        console.log('=' .repeat(70));

        // Environment Status
        console.log('\n🔧 Environment Status:');
        console.log(`   Node.js: ${this.results.environment.nodeVersion} ${this.results.environment.nodeVersionValid ? '✅' : '❌'}`);
        console.log(`   Wrangler: ${this.results.environment.wranglerVersion || 'Unavailable'} ${this.results.environment.wranglerVersion ? '✅' : '❌'}`);

        // Authentication Status
        console.log('\n🔐 Authentication Status:');
        console.log(`   API Token: ${this.results.authentication.hasApiToken ? 'Present ✅' : 'Missing ❌'}`);
        console.log(`   Wrangler Auth: ${this.results.authentication.wranglerAuth ? 'Authenticated ✅' : 'Failed ❌'}`);

        // Database Status
        console.log('\n💾 Database Status:');
        console.log(`   Database: ${this.results.database.name} (${this.results.database.id})`);
        console.log(`   Found: ${this.results.database.found ? 'Yes ✅' : 'No ❌'}`);
        console.log(`   Remote Records: ${this.results.connectivity.recordCount || 'Unknown'}`);
        console.log(`   Local Records: ${this.results.connectivity.localCount || 'Unknown'}`);

        // Critical Issues
        console.log('\n🚨 CRITICAL ISSUES:');
        const criticalIssues = this.results.recommendations.filter(r => r.priority === 'CRITICAL');
        if (criticalIssues.length === 0) {
            console.log('   None ✅');
        } else {
            criticalIssues.forEach((issue, index) => {
                console.log(`   ${index + 1}. ${issue.issue}`);
                console.log(`      Solution: ${issue.solution}`);
                console.log(`      Impact: ${issue.impact}\n`);
            });
        }

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        this.results.recommendations.forEach((rec, index) => {
            console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}: ${rec.issue}`);
            console.log(`      → ${rec.solution}\n`);
        });

        // Next Steps
        console.log('\n🎯 IMMEDIATE NEXT STEPS:');
        console.log('   1. Fix Node.js version: nvm use 20 && nvm alias default 20');
        console.log('   2. Verify API token: echo $CLOUDFLARE_API_TOKEN');
        console.log('   3. Test connection: node d1-diagnostic.js');
        console.log('   4. Run data sync if needed');

        console.log('\n✨ Diagnostic complete!');
    }

    /**
     * Validate Cloudflare API token format
     */
    validateTokenFormat(token) {
        // Cloudflare API tokens are typically 40 characters long and alphanumeric
        return token && token.length >= 32 && /^[A-Za-z0-9_-]+$/.test(token);
    }
}

// Main execution
async function main() {
    const diagnostic = new D1Diagnostic();
    await diagnostic.runDiagnostics();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = D1Diagnostic;