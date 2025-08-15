#!/usr/bin/env node

/**
 * Fix wrangler authentication in GitHub Actions
 * This script sets up proper authentication for wrangler commands
 */

const { execSync } = require('child_process');

async function fixWranglerAuth() {
    console.log('🔧 Fixing wrangler authentication...');
    
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
        console.error('❌ CLOUDFLARE_API_TOKEN not set!');
        process.exit(1);
    }
    
    console.log('✅ Token found, length:', token.length);
    
    // Set the account ID explicitly
    const accountId = 'aa3156a55993be3bb2b637b7619ddc23';
    
    try {
        // Test with explicit account ID
        console.log('🔍 Testing wrangler with explicit account ID...');
        const cmd = `CLOUDFLARE_ACCOUNT_ID="${accountId}" CLOUDFLARE_API_TOKEN="${token}" npx wrangler d1 list --json`;
        
        const result = execSync(cmd, { 
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        console.log('✅ Wrangler authentication successful!');
        const databases = JSON.parse(result);
        console.log(`Found ${databases.length} database(s)`);
        
        // Export for use in other scripts
        console.log(`::set-output name=account_id::${accountId}`);
        console.log(`export CLOUDFLARE_ACCOUNT_ID="${accountId}"`);
        
    } catch (error) {
        console.error('❌ Wrangler authentication failed');
        console.error('Error:', error.message);
        
        // Try alternative method
        console.log('🔍 Trying alternative authentication method...');
        
        try {
            // Create wrangler.toml temporarily
            const fs = require('fs');
            const wranglerConfig = `
name = "d1-scraper"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "Calhr"
database_id = "fcde85de-7c22-46a5-8eaf-f68a7aa0c1b9"
`;
            
            fs.writeFileSync('wrangler.toml', wranglerConfig);
            console.log('✅ Created temporary wrangler.toml');
            
            // Try again with config file
            const result2 = execSync(`CLOUDFLARE_API_TOKEN="${token}" npx wrangler d1 list --json`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            console.log('✅ Alternative method worked!');
            
        } catch (altError) {
            console.error('❌ Alternative method also failed');
            process.exit(1);
        }
    }
}

fixWranglerAuth().catch(console.error);