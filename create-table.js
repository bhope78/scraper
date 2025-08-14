#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read the schema SQL
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Function to execute wrangler d1 command
function executeD1Command(sql) {
    const databaseName = process.env.D1_DATABASE_NAME;
    
    if (!databaseName) {
        console.error('❌ D1_DATABASE_NAME not found in .env file');
        console.log('Please create a .env file based on .env.example and fill in your Cloudflare D1 credentials');
        process.exit(1);
    }

    // Split SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    console.log('🚀 Creating jobs table in Cloudflare D1...');
    console.log(`📦 Database: ${databaseName}`);
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    let completed = 0;
    
    statements.forEach((statement, index) => {
        if (statement.trim()) {
            const cleanStatement = statement.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
            
            const command = `npx wrangler d1 execute ${databaseName} --command "${cleanStatement}"`;
            
            exec(command, (error, stdout, stderr) => {
                completed++;
                
                if (error) {
                    console.error(`❌ Error executing statement ${index + 1}:`, error.message);
                    if (stderr) console.error('Stderr:', stderr);
                } else {
                    console.log(`✅ Statement ${index + 1}/${statements.length} executed successfully`);
                    if (stdout) console.log(stdout);
                }
                
                if (completed === statements.length) {
                    console.log('\n✨ Table creation process completed!');
                    console.log('You can now run migrate-data.js to copy data from PostgreSQL');
                }
            });
        }
    });
}

// Alternative method using D1 API directly
async function createTableViaAPI() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const databaseId = process.env.D1_DATABASE_ID;
    
    if (!accountId || !apiToken || !databaseId) {
        console.error('❌ Missing Cloudflare credentials in .env file');
        console.log('Please ensure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and D1_DATABASE_ID are set');
        process.exit(1);
    }
    
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: schema
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Table created successfully via API!');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.error('❌ Failed to create table:', result.errors);
        }
    } catch (error) {
        console.error('❌ Error creating table via API:', error);
    }
}

// Check if wrangler is installed
exec('npx wrangler --version', (error) => {
    if (error) {
        console.log('⚠️  Wrangler not found, using API method...');
        createTableViaAPI();
    } else {
        console.log('📦 Using Wrangler CLI to create table...');
        executeD1Command(schema);
    }
});