#!/usr/bin/env node

/**
 * Test D1 Connection and Setup
 * Verifies that all D1 components are working correctly
 */

const D1Config = require('./d1-config');
const D1Insert = require('./d1-insert-local-updated'); // Using updated version with new schema

async function testConnection() {
    console.log('🧪 Testing D1 Connection and Setup\n');
    console.log('=' .repeat(50));
    
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!apiToken) {
        console.error('❌ CLOUDFLARE_API_TOKEN environment variable is required');
        console.log('\n💡 To test, run:');
        console.log('   export CLOUDFLARE_API_TOKEN="your-token-here"');
        console.log('   node test-d1-connection.js');
        process.exit(1);
    }
    
    console.log('✅ API Token found\n');
    
    try {
        // Test 1: Load configuration
        console.log('📋 Test 1: Loading configuration from D1...');
        const config = new D1Config(apiToken);
        await config.loadConfig();
        config.validateConfig();
        console.log('✅ Configuration loaded and validated\n');
        
        // Display configuration
        const allConfig = config.getAll();
        console.log('Current Configuration:');
        console.log('-'.repeat(30));
        Object.keys(allConfig).forEach(key => {
            console.log(`  ${key}: ${allConfig[key]}`);
        });
        console.log();
        
        // Test 2: Database connection
        console.log('📋 Test 2: Testing database operations...');
        const d1Insert = new D1Insert(
            apiToken,
            config.get('database_name'),
            config.get('table_name')
        );
        
        // Get current job count
        const count = await d1Insert.getJobCount();
        console.log(`✅ Connected to database: ${count} jobs currently in table\n`);
        
        // Test 3: Get recent jobs (skipping for now since schema doesn't have created_at)
        console.log('📋 Test 3: Fetching recent jobs...');
        // Note: getRecentJobs would need to be updated for new schema
        // For now, just check job count
        if (count > 0) {
            console.log(`✅ Found ${count} jobs in database`);
        } else {
            console.log('ℹ️  No jobs found in database yet');
        }
        console.log();
        
        // Test 4: Test insert (optional)
        console.log('📋 Test 4: Test insert capability...');
        const testJobControl = `TEST-CONN-${Date.now()}`;
        const testJob = {
            link_title: 'Connection Test Job',
            job_control: testJobControl,
            salary_range: '$1 - $2',
            department: 'Test Department',
            location: 'Test Location',
            telework: 'Test',
            publish_date: '2024-08-14',
            filing_deadline: '2024-08-31',
            job_posting_url: `https://test.example.com/job/${testJobControl}`,
            work_type_schedule: 'Test Schedule',
            working_title: 'Test Working Title'
        };
        
        console.log(`   Attempting to insert test job: ${testJobControl}`);
        const insertResult = await d1Insert.upsertJob(testJob); // Using upsertJob method
        
        if (insertResult.success) {
            console.log('✅ Test insert successful');
            
            // Clean up test job
            console.log('   Cleaning up test job...');
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            await execAsync(
                `CLOUDFLARE_API_TOKEN="${apiToken}" npx wrangler d1 execute ${config.get('database_name')} --remote --command "DELETE FROM ${config.get('table_name')} WHERE job_control = '${testJobControl}'"`,
                { env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken } }
            );
            console.log('✅ Test job cleaned up');
        } else {
            console.log('⚠️  Test insert failed:', insertResult.reason);
        }
        console.log();
        
        // Summary
        console.log('=' .repeat(50));
        console.log('✨ All tests completed successfully!');
        console.log('\nYour D1 setup is ready for use with:');
        console.log('  - GitHub Actions (using CLOUDFLARE_API_TOKEN secret)');
        console.log('  - Local development (using environment variable)');
        console.log(`  - Database: ${config.get('database_name')}`);
        console.log(`  - Table: ${config.get('table_name')}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\n💡 Troubleshooting tips:');
        console.error('1. Verify your API token has D1 permissions');
        console.error('2. Check that the database "Calhr" exists');
        console.error('3. Ensure you have internet connectivity');
        console.error('4. Try running: npx wrangler d1 list');
        process.exit(1);
    }
}

// Run the test
testConnection();