#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
require('dotenv').config();

async function testConnection() {
    const databaseName = process.env.D1_DATABASE_NAME;
    
    if (!databaseName) {
        console.error('❌ D1_DATABASE_NAME not found in .env file');
        console.log('Please create a .env file based on .env.example and fill in your Cloudflare D1 credentials');
        process.exit(1);
    }
    
    console.log('🔍 Testing Cloudflare D1 connection...');
    console.log(`📦 Database: ${databaseName}`);
    
    try {
        // Test with a simple query
        const { stdout, stderr } = await execAsync(`npx wrangler d1 execute ${databaseName} --command "SELECT name FROM sqlite_master WHERE type='table'"`);
        
        console.log('✅ Successfully connected to D1 database!');
        console.log('\n📋 Existing tables:');
        console.log(stdout);
        
        // Check if jobs table exists
        const { stdout: jobsCheck } = await execAsync(`npx wrangler d1 execute ${databaseName} --command "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'"`);
        
        if (jobsCheck.includes('jobs')) {
            console.log('\n✅ Jobs table exists in the database');
            
            // Get table schema
            const { stdout: schemaInfo } = await execAsync(`npx wrangler d1 execute ${databaseName} --command "PRAGMA table_info(jobs)"`);
            console.log('\n📊 Jobs table schema:');
            console.log(schemaInfo);
            
            // Count records
            const { stdout: countInfo } = await execAsync(`npx wrangler d1 execute ${databaseName} --command "SELECT COUNT(*) as count FROM jobs"`);
            console.log('\n📈 Records in jobs table:');
            console.log(countInfo);
        } else {
            console.log('\n⚠️  Jobs table does not exist yet');
            console.log('Run "npm run create-table" to create it');
        }
        
    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        if (error.stderr) {
            console.error('Error details:', error.stderr);
        }
        console.log('\n💡 Make sure you have:');
        console.log('1. Created a .env file with your D1 database name');
        console.log('2. Logged in with: npx wrangler login');
        console.log('3. Have access to the D1 database');
    }
}

testConnection();