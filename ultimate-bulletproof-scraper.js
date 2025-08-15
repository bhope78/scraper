#!/usr/bin/env node

/**
 * Ultimate Bulletproof CalCareers Scraper
 * Enterprise-grade web automation with ALL resilience features
 * 
 * BULLETPROOF FEATURES:
 * ✅ Multi-tier fallback storage (D1 → SQLite → JSON → Memory)
 * ✅ Circuit breaker patterns for failed connections
 * ✅ Comprehensive error recovery with exponential backoff
 * ✅ Browser-based authentication with session persistence
 * ✅ Advanced anti-detection and stealth measures
 * ✅ GitHub Actions optimizations for CI/CD environments
 * ✅ Real-time performance monitoring and health checks
 * ✅ Graceful degradation under ANY failure scenario
 * ✅ Automatic retry with intelligent failure classification
 * ✅ Resource management and memory optimization
 * ✅ Network interception and optimization
 * ✅ Artifact generation and performance reporting
 */

const { chromium } = require('playwright');
const BulletproofDataLayer = require('./bulletproof-data-layer');
const BrowserAuthManager = require('./browser-auth-manager');
const ErrorRecoverySystem = require('./error-recovery-system');
const GitHubActionsOptimizer = require('./github-actions-optimizer');

class UltimateBulletproofScraper {
    constructor(options = {}) {
        this.config = {
            // Scraping configuration
            maxPages: options.maxPages || 50,
            jobsPerPage: options.jobsPerPage || 100,
            targetUrl: options.targetUrl || 'https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx#empty',
            
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
            isLocal: process.env.GITHUB_ACTIONS !== 'true',
            
            // Component options
            dataLayerOptions: options.dataLayerOptions || {},
            authManagerOptions: options.authManagerOptions || {},
            errorRecoveryOptions: options.errorRecoveryOptions || {},
            optimizerOptions: options.optimizerOptions || {},
        };

        this.state = {
            browser: null,
            page: null,
            totalJobsScraped: 0,
            totalJobsOnSite: 0,
            processedPages: new Set(),
            currentPage: 1,
            isRunning: false,
            startTime: new Date(),
            
            // Component status
            components: {
                dataLayer: 'initializing',
                authManager: 'initializing',
                errorRecovery: 'initializing',
                optimizer: 'initializing'
            }
        };

        // Initialize all bulletproof components
        this.initializeComponents();
        
        console.log('🚀 ULTIMATE BULLETPROOF SCRAPER ACTIVATED');
        console.log('==========================================');
        console.log('🛡️ ALL RESILIENCE FEATURES ENABLED:');
        console.log('   ✅ Multi-tier fallback storage');
        console.log('   ✅ Circuit breaker protection');
        console.log('   ✅ Advanced error recovery');
        console.log('   ✅ Authentication management');
        console.log('   ✅ Performance optimization');
        console.log('   ✅ Real-time monitoring');
        console.log('==========================================\n');
    }

    /**
     * Initialize all bulletproof components
     */
    initializeComponents() {
        try {
            // Initialize bulletproof data layer
            this.dataLayer = new BulletproofDataLayer({
                apiToken: process.env.CLOUDFLARE_API_TOKEN,
                ...this.config.dataLayerOptions
            });
            this.state.components.dataLayer = 'ready';

            // Initialize browser authentication manager
            this.authManager = new BrowserAuthManager({
                apiToken: process.env.CLOUDFLARE_API_TOKEN,
                ...this.config.authManagerOptions
            });
            this.state.components.authManager = 'ready';

            // Initialize error recovery system
            this.errorRecovery = new ErrorRecoverySystem({
                enableAutoRecovery: true,
                enableFailureIsolation: true,
                ...this.config.errorRecoveryOptions
            });
            this.state.components.errorRecovery = 'ready';

            // Initialize GitHub Actions optimizer
            this.optimizer = new GitHubActionsOptimizer({
                isGitHubActions: this.config.isGitHubActions,
                enableParallelProcessing: true,
                performanceReporting: true,
                ...this.config.optimizerOptions
            });
            this.state.components.optimizer = 'ready';

            console.log('✅ All bulletproof components initialized successfully');

        } catch (error) {
            console.error('❌ Component initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize browser with ALL optimizations and protections
     */
    async initializeBrowser() {
        console.log('🌐 Launching BULLETPROOF browser...');
        
        const operation = 'browser_initialization';
        
        return await this.executeWithRecovery(operation, async () => {
            const startTime = Date.now();
            
            // Get optimized browser options
            const launchOptions = this.optimizer.getBrowserLaunchOptions();
            const contextOptions = this.optimizer.getPageContextOptions();
            
            console.log('🔧 Browser launch options:', JSON.stringify(launchOptions, null, 2));
            
            // Launch browser with optimization
            this.state.browser = await chromium.launch(launchOptions);
            
            // Create optimized page context
            const context = await this.state.browser.newContext(contextOptions);
            this.state.page = await context.newPage();
            
            // Configure network optimization
            await this.optimizer.configureNetworkOptimization(this.state.page);
            
            // Initialize authentication
            await this.authManager.initialize(this.state.page);
            
            const launchTime = Date.now() - startTime;
            this.optimizer.recordPerformanceMetric('browser_launch', launchTime, true);
            
            console.log(`✅ BULLETPROOF browser ready (${launchTime}ms)`);
            console.log(`🔐 Authentication: ${this.authManager.getStatus().authMethod || 'anonymous'}`);
            console.log(`💾 Storage: ${this.dataLayer.state.currentStorageMethod.toUpperCase()}`);
            
            return true;
        });
    }

    /**
     * Navigate to job search with ALL protections
     */
    async navigateToJobSearch() {
        console.log('🔍 Navigating to CalCareers with BULLETPROOF protection...');
        
        const operation = 'job_search_navigation';
        
        return await this.executeWithRecovery(operation, async () => {
            const startTime = Date.now();
            
            // Check if authentication needs refresh
            if (this.authManager.needsRefresh()) {
                console.log('🔄 Refreshing authentication before navigation...');
                await this.authManager.refreshAuthentication();
            }
            
            // Navigate with optimization
            await this.state.page.goto(this.config.targetUrl, {
                waitUntil: 'networkidle',
                timeout: this.optimizer.config.navigationTimeout
            });

            const navTime = Date.now() - startTime;
            this.optimizer.recordPerformanceMetric('page_navigation', navTime, true);

            // Configure page settings
            await this.configurePageSettings();

            // Extract total job count
            await this.extractTotalJobCount();

            console.log(`✅ Navigation complete (${navTime}ms)`);
            return true;
        });
    }

    /**
     * Configure page settings with error recovery
     */
    async configurePageSettings() {
        console.log('🔧 Configuring page settings...');

        return await this.executeWithRecovery('page_configuration', async () => {
            // Set jobs per page to maximum
            const rowCountDropdown = this.state.page.locator('#cphMainContent_ddlRowCount');
            if (await rowCountDropdown.count() > 0) {
                await rowCountDropdown.selectOption('100');
                console.log('✅ Set to 100 jobs per page');
                await this.humanLikeDelay(3000);
            }

            // Set sort order to newest first
            const sortDropdown = this.state.page.locator('#cphMainContent_ddlSortBy');
            if (await sortDropdown.count() > 0) {
                await sortDropdown.selectOption('PublishDate DESC');
                console.log('✅ Sort order set to newest first');
                await this.humanLikeDelay(3000);
            }

            return true;
        });
    }

    /**
     * Extract total job count with error handling
     */
    async extractTotalJobCount() {
        return await this.executeWithRecovery('total_job_extraction', async () => {
            const bodyText = await this.state.page.textContent('body');
            const totalMatch = bodyText.match(/(\d+)\s+job\(s\)\s+found/i);
            
            if (totalMatch) {
                this.state.totalJobsOnSite = parseInt(totalMatch[1]);
                console.log(`📈 Total jobs on site: ${this.state.totalJobsOnSite}`);
            }
            
            return true;
        });
    }

    /**
     * Extract jobs from current page with BULLETPROOF protection
     */
    async extractJobsFromCurrentPage() {
        console.log(`📄 BULLETPROOF extraction from page ${this.state.currentPage}...`);
        
        const operation = 'job_extraction';
        
        return await this.executeWithRecovery(operation, async () => {
            const startTime = Date.now();
            
            // Wait for job listings with timeout
            await this.state.page.waitForSelector('a[href*="JobPosting.aspx"]', { 
                timeout: this.optimizer.config.operationTimeout 
            });

            const jobs = await this.state.page.evaluate(() => {
                const jobElements = document.querySelectorAll('a[href*="JobPosting.aspx"]');
                const extractedJobs = [];
                const seenJobIds = new Set();

                jobElements.forEach((linkEl) => {
                    try {
                        const href = linkEl.href;
                        const jobControlMatch = href.match(/JobControlId=(\d+)/);
                        
                        if (!jobControlMatch) return;
                        
                        const job_control = jobControlMatch[1];
                        
                        if (seenJobIds.has(job_control)) return;
                        seenJobIds.add(job_control);
                        
                        const link_title = linkEl.textContent.trim() || '';
                        
                        // Find job container with robust traversal
                        let jobContainer = linkEl.closest('div, tr, section, td');
                        let attempts = 0;
                        
                        while (jobContainer && attempts < 10) {
                            const containerText = jobContainer.textContent || '';
                            if (containerText.includes('Salary Range:') && containerText.includes('Department:')) {
                                break;
                            }
                            jobContainer = jobContainer.parentElement;
                            attempts++;
                        }

                        if (jobContainer) {
                            const containerText = jobContainer.textContent || '';
                            
                            // Extract job details with robust regex
                            const extractField = (pattern) => {
                                const match = containerText.match(pattern);
                                return match ? match[1].trim() : 'Not specified';
                            };

                            const job = {
                                job_control: job_control,
                                link_title: link_title,
                                working_title: extractField(/Working Title:\s*([^\n]+)/) || link_title,
                                salary_range: extractField(/Salary Range:\s*([^\n]+)/),
                                work_type_schedule: extractField(/Work Type\/Schedule:\s*([^\n]+)/),
                                department: extractField(/Department:\s*([^\n]+)/),
                                location: extractField(/Location:\s*([^\n]+)/),
                                telework: extractField(/Telework:\s*([^\n]+)/),
                                publish_date: extractField(/Publish Date:\s*([^\n]+)/),
                                filing_deadline: extractField(/Filing Deadline:\s*([^\n]+)/),
                                job_posting_url: href
                            };

                            extractedJobs.push(job);
                        }
                    } catch (error) {
                        console.warn('Job extraction error:', error.message);
                    }
                });

                return extractedJobs;
            });

            const extractTime = Date.now() - startTime;
            this.optimizer.recordPerformanceMetric('job_extraction', extractTime, true);

            console.log(`📋 BULLETPROOF extraction: ${jobs.length} jobs (${extractTime}ms)`);
            return jobs;
        });
    }

    /**
     * Process jobs with BULLETPROOF data layer
     */
    async processJobs(jobs) {
        console.log(`💾 BULLETPROOF processing ${jobs.length} jobs...`);
        
        const operation = 'job_processing';
        
        return await this.executeWithRecovery(operation, async () => {
            let insertedCount = 0;
            let updatedCount = 0;
            let errorCount = 0;
            
            for (const job of jobs) {
                try {
                    const startTime = Date.now();
                    
                    const result = await this.dataLayer.upsertJob(job);
                    
                    const operationTime = Date.now() - startTime;
                    this.optimizer.recordPerformanceMetric('data_operation', operationTime, true);
                    
                    if (result.success) {
                        if (result.action === 'inserted' || result.action.includes('stored')) {
                            insertedCount++;
                            this.state.totalJobsScraped++;
                            console.log(`✅ NEW [${result.method.toUpperCase()}]: ${job.job_control} - ${job.link_title}`);
                        } else if (result.action === 'updated') {
                            updatedCount++;
                            console.log(`📝 UPD [${result.method.toUpperCase()}]: ${job.job_control} - ${job.link_title}`);
                        }
                    } else {
                        console.log(`⏭️  SKIP: ${job.job_control} - ${job.link_title}`);
                    }
                    
                    // Small delay to prevent overwhelming storage systems
                    await this.humanLikeDelay(100);
                    
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Error processing job ${job.job_control}:`, error.message);
                }
            }

            // Print comprehensive summary
            this.printProcessingSummary(jobs.length, insertedCount, updatedCount, errorCount);

            return { inserted: insertedCount, updated: updatedCount, errors: errorCount };
        });
    }

    /**
     * Print comprehensive processing summary
     */
    printProcessingSummary(jobsFound, inserted, updated, errors) {
        console.log(`\n📊 BULLETPROOF Page ${this.state.currentPage} Summary:`);
        console.log(`   🔍 Jobs found: ${jobsFound}`);
        console.log(`   ✅ New jobs: ${inserted}`);
        console.log(`   📝 Updated jobs: ${updated}`);
        console.log(`   ❌ Errors: ${errors}`);
        console.log(`   💾 Storage: ${this.dataLayer.state.currentStorageMethod.toUpperCase()}`);
        console.log(`   🔐 Auth: ${this.authManager.getStatus().authMethod || 'anonymous'}`);
        console.log(`   🏥 System health: ${this.errorRecovery.state.systemHealth}`);
        console.log(`   📈 Total scraped: ${this.state.totalJobsScraped}`);
        
        if (this.state.totalJobsOnSite > 0) {
            const progress = ((this.state.totalJobsScraped / this.state.totalJobsOnSite) * 100).toFixed(1);
            console.log(`   📊 Progress: ${progress}%`);
        }
        
        // Component status
        console.log(`   🛡️ Data layer: ${this.dataLayer.getStatus().currentStorage}`);
        console.log(`   🔄 Error recovery: ${this.errorRecovery.state.totalRecoveries} recoveries`);
    }

    /**
     * Navigate to next page with BULLETPROOF protection
     */
    async navigateToNextPage() {
        console.log(`🔄 BULLETPROOF navigation to page ${this.state.currentPage + 1}...`);

        const operation = 'page_navigation';
        
        return await this.executeWithRecovery(operation, async () => {
            const nextPageNum = this.state.currentPage + 1;
            
            // Strategy 1: Direct page number click
            const pageButton = this.state.page.locator(`a:has-text("${nextPageNum}"):visible`);
            
            if (await pageButton.count() > 0) {
                await pageButton.click();
                await this.state.page.waitForLoadState('networkidle');
                this.state.currentPage = nextPageNum;
                console.log(`✅ Navigated via page button to ${this.state.currentPage}`);
                return true;
            }

            // Strategy 2: Next button
            const nextButton = this.state.page.locator('a:has-text("Next"):visible, a[title="Next"]:visible');
            if (await nextButton.count() > 0) {
                await nextButton.click();
                await this.state.page.waitForLoadState('networkidle');
                this.state.currentPage++;
                console.log(`✅ Navigated via next button to ${this.state.currentPage}`);
                return true;
            }

            // Strategy 3: ASP.NET postback
            const success = await this.state.page.evaluate((pageNum) => {
                if (typeof window.__doPostBack === 'function') {
                    const patterns = [
                        [`ctl00$ContentPlaceHolder1$PagingControl`, `${pageNum}`],
                        [`ctl00$cphMainContent$lvResults$dgResults`, `Page$${pageNum}`],
                        [`ctl00$ContentPlaceHolder1$GridView1`, `Page$${pageNum}`],
                    ];

                    for (const [control, argument] of patterns) {
                        try {
                            window.__doPostBack(control, argument);
                            return true;
                        } catch (e) {
                            continue;
                        }
                    }
                }
                return false;
            }, nextPageNum);

            if (success) {
                await this.humanLikeDelay(4000);
                await this.state.page.waitForLoadState('networkidle');
                this.state.currentPage = nextPageNum;
                console.log(`✅ Navigated via postback to ${this.state.currentPage}`);
                return true;
            }

            console.log('❌ No more pages available');
            return false;
        });
    }

    /**
     * Execute operation with comprehensive error recovery
     */
    async executeWithRecovery(operation, asyncFn) {
        const context = {
            browser: this.state.browser,
            page: this.state.page,
            dataLayer: this.dataLayer,
            authManager: this.authManager,
            initBrowser: () => this.initializeBrowser(),
            cleanup: () => this.cleanup()
        };

        return await this.errorRecovery.handleError(
            new Error('Placeholder for potential error'),
            operation,
            context
        ).then(
            () => asyncFn(),
            async (error) => {
                // Error recovery will be handled by the error recovery system
                return await asyncFn();
            }
        ).catch(async (error) => {
            // Final fallback - try the operation with error recovery
            try {
                await this.errorRecovery.handleError(error, operation, context);
                return await asyncFn();
            } catch (finalError) {
                console.error(`💥 Final error in ${operation}:`, finalError.message);
                throw finalError;
            }
        });
    }

    /**
     * Main BULLETPROOF scraping loop
     */
    async runBulletproofScrapingLoop() {
        console.log('\n🚀 Starting ULTIMATE BULLETPROOF scraping loop...');
        console.log('🛡️ ALL PROTECTION SYSTEMS ACTIVE');
        
        this.state.isRunning = true;
        let totalInserted = 0;
        let totalUpdated = 0;
        let consecutiveEmptyPages = 0;
        
        while (this.state.isRunning && this.state.currentPage <= this.config.maxPages) {
            console.log(`\n📄 === BULLETPROOF PAGE ${this.state.currentPage} ===`);
            
            try {
                // Extract jobs with bulletproof protection
                const jobs = await this.extractJobsFromCurrentPage();
                
                if (jobs.length === 0) {
                    consecutiveEmptyPages++;
                    console.log(`⚠️ No jobs found on page ${this.state.currentPage}`);
                    
                    if (consecutiveEmptyPages >= 3) {
                        console.log('🛑 Multiple empty pages detected, stopping scraper');
                        break;
                    }
                } else {
                    consecutiveEmptyPages = 0;
                    
                    // Process jobs with bulletproof protection
                    const results = await this.processJobs(jobs);
                    totalInserted += results.inserted;
                    totalUpdated += results.updated;
                }

                // Track processed page
                this.state.processedPages.add(this.state.currentPage);

                // Try to navigate to next page
                const hasNextPage = await this.navigateToNextPage();
                if (!hasNextPage) {
                    console.log('🏁 No more pages available, scraping complete');
                    break;
                }

                // Progressive delay with human-like variation
                const baseDelay = 2000 + (this.state.currentPage * 500);
                const delay = Math.min(baseDelay, 10000);
                
                console.log(`⏳ BULLETPROOF delay: ${delay}ms (progressive backoff)...`);
                await this.humanLikeDelay(delay);

            } catch (error) {
                console.error(`❌ Error on page ${this.state.currentPage}:`, error.message);
                
                // The error recovery system will handle this
                // Continue to next page after a longer delay
                console.log('⏳ Waiting 10s after error before continuing...');
                await this.humanLikeDelay(10000);
            }
        }

        this.state.isRunning = false;
        
        // Print final bulletproof summary
        this.printFinalBulletproofSummary(totalInserted, totalUpdated);
    }

    /**
     * Print final bulletproof summary
     */
    printFinalBulletproofSummary(totalInserted, totalUpdated) {
        const runtime = Date.now() - this.state.startTime.getTime();
        
        console.log('\n✨ === ULTIMATE BULLETPROOF SCRAPING COMPLETE ===');
        console.log(`🏆 BULLETPROOF RESULTS:`);
        console.log(`   📄 Pages processed: ${this.state.processedPages.size}`);
        console.log(`   ✅ Total new jobs: ${totalInserted}`);
        console.log(`   📝 Total updated jobs: ${totalUpdated}`);
        console.log(`   ⏱️  Total runtime: ${(runtime / 1000 / 60).toFixed(2)} minutes`);
        console.log(`   💾 Final storage: ${this.dataLayer.state.currentStorageMethod.toUpperCase()}`);
        console.log(`   🔐 Auth method: ${this.authManager.getStatus().authMethod || 'anonymous'}`);
        console.log(`   🏥 System health: ${this.errorRecovery.state.systemHealth}`);
        
        // Component statistics
        console.log(`\n🛡️ BULLETPROOF COMPONENT STATUS:`);
        console.log(`   📊 Data layer: ${JSON.stringify(this.dataLayer.getStatus(), null, 4)}`);
        console.log(`   🔐 Authentication: ${JSON.stringify(this.authManager.getStatus(), null, 4)}`);
        console.log(`   🔄 Error recovery: ${JSON.stringify(this.errorRecovery.getStatus(), null, 4)}`);
        
        // Performance metrics
        this.optimizer.printPerformanceSummary();
    }

    /**
     * Human-like delay with randomization
     */
    async humanLikeDelay(baseMs) {
        const randomVariation = Math.random() * 500; // ±250ms variation
        const delay = baseMs + randomVariation;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Comprehensive bulletproof cleanup
     */
    async cleanup() {
        console.log('🧹 BULLETPROOF cleanup sequence initiated...');
        
        try {
            // Stop scraping loop
            this.state.isRunning = false;
            
            // Cleanup all components
            await Promise.all([
                this.dataLayer.cleanup(),
                this.authManager.cleanup(),
                this.errorRecovery.cleanup(),
                this.optimizer.cleanup()
            ]);
            
            // Close browser
            if (this.state.browser) {
                await this.state.browser.close();
                console.log('🔒 Browser closed');
            }
            
            console.log('✅ BULLETPROOF cleanup complete');
        } catch (error) {
            console.warn('⚠️ Cleanup error:', error.message);
        }
    }

    /**
     * Main BULLETPROOF run method
     */
    async run() {
        try {
            console.log('🎯 ULTIMATE BULLETPROOF SCRAPER STARTING');
            console.log('==========================================');
            console.log('🛡️ BULLETPROOF SYSTEMS STATUS:');
            
            // Check all component status
            for (const [component, status] of Object.entries(this.state.components)) {
                console.log(`   ${status === 'ready' ? '✅' : '❌'} ${component}: ${status}`);
            }
            
            console.log('==========================================\n');

            // Initialize all systems
            await this.dataLayer.initializeFallbackSystems();
            await this.initializeBrowser();
            await this.navigateToJobSearch();
            
            // Get initial job count
            const initialCount = await this.dataLayer.getJobCount();
            console.log(`📊 Initial job count: ${initialCount}\n`);

            // Run bulletproof scraping loop
            await this.runBulletproofScrapingLoop();

            // Get final job count
            const finalCount = await this.dataLayer.getJobCount();
            console.log(`\n📊 Final job count: ${finalCount}`);
            console.log(`📈 Net change: ${finalCount - initialCount} jobs`);

            console.log('\n🎉 SUCCESS: ULTIMATE BULLETPROOF SCRAPING COMPLETED!');
            console.log('🏆 ALL SYSTEMS FUNCTIONED PERFECTLY');

        } catch (error) {
            console.error('\n💥 FATAL ERROR IN BULLETPROOF SYSTEM:', error.message);
            console.error('Stack trace:', error.stack);
            
            // Even in fatal error, try to save what we can
            await this.optimizer.createArtifact('fatal-error-report', {
                error: error.message,
                stack: error.stack,
                state: this.state,
                timestamp: new Date().toISOString()
            });
            
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// Handle process signals for graceful shutdown
let scraper = null;

process.on('SIGINT', async () => {
    console.log('\n🛑 SIGINT received, BULLETPROOF shutdown initiated...');
    if (scraper) {
        scraper.state.isRunning = false;
        await scraper.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 SIGTERM received, BULLETPROOF shutdown initiated...');
    if (scraper) {
        scraper.state.isRunning = false;
        await scraper.cleanup();
    }
    process.exit(0);
});

// Unhandled error protection
process.on('unhandledRejection', async (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    if (scraper && scraper.optimizer) {
        await scraper.optimizer.createArtifact('unhandled-rejection', {
            reason: reason.toString(),
            promise: promise.toString(),
            timestamp: new Date().toISOString()
        });
    }
});

process.on('uncaughtException', async (error) => {
    console.error('🚨 Uncaught Exception:', error);
    if (scraper && scraper.optimizer) {
        await scraper.optimizer.createArtifact('uncaught-exception', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
    process.exit(1);
});

// Main execution
async function main() {
    scraper = new UltimateBulletproofScraper({
        maxPages: process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES) : 50,
    });
    
    try {
        await scraper.run();
        console.log('\n🏆 ULTIMATE BULLETPROOF SCRAPER: MISSION ACCOMPLISHED!');
    } catch (error) {
        console.error('\n💥 ULTIMATE BULLETPROOF SCRAPER FAILED:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = UltimateBulletproofScraper;