#!/usr/bin/env node

/**
 * Token Validator and Health Monitor
 * Comprehensive validation of Cloudflare API tokens and D1 permissions
 */

const AuthManager = require('./auth-manager');

class TokenValidator {
    constructor() {
        this.authManager = new AuthManager();
        this.healthChecks = [];
    }

    /**
     * Run comprehensive token validation
     */
    async validateComprehensive() {
        console.log('🔍 Starting comprehensive token validation...\n');
        console.log('=' .repeat(60));

        const results = {
            authentication: null,
            tokenInfo: null,
            permissions: null,
            d1Access: null,
            overallStatus: 'unknown'
        };

        try {
            // Step 1: Authentication
            console.log('\n📋 Step 1: Authentication Test');
            console.log('-'.repeat(40));
            await this.authManager.initialize();
            results.authentication = {
                status: 'success',
                method: this.authManager.authMethod,
                diagnostics: this.authManager.getDiagnostics()
            };
            console.log(`✅ Authentication successful via ${this.authManager.authMethod}`);

            // Step 2: Token Information
            console.log('\n📋 Step 2: Token Information');
            console.log('-'.repeat(40));
            const tokenInfo = await this.authManager.validateToken();
            results.tokenInfo = {
                status: 'success',
                info: tokenInfo
            };
            this.displayTokenInfo(tokenInfo);

            // Step 3: Permission Check
            console.log('\n📋 Step 3: Permission Analysis');
            console.log('-'.repeat(40));
            const permissionCheck = await this.checkPermissions(tokenInfo);
            results.permissions = permissionCheck;

            // Step 4: D1 Access Test
            console.log('\n📋 Step 4: D1 Database Access');
            console.log('-'.repeat(40));
            const d1Check = await this.testD1Access();
            results.d1Access = d1Check;

            // Overall status
            results.overallStatus = this.determineOverallStatus(results);

            // Display summary
            this.displaySummary(results);

            return results;

        } catch (error) {
            console.error(`\n❌ Validation failed: ${error.message}`);
            results.overallStatus = 'failed';
            results.error = error.message;
            return results;
        }
    }

    /**
     * Display token information
     */
    displayTokenInfo(tokenInfo) {
        console.log(`   Token ID: ${tokenInfo.id}`);
        console.log(`   Status: ${tokenInfo.status}`);
        console.log(`   Created: ${new Date(tokenInfo.issued_on).toLocaleDateString()}`);
        console.log(`   Expires: ${tokenInfo.expires_on ? new Date(tokenInfo.expires_on).toLocaleDateString() : 'Never'}`);
        console.log(`   Last Used: ${tokenInfo.last_used_on ? new Date(tokenInfo.last_used_on).toLocaleDateString() : 'Never'}`);
    }

    /**
     * Check token permissions
     */
    async checkPermissions(tokenInfo) {
        const permissions = {
            status: 'unknown',
            hasAccountAccess: false,
            hasD1Access: false,
            hasZoneAccess: false,
            details: []
        };

        try {
            if (tokenInfo.policies && tokenInfo.policies.length > 0) {
                for (const policy of tokenInfo.policies) {
                    const detail = {
                        effect: policy.effect,
                        resources: policy.resources || [],
                        permission_groups: policy.permission_groups || []
                    };

                    // Check for account access
                    if (policy.resources?.some(r => r.includes('account:') || r === '*')) {
                        permissions.hasAccountAccess = true;
                    }

                    // Check for D1 specific permissions
                    const d1Permissions = ['com.cloudflare.api.account.d1'];
                    if (policy.permission_groups?.some(pg => 
                        pg.id && d1Permissions.includes(pg.id) || 
                        pg.name && pg.name.toLowerCase().includes('d1')
                    )) {
                        permissions.hasD1Access = true;
                    }

                    // Check for zone access
                    if (policy.resources?.some(r => r.includes('zone:') || r === '*')) {
                        permissions.hasZoneAccess = true;
                    }

                    permissions.details.push(detail);
                }

                permissions.status = 'analyzed';
                
                console.log(`   Account Access: ${permissions.hasAccountAccess ? '✅' : '❌'}`);
                console.log(`   D1 Access: ${permissions.hasD1Access ? '✅' : '⚠️ '}`);
                console.log(`   Zone Access: ${permissions.hasZoneAccess ? '✅' : '❌'}`);

                if (!permissions.hasD1Access) {
                    console.log('   ⚠️  Warning: D1-specific permissions not explicitly found');
                    console.log('   🔍 This may still work with broad account permissions');
                }

            } else {
                console.log('   ⚠️  No permission policies found in token info');
                console.log('   🔍 This may indicate a legacy token or broad permissions');
                permissions.status = 'unknown';
            }

        } catch (error) {
            console.error(`   ❌ Permission check failed: ${error.message}`);
            permissions.status = 'error';
            permissions.error = error.message;
        }

        return permissions;
    }

    /**
     * Test D1 database access
     */
    async testD1Access() {
        const d1Check = {
            status: 'unknown',
            databases: [],
            testResults: {}
        };

        try {
            // List databases
            console.log('   🔍 Listing D1 databases...');
            const listResult = await this.authManager.executeWranglerCommand(
                'd1 list --json'
            );

            const databases = JSON.parse(listResult.stdout);
            d1Check.databases = databases;

            if (databases.length === 0) {
                console.log('   ❌ No D1 databases found');
                d1Check.status = 'no_databases';
                return d1Check;
            }

            console.log(`   ✅ Found ${databases.length} database(s):`);
            databases.forEach(db => {
                console.log(`      - ${db.name} (${db.uuid})`);
            });

            // Test Calhr database specifically
            const calhrDb = databases.find(db => db.name === 'Calhr');
            if (calhrDb) {
                console.log('\n   🔍 Testing Calhr database connection...');
                await this.authManager.testD1Connection('Calhr');
                d1Check.testResults.calhr = { status: 'success' };
                console.log('   ✅ Calhr database connection successful');
            } else {
                console.log('   ⚠️  Calhr database not found');
                d1Check.testResults.calhr = { status: 'not_found' };
            }

            d1Check.status = 'success';

        } catch (error) {
            console.error(`   ❌ D1 access test failed: ${error.message}`);
            d1Check.status = 'error';
            d1Check.error = error.message;
        }

        return d1Check;
    }

    /**
     * Determine overall validation status
     */
    determineOverallStatus(results) {
        if (results.authentication?.status !== 'success') {
            return 'authentication_failed';
        }

        if (results.tokenInfo?.status !== 'success') {
            return 'token_invalid';
        }

        if (results.d1Access?.status === 'error') {
            return 'd1_access_failed';
        }

        if (results.d1Access?.status === 'no_databases') {
            return 'no_databases';
        }

        if (results.d1Access?.testResults?.calhr?.status !== 'success') {
            return 'calhr_database_issue';
        }

        return 'healthy';
    }

    /**
     * Display validation summary
     */
    displaySummary(results) {
        console.log('\n' + '=' .repeat(60));
        console.log('📊 VALIDATION SUMMARY');
        console.log('=' .repeat(60));

        const statusEmoji = {
            'healthy': '✅',
            'authentication_failed': '❌',
            'token_invalid': '❌',
            'd1_access_failed': '❌',
            'no_databases': '⚠️ ',
            'calhr_database_issue': '⚠️ ',
            'failed': '❌'
        };

        console.log(`Overall Status: ${statusEmoji[results.overallStatus] || '❓'} ${results.overallStatus.toUpperCase()}`);
        
        if (results.authentication) {
            console.log(`Authentication: ✅ ${results.authentication.method}`);
        }

        if (results.tokenInfo) {
            console.log(`Token Status: ✅ Valid`);
        }

        if (results.permissions) {
            const permStatus = results.permissions.hasD1Access ? '✅' : '⚠️ ';
            console.log(`Permissions: ${permStatus} ${results.permissions.status}`);
        }

        if (results.d1Access) {
            const d1Status = results.d1Access.status === 'success' ? '✅' : 
                           results.d1Access.status === 'error' ? '❌' : '⚠️ ';
            console.log(`D1 Access: ${d1Status} ${results.d1Access.status}`);
        }

        // Environment info
        console.log('\n📋 Environment Information:');
        const diagnostics = this.authManager.getDiagnostics();
        console.log(`   Environment: ${diagnostics.environment}`);
        console.log(`   Node Version: ${diagnostics.nodeVersion}`);
        console.log(`   Timestamp: ${diagnostics.timestamp}`);

        // Recommendations
        if (results.overallStatus !== 'healthy') {
            console.log('\n💡 Recommendations:');
            this.provideRecommendations(results);
        }
    }

    /**
     * Provide troubleshooting recommendations
     */
    provideRecommendations(results) {
        switch (results.overallStatus) {
            case 'authentication_failed':
                console.log('   1. Verify CLOUDFLARE_API_TOKEN is set correctly');
                console.log('   2. Check token format (should start with underscore)');
                console.log('   3. Ensure token is not expired');
                break;

            case 'token_invalid':
                console.log('   1. Generate a new API token at: https://dash.cloudflare.com/profile/api-tokens');
                console.log('   2. Ensure token has "Custom token" with D1:Edit permissions');
                console.log('   3. Include your account in the token scope');
                break;

            case 'd1_access_failed':
                console.log('   1. Verify token has D1 permissions');
                console.log('   2. Check account access in token configuration');
                console.log('   3. Test with: npx wrangler d1 list');
                break;

            case 'no_databases':
                console.log('   1. Create D1 database: npx wrangler d1 create Calhr');
                console.log('   2. Verify account access permissions');
                break;

            case 'calhr_database_issue':
                console.log('   1. Verify Calhr database exists');
                console.log('   2. Check database permissions');
                console.log('   3. Test with: npx wrangler d1 execute Calhr --command "SELECT 1"');
                break;
        }
    }

    /**
     * Quick health check for monitoring
     */
    async quickHealthCheck() {
        try {
            await this.authManager.initialize();
            await this.authManager.testD1Connection('Calhr');
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return { 
                status: 'unhealthy', 
                error: error.message, 
                timestamp: new Date().toISOString() 
            };
        }
    }
}

// CLI usage
if (require.main === module) {
    const validator = new TokenValidator();
    
    const command = process.argv[2] || 'full';
    
    if (command === 'quick') {
        validator.quickHealthCheck()
            .then(result => {
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.status === 'healthy' ? 0 : 1);
            })
            .catch(error => {
                console.error(`Health check failed: ${error.message}`);
                process.exit(1);
            });
    } else {
        validator.validateComprehensive()
            .then(results => {
                process.exit(results.overallStatus === 'healthy' ? 0 : 1);
            })
            .catch(error => {
                console.error(`Validation failed: ${error.message}`);
                process.exit(1);
            });
    }
}

module.exports = TokenValidator;