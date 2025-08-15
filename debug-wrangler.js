#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function debugWrangler() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    
    console.log('🔍 Debug Wrangler Commands');
    console.log('=' .repeat(50));
    console.log(`API Token present: ${apiToken ? 'Yes' : 'No'}`);
    console.log(`API Token length: ${apiToken ? apiToken.length : 0}`);
    console.log(`First 10 chars: ${apiToken ? apiToken.substring(0, 10) + '...' : 'N/A'}`);
    console.log();

    // Test 1: Simple count query
    console.log('Test 1: Simple COUNT query');
    try {
        const command = `npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) as count FROM ccJobs" --json`;
        console.log(`Command: ${command}`);
        
        const { stdout, stderr } = await execAsync(command, {
            env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken }
        });
        
        if (stderr) {
            console.log('Stderr:', stderr);
        }
        
        console.log('Result:', stdout);
        const result = JSON.parse(stdout);
        console.log('Parsed count:', result[0].results[0].count);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stderr) {
            console.error('Stderr:', error.stderr);
        }
        if (error.stdout) {
            console.error('Stdout:', error.stdout);
        }
    }

    console.log();
    console.log('Test 2: Using explicit token in command');
    try {
        const command = `CLOUDFLARE_API_TOKEN="${apiToken}" npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) as count FROM ccJobs" --json`;
        console.log(`Command: CLOUDFLARE_API_TOKEN="***" npx wrangler...`);
        
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr) {
            console.log('Stderr:', stderr);
        }
        
        console.log('Result:', stdout);
        const result = JSON.parse(stdout);
        console.log('Parsed count:', result[0].results[0].count);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stderr) {
            console.error('Stderr:', error.stderr);
        }
    }
}

debugWrangler();