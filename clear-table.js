#!/usr/bin/env node

/**
 * Clear all data from ccJobs table
 */

const https = require('https');

async function clearTable() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN || '7myBlz54TNx-nwoc9AYJriIgQ9HACnAlIBuSSsp2';
    const accountId = 'a2d15074d39d49779729f74c83fc8189';
    const databaseId = 'f9fe4ade-a55b-4600-bf24-64172903c2c6';
    
    console.log('🗑️  Clearing ccJobs table...\n');
    
    // Execute DELETE query
    const sql = 'DELETE FROM ccJobs';
    const data = JSON.stringify({ sql });
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.cloudflare.com',
            port: 443,
            path: `/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    if (parsed.success) {
                        console.log('✅ Table cleared successfully!');
                        
                        // Now get count to verify
                        const countSql = 'SELECT COUNT(*) as count FROM ccJobs';
                        const countData = JSON.stringify({ sql: countSql });
                        
                        const countReq = https.request({...options, headers: {...options.headers, 'Content-Length': countData.length}}, (countRes) => {
                            let countResponse = '';
                            countRes.on('data', (chunk) => { countResponse += chunk; });
                            countRes.on('end', () => {
                                const countParsed = JSON.parse(countResponse);
                                if (countParsed.success) {
                                    console.log(`📊 Records in table: ${countParsed.result[0].results[0].count}`);
                                }
                                resolve();
                            });
                        });
                        countReq.write(countData);
                        countReq.end();
                    } else {
                        console.error('❌ Failed to clear table:', parsed.errors?.[0]?.message || 'Unknown error');
                        reject(new Error(parsed.errors?.[0]?.message || 'Failed to clear table'));
                    }
                } catch (e) {
                    console.error('❌ Failed to parse response:', e.message);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Request failed:', error.message);
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// Run if called directly
if (require.main === module) {
    clearTable().catch(console.error);
}

module.exports = { clearTable };