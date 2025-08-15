#!/usr/bin/env node

/**
 * GitHub Secrets Verifier and Setup Guide
 * Helps diagnose and fix GitHub Secrets configuration issues
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class GitHubSecretsVerifier {
    constructor() {
        this.requiredSecrets = [
            'CLOUDFLARE_API_TOKEN'
        ];
        this.optionalSecrets = [
            'DISCORD_WEBHOOK_URL',
            'SLACK_WEBHOOK_URL',
            'NOTIFICATION_WEBHOOK_URL'
        ];
    }

    /**
     * Verify GitHub repository and secrets configuration
     */
    async verifyConfiguration() {
        console.log('🔍 GitHub Secrets Configuration Verifier');
        console.log('=' .repeat(50));

        const results = {
            repository: null,
            secrets: {},
            recommendations: []
        };

        try {
            // Step 1: Verify repository information
            console.log('\n📋 Step 1: Repository Information');
            console.log('-'.repeat(30));
            results.repository = await this.verifyRepository();

            // Step 2: Check current environment
            console.log('\n📋 Step 2: Current Environment');
            console.log('-'.repeat(30));
            await this.checkCurrentEnvironment();

            // Step 3: Verify secrets (if in GitHub Actions)
            console.log('\n📋 Step 3: Secrets Verification');
            console.log('-'.repeat(30));
            results.secrets = await this.verifySecrets();

            // Step 4: Generate recommendations
            console.log('\n📋 Step 4: Configuration Analysis');
            console.log('-'.repeat(30));
            results.recommendations = this.generateRecommendations(results);

            // Step 5: Display setup guide
            console.log('\n📋 Step 5: Setup Guide');
            console.log('-'.repeat(30));
            this.displaySetupGuide(results);

            return results;

        } catch (error) {
            console.error(`\n❌ Verification failed: ${error.message}`);
            return { error: error.message, ...results };
        }
    }

    /**
     * Verify repository information
     */
    async verifyRepository() {
        const repoInfo = {
            isGitRepo: false,
            hasOrigin: false,
            originUrl: null,
            currentBranch: null,
            isGitHubRepo: false
        };

        try {
            // Check if this is a git repository
            await execAsync('git rev-parse --git-dir');
            repoInfo.isGitRepo = true;
            console.log('✅ Git repository detected');

            // Get origin URL
            try {
                const { stdout } = await execAsync('git remote get-url origin');
                repoInfo.originUrl = stdout.trim();
                repoInfo.hasOrigin = true;
                
                if (repoInfo.originUrl.includes('github.com')) {
                    repoInfo.isGitHubRepo = true;
                    console.log(`✅ GitHub repository: ${repoInfo.originUrl}`);
                } else {
                    console.log(`⚠️  Non-GitHub repository: ${repoInfo.originUrl}`);
                }
            } catch (error) {
                console.log('⚠️  No origin remote found');
            }

            // Get current branch
            try {
                const { stdout } = await execAsync('git branch --show-current');
                repoInfo.currentBranch = stdout.trim();
                console.log(`✅ Current branch: ${repoInfo.currentBranch}`);
            } catch (error) {
                console.log('⚠️  Could not determine current branch');
            }

        } catch (error) {
            console.log('❌ Not a git repository');
        }

        return repoInfo;
    }

    /**
     * Check current environment
     */
    async checkCurrentEnvironment() {
        const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
        const hasCloudflareToken = !!process.env.CLOUDFLARE_API_TOKEN;

        console.log(`Environment: ${isGitHubActions ? '🤖 GitHub Actions' : '💻 Local'}`);
        console.log(`Cloudflare Token: ${hasCloudflareToken ? '✅ Present' : '❌ Missing'}`);

        if (isGitHubActions) {
            console.log(`Repository: ${process.env.GITHUB_REPOSITORY || 'Unknown'}`);
            console.log(`Workflow: ${process.env.GITHUB_WORKFLOW || 'Unknown'}`);
            console.log(`Run ID: ${process.env.GITHUB_RUN_ID || 'Unknown'}`);
        }

        if (hasCloudflareToken) {
            const token = process.env.CLOUDFLARE_API_TOKEN;
            console.log(`Token Length: ${token.length} characters`);
            console.log(`Token Preview: ${token.substring(0, 8)}...`);
            
            // Basic format validation
            if (token.length < 30) {
                console.log('⚠️  Token appears too short');
            } else if (token.length > 50) {
                console.log('⚠️  Token appears too long');
            } else {
                console.log('✅ Token length looks reasonable');
            }
        }
    }

    /**
     * Verify secrets in current environment
     */
    async verifySecrets() {
        const secretsStatus = {};

        console.log('Checking required secrets:');
        for (const secret of this.requiredSecrets) {
            const value = process.env[secret];
            secretsStatus[secret] = {
                present: !!value,
                length: value ? value.length : 0,
                preview: value ? `${value.substring(0, 8)}...` : null,
                required: true
            };

            if (value) {
                console.log(`  ✅ ${secret}: Present (${value.length} chars)`);
            } else {
                console.log(`  ❌ ${secret}: Missing (Required)`);
            }
        }

        console.log('\nChecking optional secrets:');
        for (const secret of this.optionalSecrets) {
            const value = process.env[secret];
            secretsStatus[secret] = {
                present: !!value,
                length: value ? value.length : 0,
                preview: value ? `${value.substring(0, 20)}...` : null,
                required: false
            };

            if (value) {
                console.log(`  ✅ ${secret}: Present (${value.length} chars)`);
            } else {
                console.log(`  ⚪ ${secret}: Not set (Optional)`);
            }
        }

        return secretsStatus;
    }

    /**
     * Generate recommendations based on verification results
     */
    generateRecommendations(results) {
        const recommendations = [];

        // Check for missing required secrets
        const missingRequired = Object.entries(results.secrets)
            .filter(([name, info]) => info.required && !info.present)
            .map(([name]) => name);

        if (missingRequired.length > 0) {
            recommendations.push({
                type: 'critical',
                title: 'Missing Required Secrets',
                description: `The following required secrets are missing: ${missingRequired.join(', ')}`,
                action: 'Add these secrets to your GitHub repository settings'
            });
        }

        // Check repository setup
        if (results.repository && !results.repository.isGitHubRepo) {
            recommendations.push({
                type: 'warning',
                title: 'Non-GitHub Repository',
                description: 'This doesn\'t appear to be a GitHub repository',
                action: 'Ensure you\'re working with a GitHub repository for GitHub Actions to work'
            });
        }

        // Check token format
        const cloudflareToken = results.secrets?.CLOUDFLARE_API_TOKEN;
        if (cloudflareToken?.present) {
            if (cloudflareToken.length < 30 || cloudflareToken.length > 50) {
                recommendations.push({
                    type: 'warning',
                    title: 'Suspicious Token Format',
                    description: 'Cloudflare API token length is unusual',
                    action: 'Verify your token is correctly copied from Cloudflare dashboard'
                });
            }
        }

        // Environment-specific recommendations
        if (process.env.GITHUB_ACTIONS !== 'true') {
            recommendations.push({
                type: 'info',
                title: 'Local Environment',
                description: 'Running locally - secrets verification limited',
                action: 'Test in GitHub Actions environment for full validation'
            });
        }

        return recommendations;
    }

    /**
     * Display comprehensive setup guide
     */
    displaySetupGuide(results) {
        console.log('📚 GitHub Secrets Setup Guide:');
        console.log('');

        console.log('1. 🔑 Creating Cloudflare API Token:');
        console.log('   a. Go to https://dash.cloudflare.com/profile/api-tokens');
        console.log('   b. Click "Create Token"');
        console.log('   c. Use "Custom token" template');
        console.log('   d. Add these permissions:');
        console.log('      - Cloudflare D1:Edit');
        console.log('      - Account:Read (for your account)');
        console.log('   e. Set Account Resources to include your account');
        console.log('   f. Copy the generated token (starts with underscore)');
        console.log('');

        console.log('2. 🔐 Adding Secret to GitHub:');
        if (results.repository?.originUrl) {
            const repoUrl = results.repository.originUrl
                .replace('git@github.com:', 'https://github.com/')
                .replace('.git', '');
            console.log(`   a. Go to ${repoUrl}/settings/secrets/actions`);
        } else {
            console.log('   a. Go to your GitHub repository');
            console.log('   b. Click Settings → Secrets and variables → Actions');
        }
        console.log('   c. Click "New repository secret"');
        console.log('   d. Name: CLOUDFLARE_API_TOKEN');
        console.log('   e. Value: [paste your Cloudflare token]');
        console.log('   f. Click "Add secret"');
        console.log('');

        console.log('3. 🧪 Testing the Setup:');
        console.log('   a. Go to Actions tab in your repository');
        console.log('   b. Find your workflow and click "Run workflow"');
        console.log('   c. Enable "Run with debug logging" for detailed output');
        console.log('   d. Check the health-check job for authentication status');
        console.log('');

        console.log('4. 🔍 Troubleshooting Common Issues:');
        console.log('   a. Token format: Ensure it starts with underscore');
        console.log('   b. Permissions: Verify D1:Edit and Account:Read');
        console.log('   c. Account scope: Include your specific account');
        console.log('   d. Expiration: Check token hasn\'t expired');
        console.log('   e. Typos: Verify secret name is exactly "CLOUDFLARE_API_TOKEN"');
        console.log('');

        // Display specific recommendations
        if (results.recommendations.length > 0) {
            console.log('5. 🎯 Specific Recommendations for Your Setup:');
            results.recommendations.forEach((rec, index) => {
                const emoji = rec.type === 'critical' ? '🚨' : 
                             rec.type === 'warning' ? '⚠️' : 'ℹ️';
                console.log(`   ${String.fromCharCode(97 + index)}. ${emoji} ${rec.title}:`);
                console.log(`      ${rec.description}`);
                console.log(`      Action: ${rec.action}`);
            });
        }
    }

    /**
     * Quick validation for CI/CD usage
     */
    async quickValidation() {
        const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
        const hasRequiredSecrets = this.requiredSecrets.every(secret => 
            process.env[secret]
        );

        return {
            environment: isGitHubActions ? 'github_actions' : 'local',
            secretsConfigured: hasRequiredSecrets,
            timestamp: new Date().toISOString(),
            ready: isGitHubActions && hasRequiredSecrets
        };
    }
}

// CLI usage
if (require.main === module) {
    const verifier = new GitHubSecretsVerifier();
    
    const command = process.argv[2] || 'full';
    
    if (command === 'quick') {
        verifier.quickValidation()
            .then(result => {
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.ready ? 0 : 1);
            })
            .catch(error => {
                console.error(`Quick validation failed: ${error.message}`);
                process.exit(1);
            });
    } else {
        verifier.verifyConfiguration()
            .then(results => {
                const hasErrors = results.recommendations?.some(r => r.type === 'critical');
                process.exit(hasErrors ? 1 : 0);
            })
            .catch(error => {
                console.error(`Verification failed: ${error.message}`);
                process.exit(1);
            });
    }
}

module.exports = GitHubSecretsVerifier;