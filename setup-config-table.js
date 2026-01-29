#!/usr/bin/env node

/**
 * Setup configuration table in D1
 * This creates and populates the scraper_config table
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function setupConfigTable() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const dbName = 'Calhr';
    
    if (!apiToken) {
        console.error('❌ CLOUDFLARE_API_TOKEN environment variable is required');
        process.exit(1);
    }

    console.log('🔧 Setting up configuration table in D1...\n');

    try {
        // Create the scraper_config table
        console.log('📋 Creating scraper_config table...');
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS scraper_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `.replace(/\n/g, ' ').replace(/\s+/g, ' ');

        await execAsync(`CLOUDFLARE_API_TOKEN="${apiToken}" npx wrangler d1 execute ${dbName} --remote --command "${createTableSQL}"`);
        console.log('✅ Table created successfully\n');

        // Insert configuration values
        console.log('📝 Inserting configuration values...');
        
        const configs = [
            { key: 'account_id', value: '4b63dc7c88e2d5d5f20f08c95e5c0a59', description: 'Cloudflare Account ID' },
            { key: 'database_id', value: 'f9fe4ade-a55b-4600-bf24-64172903c2c6', description: 'D1 Database ID' },
            { key: 'database_name', value: 'Calhr', description: 'D1 Database Name' },
            { key: 'table_name', value: 'ccJobs', description: 'Jobs Table Name' },
            { key: 'max_jobs_per_page', value: '100', description: 'Maximum jobs to display per page' },
            { key: 'scraper_delay_ms', value: '2000', description: 'Delay between page scrapes in milliseconds' },
            { key: 'batch_size', value: '25', description: 'Number of jobs to insert in a single batch' }
        ];

        for (const config of configs) {
            const insertSQL = `
                INSERT OR REPLACE INTO scraper_config (key, value, description)
                VALUES ('${config.key}', '${config.value}', '${config.description}')
            `.replace(/\n/g, ' ').replace(/\s+/g, ' ');

            await execAsync(`CLOUDFLARE_API_TOKEN="${apiToken}" npx wrangler d1 execute ${dbName} --remote --command "${insertSQL}"`);
            console.log(`  ✅ ${config.key}: ${config.value}`);
        }

        console.log('\n📊 Verifying configuration...');
        const { stdout } = await execAsync(`CLOUDFLARE_API_TOKEN="${apiToken}" npx wrangler d1 execute ${dbName} --remote --command "SELECT key, value FROM scraper_config" --json`);
        
        const result = JSON.parse(stdout);
        if (result && result[0] && result[0].results) {
            console.log(`✅ Successfully loaded ${result[0].results.length} configuration items`);
            console.log('\n📋 Current configuration:');
            result[0].results.forEach(row => {
                console.log(`  • ${row.key}: ${row.value}`);
            });
        }

        console.log('\n✅ Configuration setup complete!');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    setupConfigTable();
}

module.exports = { setupConfigTable };