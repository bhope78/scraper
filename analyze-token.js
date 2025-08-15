#!/usr/bin/env node

/**
 * Cloudflare API Token Analyzer
 * Comprehensive analysis of token permissions and capabilities
 */

const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class TokenAnalyzer {
    constructor() {
        this.token = process.env.CLOUDFLARE_API_TOKEN;
        this.results = {
            token: {},
            permissions: {},
            d1Access: {},
            account: {},
            issues: []
        };
    }

    async analyze() {
        console.log('🔍 Cloudflare API Token Analyzer');
        console.log('='.repeat(70));
        console.log();

        // Check if token exists
        if (!this.token) {
            console.error('❌ CLOUDFLARE_API_TOKEN environment variable not set!');
            console.log();
            console.log('To analyze your token:');
            console.log('1. Set your token: export CLOUDFLARE_API_TOKEN="your_token_here"');
            console.log('2. Run: node analyze-token.js');
            console.log();
            console.log('Or test a token directly:');
            console.log('CLOUDFLARE_API_TOKEN="your_token" node analyze-token.js');
            process.exit(1);
        }

        // Analyze token format
        await this.analyzeTokenFormat();
        
        // Verify token with Cloudflare API
        await this.verifyToken();
        
        // Check permissions
        await this.checkPermissions();
        
        // Test D1 access
        await this.testD1Access();
        
        // Test specific database
        await this.testDatabase();
        
        // Generate report
        this.generateReport();
    }

    analyzeTokenFormat() {
        console.log('📋 Token Format Analysis');
        console.log('-'.repeat(40));
        
        this.results.token.length = this.token.length;
        this.results.token.startsWithUnderscore = this.token.startsWith('_');
        this.results.token.format = 'unknown';
        
        if (this.token.startsWith('_')) {
            this.results.token.format = 'API Token (Modern)';
            console.log('✅ Token format: API Token (starts with _)');
        } else if (this.token.length === 37) {
            this.results.token.format = 'Global API Key (Legacy)';
            console.log('⚠️  Token format: Global API Key (legacy)');
            this.results.issues.push('Using legacy Global API Key - recommend switching to API Token');
        } else {
            this.results.token.format = 'Unknown';
            console.log('❌ Token format: Unrecognized');
            this.results.issues.push('Token format not recognized');
        }
        
        console.log(`   Length: ${this.token.length} characters`);
        console.log(`   First 10 chars: ${this.token.substring(0, 10)}...`);
        console.log();
    }

    async verifyToken() {
        console.log('🔐 Token Verification');
        console.log('-'.repeat(40));
        
        try {
            const response = await this.makeAPICall('/user/tokens/verify');
            
            if (response.success) {
                console.log('✅ Token is valid and active');
                this.results.token.valid = true;
                this.results.token.status = response.result.status;
                this.results.token.id = response.result.id;
                console.log(`   Token ID: ${response.result.id}`);
                console.log(`   Status: ${response.result.status}`);
                
                // Get token details if available
                if (response.result.policies) {
                    this.results.permissions.policies = response.result.policies;
                }
            } else {
                console.log('❌ Token verification failed');
                this.results.token.valid = false;
                this.results.issues.push('Token verification failed');
                if (response.errors) {
                    response.errors.forEach(err => {
                        console.log(`   Error: ${err.message}`);
                        this.results.issues.push(err.message);
                    });
                }
            }
        } catch (error) {
            console.log('❌ Failed to verify token');
            console.log(`   Error: ${error.message}`);
            this.results.token.valid = false;
            this.results.issues.push(`Token verification error: ${error.message}`);
        }
        console.log();
    }

    async checkPermissions() {
        console.log('🔑 Permission Analysis');
        console.log('-'.repeat(40));
        
        try {
            // Try to get user info
            const userResponse = await this.makeAPICall('/user');
            if (userResponse.success) {
                this.results.account.email = userResponse.result.email;
                console.log(`✅ Account: ${userResponse.result.email}`);
            }
            
            // Try to get account info
            const accountsResponse = await this.makeAPICall('/accounts');
            if (accountsResponse.success && accountsResponse.result.length > 0) {
                const account = accountsResponse.result[0];
                this.results.account.id = account.id;
                this.results.account.name = account.name;
                console.log(`✅ Account ID: ${account.id}`);
                console.log(`   Account Name: ${account.name}`);
                
                // Check if this is the expected account
                const expectedAccountId = 'aa3156a55993be3bb2b637b7619ddc23';
                if (account.id === expectedAccountId) {
                    console.log('   ✅ This is the correct account for your D1 database');
                    this.results.account.correct = true;
                } else {
                    console.log(`   ⚠️  Different account ID (expected: ${expectedAccountId})`);
                    this.results.account.correct = false;
                    this.results.issues.push('Token is for a different Cloudflare account');
                }
            } else {
                console.log('❌ Cannot access account information');
                this.results.issues.push('Cannot access account information - missing permissions');
            }
        } catch (error) {
            console.log('❌ Failed to check permissions');
            console.log(`   Error: ${error.message}`);
            this.results.issues.push(`Permission check failed: ${error.message}`);
        }
        console.log();
    }

    async testD1Access() {
        console.log('💾 D1 Database Access Test');
        console.log('-'.repeat(40));
        
        try {
            // Test with wrangler
            console.log('Testing D1 access with wrangler...');
            const { stdout, stderr } = await execAsync(
                `CLOUDFLARE_API_TOKEN="${this.token}" npx wrangler d1 list --json`,
                { timeout: 30000 }
            );
            
            if (stderr && !stderr.includes('Fetching') && !stderr.includes('wrangler')) {
                console.log(`⚠️  Wrangler stderr: ${stderr}`);
            }
            
            const databases = JSON.parse(stdout);
            this.results.d1Access.hasAccess = true;
            this.results.d1Access.databases = databases;
            
            console.log(`✅ D1 access confirmed! Found ${databases.length} database(s):`);
            databases.forEach(db => {
                console.log(`   - ${db.name} (${db.uuid})`);
                if (db.name === 'Calhr') {
                    this.results.d1Access.hasCalhr = true;
                    this.results.d1Access.calhrId = db.uuid;
                }
            });
            
            if (!this.results.d1Access.hasCalhr) {
                console.log();
                console.log('⚠️  Calhr database not found in this account');
                this.results.issues.push('Calhr database not found - may be in different account');
            }
            
        } catch (error) {
            console.log('❌ D1 access test failed');
            this.results.d1Access.hasAccess = false;
            this.results.issues.push('No D1 access - missing D1 permissions');
            
            if (error.message.includes('Wrangler requires')) {
                console.log('   Issue: Node.js version incompatibility');
                this.results.issues.push('Node.js version issue');
            } else if (error.message.includes('Authentication')) {
                console.log('   Issue: Authentication failed');
                this.results.issues.push('D1 authentication failed');
            } else {
                console.log(`   Error: ${error.message}`);
            }
        }
        console.log();
    }

    async testDatabase() {
        if (!this.results.d1Access.hasCalhr) {
            console.log('⏭️  Skipping database test (Calhr not found)');
            console.log();
            return;
        }
        
        console.log('📊 Calhr Database Test');
        console.log('-'.repeat(40));
        
        try {
            const { stdout } = await execAsync(
                `CLOUDFLARE_API_TOKEN="${this.token}" npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) as count FROM ccJobs" --json`,
                { timeout: 30000 }
            );
            
            const result = JSON.parse(stdout);
            const count = result[0].results[0].count;
            
            console.log('✅ Successfully queried Calhr database');
            console.log(`   Records in ccJobs table: ${count}`);
            this.results.d1Access.recordCount = count;
            this.results.d1Access.canQuery = true;
            
        } catch (error) {
            console.log('❌ Failed to query Calhr database');
            console.log(`   Error: ${error.message}`);
            this.results.d1Access.canQuery = false;
            this.results.issues.push('Cannot query Calhr database');
        }
        console.log();
    }

    async makeAPICall(endpoint) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.cloudflare.com',
                path: `/client/v4${endpoint}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    generateReport() {
        console.log('='.repeat(70));
        console.log('📊 TOKEN ANALYSIS REPORT');
        console.log('='.repeat(70));
        console.log();
        
        // Overall status
        const isWorking = this.results.token.valid && 
                         this.results.d1Access.hasAccess && 
                         this.results.d1Access.hasCalhr &&
                         this.results.account.correct;
        
        if (isWorking) {
            console.log('✅ TOKEN IS PROPERLY CONFIGURED FOR GITHUB ACTIONS');
            console.log();
            console.log('This token has all required permissions and access.');
            console.log('It should work in your GitHub Actions workflow.');
        } else {
            console.log('❌ TOKEN NEEDS CONFIGURATION');
            console.log();
            console.log('Issues found:');
            this.results.issues.forEach((issue, i) => {
                console.log(`${i + 1}. ${issue}`);
            });
        }
        
        console.log();
        console.log('📋 Token Details:');
        console.log(`   Valid: ${this.results.token.valid ? '✅ Yes' : '❌ No'}`);
        console.log(`   Format: ${this.results.token.format}`);
        console.log(`   Account: ${this.results.account.email || 'Unknown'}`);
        console.log(`   Account ID: ${this.results.account.id || 'Unknown'}`);
        console.log(`   Correct Account: ${this.results.account.correct ? '✅ Yes' : '❌ No'}`);
        console.log();
        
        console.log('📋 D1 Access:');
        console.log(`   Has D1 Access: ${this.results.d1Access.hasAccess ? '✅ Yes' : '❌ No'}`);
        console.log(`   Calhr Database Found: ${this.results.d1Access.hasCalhr ? '✅ Yes' : '❌ No'}`);
        console.log(`   Can Query Database: ${this.results.d1Access.canQuery ? '✅ Yes' : '❌ No'}`);
        if (this.results.d1Access.recordCount !== undefined) {
            console.log(`   Records in ccJobs: ${this.results.d1Access.recordCount}`);
        }
        console.log();
        
        // Recommendations
        console.log('💡 RECOMMENDATIONS:');
        console.log('-'.repeat(40));
        
        if (!this.results.token.valid) {
            console.log('1. Generate a new API token at:');
            console.log('   https://dash.cloudflare.com/profile/api-tokens');
            console.log();
        }
        
        if (!this.results.d1Access.hasAccess) {
            console.log('1. Your token needs D1 permissions:');
            console.log('   - Account → D1 → Edit');
            console.log('   - Account → Account Settings → Read');
            console.log();
        }
        
        if (!this.results.account.correct) {
            console.log('1. This token is for a different Cloudflare account.');
            console.log('   Generate a token from the account that owns the Calhr database.');
            console.log('   Expected account ID: aa3156a55993be3bb2b637b7619ddc23');
            console.log();
        }
        
        if (isWorking) {
            console.log('1. Update your GitHub Secret:');
            console.log('   - Go to: https://github.com/bhope78/scraper/settings/secrets/actions');
            console.log('   - Update CLOUDFLARE_API_TOKEN with this token');
            console.log('   - Make sure to paste WITHOUT quotes');
            console.log();
        }
        
        console.log('='.repeat(70));
        console.log('Analysis complete!');
    }
}

// Run analyzer
const analyzer = new TokenAnalyzer();
analyzer.analyze().catch(console.error);