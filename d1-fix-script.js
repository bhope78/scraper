#!/usr/bin/env node

/**
 * D1 Connection Fix Script
 * Database Expert - Automated fix for D1 connection issues
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class D1FixScript {
    constructor() {
        this.issues = [];
        this.fixes = [];
        this.environment = {
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
            hasApiToken: !!process.env.CLOUDFLARE_API_TOKEN,
            nodeVersion: null,
            wranglerVersion: null
        };
    }

    /**
     * Run automated fixes
     */
    async runFixes() {
        console.log('🔧 D1 Database Expert - Automated Fix Script');
        console.log('=' .repeat(60));
        console.log();

        try {
            await this.diagnoseIssues();
            await this.applyFixes();
            await this.validateFixes();
            await this.generateReport();
        } catch (error) {
            console.error('❌ Fix script failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Diagnose current issues
     */
    async diagnoseIssues() {
        console.log('🔍 Diagnosing issues...');

        // Check Node.js version
        try {
            const nodeResult = await execAsync('node --version');
            this.environment.nodeVersion = nodeResult.stdout.trim();
            const majorVersion = parseInt(this.environment.nodeVersion.substring(1).split('.')[0]);
            
            if (majorVersion < 20) {
                this.issues.push({
                    type: 'critical',
                    category: 'environment',
                    description: `Node.js version ${this.environment.nodeVersion} is too old`,
                    required: 'Node.js v20+',
                    fixable: true
                });
            }
        } catch (error) {
            this.issues.push({
                type: 'critical',
                category: 'environment',
                description: 'Node.js not found',
                required: 'Node.js v20+',
                fixable: false
            });
        }

        // Check API token
        if (!this.environment.hasApiToken) {
            this.issues.push({
                type: 'critical',
                category: 'authentication',
                description: 'CLOUDFLARE_API_TOKEN not set',
                required: 'Valid Cloudflare API token',
                fixable: false // Requires manual input
            });
        }

        // Check NVM availability (for Node.js fix)
        try {
            await execAsync('command -v nvm');
            this.environment.hasNvm = true;
        } catch {
            try {
                await execAsync('which nvm');
                this.environment.hasNvm = true;
            } catch {
                this.environment.hasNvm = false;
            }
        }

        console.log(`   Found ${this.issues.length} issues`);
        this.issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. [${issue.type.toUpperCase()}] ${issue.description}`);
        });
        console.log();
    }

    /**
     * Apply automated fixes
     */
    async applyFixes() {
        console.log('🛠️  Applying fixes...');

        for (const issue of this.issues) {
            if (!issue.fixable) {
                console.log(`⏭️  Skipping manual fix: ${issue.description}`);
                continue;
            }

            try {
                switch (issue.category) {
                    case 'environment':
                        await this.fixNodeVersion();
                        break;
                    default:
                        console.log(`⚠️  Unknown fix category: ${issue.category}`);
                }
            } catch (error) {
                console.error(`❌ Failed to fix ${issue.description}:`, error.message);
                this.fixes.push({
                    issue: issue.description,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        console.log();
    }

    /**
     * Fix Node.js version using NVM
     */
    async fixNodeVersion() {
        console.log('   🔄 Fixing Node.js version...');

        if (!this.environment.hasNvm) {
            console.log('   ⚠️  NVM not available, cannot auto-fix Node.js version');
            this.fixes.push({
                issue: 'Node.js version',
                status: 'manual',
                instructions: 'Install NVM and run: nvm install 20 && nvm use 20 && nvm alias default 20'
            });
            return;
        }

        try {
            // Source NVM and use Node 20
            const nvmScript = `
                export NVM_DIR="$HOME/.nvm"
                [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                nvm install 20
                nvm use 20
                nvm alias default 20
                node --version
            `;

            const result = await execAsync(nvmScript, { shell: '/bin/bash' });
            console.log('   ✅ Node.js upgraded successfully');
            console.log(`   📊 New version: ${result.stdout.trim()}`);
            
            this.fixes.push({
                issue: 'Node.js version',
                status: 'fixed',
                newVersion: result.stdout.trim()
            });

        } catch (error) {
            console.log('   ❌ Auto-fix failed, manual intervention required');
            this.fixes.push({
                issue: 'Node.js version',
                status: 'manual',
                error: error.message,
                instructions: 'Run: nvm install 20 && nvm use 20 && nvm alias default 20'
            });
        }
    }

    /**
     * Validate fixes
     */
    async validateFixes() {
        console.log('✅ Validating fixes...');

        // Re-check Node.js version
        try {
            const nodeResult = await execAsync('node --version');
            const newVersion = nodeResult.stdout.trim();
            const majorVersion = parseInt(newVersion.substring(1).split('.')[0]);
            
            if (majorVersion >= 20) {
                console.log(`   ✅ Node.js version: ${newVersion} (Valid)`);
            } else {
                console.log(`   ❌ Node.js version: ${newVersion} (Still too old)`);
            }
        } catch (error) {
            console.log('   ❌ Node.js still not available');
        }

        // Check wrangler availability
        try {
            const wranglerResult = await execAsync('npx wrangler --version');
            console.log(`   ✅ Wrangler: ${wranglerResult.stdout.trim()} (Available)`);
        } catch (error) {
            console.log('   ❌ Wrangler still not available');
        }

        // Check API token
        if (process.env.CLOUDFLARE_API_TOKEN) {
            console.log('   ✅ API Token: Present');
        } else {
            console.log('   ❌ API Token: Still missing');
        }

        console.log();
    }

    /**
     * Generate comprehensive report
     */
    async generateReport() {
        console.log('📋 FIX REPORT');
        console.log('=' .repeat(60));

        // Issues Summary
        console.log('\n🔍 Issues Found:');
        this.issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. [${issue.type.toUpperCase()}] ${issue.description}`);
            console.log(`      Required: ${issue.required}`);
            console.log(`      Auto-fixable: ${issue.fixable ? 'Yes' : 'No'}\n`);
        });

        // Fixes Applied
        console.log('🛠️  Fixes Applied:');
        if (this.fixes.length === 0) {
            console.log('   None applied');
        } else {
            this.fixes.forEach((fix, index) => {
                console.log(`   ${index + 1}. ${fix.issue}: ${fix.status.toUpperCase()}`);
                if (fix.newVersion) {
                    console.log(`      New version: ${fix.newVersion}`);
                }
                if (fix.error) {
                    console.log(`      Error: ${fix.error}`);
                }
                if (fix.instructions) {
                    console.log(`      Manual steps: ${fix.instructions}`);
                }
                console.log();
            });
        }

        // Manual Steps Required
        const manualSteps = this.getManualSteps();
        if (manualSteps.length > 0) {
            console.log('⚠️  MANUAL STEPS REQUIRED:');
            manualSteps.forEach((step, index) => {
                console.log(`   ${index + 1}. ${step}`);
            });
            console.log();
        }

        // Next Steps
        console.log('🎯 NEXT STEPS:');
        if (this.environment.hasApiToken) {
            console.log('   1. ✅ API Token is set');
            console.log('   2. Run: node d1-diagnostic.js (to verify all fixes)');
            console.log('   3. Run: node test-d1-connection.js (to test database)');
            console.log('   4. Run your scraper: node playwright-windowed-scraper-d1.js');
        } else {
            console.log('   1. ❌ Set your API token: export CLOUDFLARE_API_TOKEN="your-token"');
            console.log('   2. Run: node d1-diagnostic.js (to verify all fixes)');
            console.log('   3. Run: node test-d1-connection.js (to test database)');
            console.log('   4. Run your scraper: node playwright-windowed-scraper-d1.js');
        }

        // GitHub Actions Specific
        if (this.environment.isGitHubActions || this.hasGitHubActionsConfig()) {
            console.log('\n🔄 GITHUB ACTIONS CONFIGURATION:');
            console.log('   • Ensure CLOUDFLARE_API_TOKEN is set as a repository secret');
            console.log('   • Update workflow to use Node.js 20+:');
            console.log('     uses: actions/setup-node@v4');
            console.log('     with:');
            console.log('       node-version: "20"');
            console.log('   • Use --remote flag for all wrangler d1 commands');
        }

        console.log('\n✨ Fix script complete!');
    }

    /**
     * Get required manual steps
     */
    getManualSteps() {
        const steps = [];

        // API Token
        if (!this.environment.hasApiToken) {
            steps.push('Set CLOUDFLARE_API_TOKEN environment variable');
        }

        // Node.js version (if auto-fix failed)
        const nodeFixFailed = this.fixes.some(f => 
            f.issue.includes('Node.js') && (f.status === 'failed' || f.status === 'manual')
        );
        
        if (nodeFixFailed) {
            steps.push('Manually upgrade Node.js: nvm install 20 && nvm use 20 && nvm alias default 20');
        }

        return steps;
    }

    /**
     * Check if GitHub Actions config exists
     */
    hasGitHubActionsConfig() {
        const fs = require('fs');
        try {
            return fs.existsSync('.github/workflows') || fs.existsSync('.github');
        } catch {
            return false;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const fixScript = new D1FixScript();
    fixScript.runFixes().catch(console.error);
}

module.exports = D1FixScript;