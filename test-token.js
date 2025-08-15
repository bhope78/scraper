#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testToken() {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!token) {
        console.error('❌ No CLOUDFLARE_API_TOKEN environment variable found');
        console.log('\nTo test your token, run:');
        console.log('export CLOUDFLARE_API_TOKEN="your-token-here"');
        console.log('node test-token.js');
        return;
    }

    console.log('🔍 Testing Cloudflare API Token');
    console.log('=' .repeat(50));
    console.log(`✅ Token found (${token.length} characters)`);
    console.log(`First 10 chars: ${token.substring(0, 10)}...`);
    console.log();

    // Test 1: Verify token with Cloudflare API
    console.log('📋 Test 1: Verify token with Cloudflare...');
    try {
        const { stdout, stderr } = await execAsync(
            `curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json"`
        );
        
        const result = JSON.parse(stdout);
        if (result.success) {
            console.log('✅ Token is valid!');
            console.log(`   Status: ${result.result.status}`);
            console.log(`   Token ID: ${result.result.id}`);
        } else {
            console.log('❌ Token is invalid');
            console.log('   Errors:', result.errors);
        }
    } catch (error) {
        console.error('❌ Failed to verify token:', error.message);
    }

    console.log();

    // Test 2: List D1 databases
    console.log('📋 Test 2: List D1 databases...');
    try {
        const command = `CLOUDFLARE_API_TOKEN="${token}" npx wrangler d1 list --json`;
        const { stdout, stderr } = await execAsync(command);
        
        const databases = JSON.parse(stdout);
        console.log(`✅ Found ${databases.length} D1 database(s):`);
        databases.forEach(db => {
            console.log(`   - ${db.name} (ID: ${db.uuid})`);
        });
    } catch (error) {
        console.error('❌ Failed to list D1 databases:', error.message);
        console.log('   This likely means the token lacks D1 permissions');
    }

    console.log();

    // Test 3: Test specific database access
    console.log('📋 Test 3: Test Calhr database access...');
    try {
        const command = `CLOUDFLARE_API_TOKEN="${token}" npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) as count FROM ccJobs" --json`;
        const { stdout, stderr } = await execAsync(command);
        
        const result = JSON.parse(stdout);
        if (result[0].results) {
            const count = result[0].results[0].count;
            console.log(`✅ Successfully accessed Calhr database`);
            console.log(`   Found ${count} records in ccJobs table`);
        }
    } catch (error) {
        console.error('❌ Failed to access Calhr database:', error.message);
        console.log('   The database might not exist or token lacks permission');
    }

    console.log();
    console.log('=' .repeat(50));
    console.log('📊 Summary:');
    console.log('If all tests passed, your token is configured correctly.');
    console.log('If tests failed, you need to:');
    console.log('1. Generate a new token with D1 permissions');
    console.log('2. Make sure the token is for the correct Cloudflare account');
}

testToken();