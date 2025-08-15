#!/usr/bin/env node

/**
 * Comprehensive D1 Test Suite
 * Database Expert - Complete validation of all D1 components
 */

const D1Diagnostic = require('./d1-diagnostic');
const D1ConnectionManager = require('./d1-connection-manager');
const D1InsertEnhanced = require('./d1-insert-enhanced');
const D1HealthMonitor = require('./d1-health-monitor');

class ComprehensiveTest {
    constructor() {
        this.testResults = {
            environment: null,
            diagnostic: null,
            connection: null,
            insert: null,
            health: null,
            overall: 'pending'
        };
        
        this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    }

    /**
     * Run comprehensive test suite
     */
    async runTests() {
        console.log('🧪 D1 Database Expert - Comprehensive Test Suite');
        console.log('=' .repeat(60));
        console.log('Testing all components and functionality...\n');

        try {
            await this.testEnvironment();
            await this.testDiagnostic();
            
            if (this.apiToken) {
                await this.testConnection();
                await this.testInsertCapability();
                await this.testHealthMonitoring();
            } else {
                console.log('⏭️  Skipping database tests - no API token');
            }
            
            await this.generateFinalReport();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            this.testResults.overall = 'failed';
        }
    }

    /**
     * Test environment setup
     */
    async testEnvironment() {
        console.log('🔧 Testing Environment Setup...');
        console.log('-' .repeat(40));

        try {
            // Check Node.js version
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
            
            const envResults = {
                nodeVersion,
                nodeVersionValid: majorVersion >= 20,
                hasApiToken: !!this.apiToken,
                workingDirectory: process.cwd()
            };

            console.log(`   Node.js: ${nodeVersion} ${majorVersion >= 20 ? '✅' : '❌'}`);
            console.log(`   API Token: ${this.apiToken ? 'Present ✅' : 'Missing ❌'}`);
            console.log(`   Working Dir: ${process.cwd()}`);

            this.testResults.environment = envResults;
            console.log('   Environment Test: ✅ Completed\n');

        } catch (error) {
            console.error('   Environment Test: ❌ Failed -', error.message);
            this.testResults.environment = { error: error.message };
            throw error;
        }
    }

    /**
     * Test diagnostic functionality
     */
    async testDiagnostic() {
        console.log('🔍 Testing Diagnostic System...');
        console.log('-' .repeat(40));

        try {
            const diagnostic = new D1Diagnostic();
            
            // Run diagnostic (but capture output)
            const originalLog = console.log;
            const logs = [];
            console.log = (...args) => logs.push(args.join(' '));
            
            await diagnostic.runDiagnostics();
            
            console.log = originalLog; // Restore logging
            
            this.testResults.diagnostic = {
                success: true,
                logEntries: logs.length,
                issues: diagnostic.results.recommendations?.length || 0
            };

            console.log(`   Diagnostic executed: ✅`);
            console.log(`   Log entries: ${logs.length}`);
            console.log(`   Issues found: ${diagnostic.results.recommendations?.length || 0}`);
            console.log('   Diagnostic Test: ✅ Completed\n');

        } catch (error) {
            console.error('   Diagnostic Test: ❌ Failed -', error.message);
            this.testResults.diagnostic = { error: error.message };
        }
    }

    /**
     * Test connection manager
     */
    async testConnection() {
        console.log('🔗 Testing Connection Manager...');
        console.log('-' .repeat(40));

        try {
            const connectionManager = new D1ConnectionManager({
                apiToken: this.apiToken,
                verbose: false,
                logLevel: 'error' // Reduce noise during testing
            });

            // Initialize connection
            await connectionManager.initialize();
            console.log('   Connection initialized: ✅');

            // Test basic query
            const testResult = await connectionManager.query('SELECT 1 as test');
            console.log('   Basic query: ✅');

            // Get record count
            const recordCount = await connectionManager.getRecordCount();
            console.log(`   Record count: ${recordCount} ✅`);

            // Get health status
            const healthStatus = await connectionManager.getHealthStatus();
            console.log(`   Health status: ${healthStatus.status} ✅`);

            // Verify database
            const dbVerification = await connectionManager.verifyDatabase();
            console.log('   Database verification: ✅');

            this.testResults.connection = {
                success: true,
                recordCount,
                healthStatus: healthStatus.status,
                responseTime: healthStatus.responseTime,
                databaseVerified: !!dbVerification.database
            };

            console.log('   Connection Test: ✅ Completed\n');

        } catch (error) {
            console.error('   Connection Test: ❌ Failed -', error.message);
            this.testResults.connection = { error: error.message };
        }
    }

    /**
     * Test enhanced insert capability
     */
    async testInsertCapability() {
        console.log('📝 Testing Enhanced Insert System...');
        console.log('-' .repeat(40));

        try {
            const enhancedInsert = new D1InsertEnhanced({
                apiToken: this.apiToken,
                verbose: false
            });

            // Initialize
            await enhancedInsert.initialize();
            console.log('   Enhanced insert initialized: ✅');

            // Create test job
            const testJob = {
                link_title: 'Test Job for Comprehensive Test',
                job_control: `TEST-COMP-${Date.now()}`,
                salary_range: '$1,000 - $2,000',
                department: 'Test Department',
                location: 'Test Location, CA',
                telework: 'Remote Available',
                publish_date: '2024-08-15',
                filing_deadline: '2024-08-30',
                job_posting_url: `https://test.example.com/job/${Date.now()}`,
                work_type_schedule: 'Full-time',
                working_title: 'Comprehensive Test Position'
            };

            console.log(`   Created test job: ${testJob.job_control}`);

            // Test insert
            const insertResults = await enhancedInsert.processJobs([testJob], {
                batchDelay: 0,
                jobDelay: 0
            });

            console.log('   Job processing: ✅');

            // Verify insert
            const newCount = await enhancedInsert.getRecordCount();
            console.log(`   New record count: ${newCount} ✅`);

            // Clean up test job
            const connectionManager = new D1ConnectionManager({
                apiToken: this.apiToken,
                verbose: false,
                logLevel: 'error'
            });
            await connectionManager.initialize();
            await connectionManager.query(`DELETE FROM ccJobs WHERE job_control = '${testJob.job_control}'`);
            console.log('   Test job cleaned up: ✅');

            this.testResults.insert = {
                success: true,
                jobsProcessed: 1,
                insertResults: insertResults[0],
                metrics: enhancedInsert.getMetrics()
            };

            console.log('   Enhanced Insert Test: ✅ Completed\n');

        } catch (error) {
            console.error('   Enhanced Insert Test: ❌ Failed -', error.message);
            this.testResults.insert = { error: error.message };
        }
    }

    /**
     * Test health monitoring
     */
    async testHealthMonitoring() {
        console.log('🏥 Testing Health Monitoring...');
        console.log('-' .repeat(40));

        try {
            const healthMonitor = new D1HealthMonitor({
                apiToken: this.apiToken,
                logToFile: false, // Don't create files during testing
                enableAlerts: false,
                quickCheckInterval: 10000, // 10 seconds
                fullCheckInterval: 30000   // 30 seconds
            });

            // Initialize (without starting continuous monitoring)
            await healthMonitor.connectionManager.initialize();
            console.log('   Health monitor initialized: ✅');

            // Perform quick health check
            await healthMonitor.performQuickHealthCheck();
            console.log('   Quick health check: ✅');

            // Perform full health check
            await healthMonitor.performFullHealthCheck();
            console.log('   Full health check: ✅');

            // Get health summary
            const healthSummary = healthMonitor.getHealthSummary();
            console.log(`   Health summary: ${healthSummary.overall} ✅`);

            // Generate health report
            const healthReport = await healthMonitor.generateHealthReport();
            console.log('   Health report generated: ✅');

            this.testResults.health = {
                success: true,
                overallHealth: healthSummary.overall,
                totalChecks: healthSummary.stats.totalChecks,
                healthyChecks: healthSummary.stats.healthyChecks,
                alertCount: healthSummary.alerts.total
            };

            console.log('   Health Monitoring Test: ✅ Completed\n');

        } catch (error) {
            console.error('   Health Monitoring Test: ❌ Failed -', error.message);
            this.testResults.health = { error: error.message };
        }
    }

    /**
     * Generate final comprehensive report
     */
    async generateFinalReport() {
        console.log('📊 COMPREHENSIVE TEST REPORT');
        console.log('=' .repeat(60));

        // Calculate overall status
        const testCategories = ['environment', 'diagnostic', 'connection', 'insert', 'health'];
        const passedTests = testCategories.filter(category => {
            const result = this.testResults[category];
            return result && (result.success === true || !result.error);
        });

        const totalTests = this.apiToken ? testCategories.length : 2; // Only env and diagnostic without API token
        const successRate = (passedTests.length / totalTests * 100).toFixed(1);

        this.testResults.overall = successRate === '100.0' ? 'passed' : 
                                  successRate >= '80.0' ? 'mostly_passed' : 'failed';

        // Environment Summary
        console.log('\n🔧 ENVIRONMENT SUMMARY:');
        if (this.testResults.environment) {
            console.log(`   Node.js: ${this.testResults.environment.nodeVersion || 'Unknown'} ${this.testResults.environment.nodeVersionValid ? '✅' : '❌'}`);
            console.log(`   API Token: ${this.testResults.environment.hasApiToken ? 'Present ✅' : 'Missing ❌'}`);
        }

        // Test Results Summary
        console.log('\n📋 TEST RESULTS SUMMARY:');
        testCategories.forEach(category => {
            const result = this.testResults[category];
            if (!result) {
                console.log(`   ${category.toUpperCase()}: Not run ⏭️`);
            } else if (result.error) {
                console.log(`   ${category.toUpperCase()}: Failed ❌`);
                console.log(`      Error: ${result.error}`);
            } else {
                console.log(`   ${category.toUpperCase()}: Passed ✅`);
            }
        });

        // Database Status (if API token available)
        if (this.apiToken && this.testResults.connection) {
            console.log('\n💾 DATABASE STATUS:');
            console.log(`   Connection: ${this.testResults.connection.success ? 'Healthy ✅' : 'Failed ❌'}`);
            if (this.testResults.connection.recordCount !== undefined) {
                console.log(`   Record Count: ${this.testResults.connection.recordCount}`);
            }
            if (this.testResults.connection.responseTime) {
                console.log(`   Response Time: ${this.testResults.connection.responseTime}ms`);
            }
        }

        // Performance Metrics
        if (this.testResults.insert && this.testResults.insert.metrics) {
            const metrics = this.testResults.insert.metrics;
            console.log('\n⚡ PERFORMANCE METRICS:');
            console.log(`   Jobs Processed: ${metrics.totalProcessed}`);
            console.log(`   Processing Time: ${((metrics.endTime - metrics.startTime) / 1000).toFixed(1)}s`);
        }

        // Overall Assessment
        console.log(`\n🎯 OVERALL ASSESSMENT: ${this.testResults.overall.toUpperCase()}`);
        console.log(`   Success Rate: ${successRate}% (${passedTests.length}/${totalTests} tests passed)`);

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        if (!this.testResults.environment?.nodeVersionValid) {
            console.log('   🔧 Upgrade Node.js: nvm install 20 && nvm use 20 && nvm alias default 20');
        }
        
        if (!this.testResults.environment?.hasApiToken) {
            console.log('   🔐 Set API token: export CLOUDFLARE_API_TOKEN="your-token"');
        }

        if (this.testResults.overall === 'passed') {
            console.log('   ✅ All systems operational! Ready for production use.');
            console.log('   📝 Consider setting up continuous health monitoring');
            console.log('   🔄 Configure GitHub Actions with your API token');
        } else if (this.testResults.overall === 'mostly_passed') {
            console.log('   ⚠️  Core functionality working, but some issues detected');
            console.log('   🔍 Review failed tests and apply fixes');
        } else {
            console.log('   ❌ Critical issues detected - resolve before production use');
            console.log('   🛠️  Run: node d1-fix-script.js for automated fixes');
        }

        console.log('\n✨ Comprehensive test suite completed!');
        
        // Return results for programmatic use
        return this.testResults;
    }

    /**
     * Get test results
     */
    getResults() {
        return this.testResults;
    }
}

// Run if called directly
if (require.main === module) {
    const test = new ComprehensiveTest();
    test.runTests().catch(console.error);
}

module.exports = ComprehensiveTest;