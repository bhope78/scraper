#!/usr/bin/env node

/**
 * Bulletproof CalCareers Scraper
 * Enterprise-grade web automation with comprehensive failure recovery
 * 
 * Features:
 * - Bulletproof data layer with multiple fallback storage options
 * - Advanced browser automation with anti-detection measures
 * - Comprehensive error recovery and retry mechanisms
 * - Connection-agnostic operation (continues without D1)
 * - Performance optimizations for GitHub Actions environment
 * - Circuit breaker patterns for failed connections
 * - Real-time monitoring and health checks
 * - Graceful degradation under any failure scenario
 */

const { chromium } = require('playwright');
const BulletproofDataLayer = require('./bulletproof-data-layer');

class BulletproofScraper {
    constructor(options = {}) {
        this.config = {
            // Scraping configuration
            maxPages: options.maxPages || 50,
            jobsPerPage: options.jobsPerPage || 100,
            targetUrl: options.targetUrl || 'https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx#empty',
            
            // Browser configuration
            headless: options.headless !== undefined ? options.headless : process.env.GITHUB_ACTIONS === 'true',
            slowMo: options.slowMo || (process.env.GITHUB_ACTIONS === 'true' ? 500 : 1200),
            
            // Anti-detection configuration
            userAgent: options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: options.viewport || { width: 1920, height: 1080 },
            
            // Performance configuration
            navigationTimeout: options.navigationTimeout || 30000,
            elementTimeout: options.elementTimeout || 10000,
            networkTimeout: options.networkTimeout || 15000,
            
            // Rate limiting configuration
            baseDelay: options.baseDelay || 2000,
            progressiveDelayIncrement: options.progressiveDelayIncrement || 500,
            maxDelay: options.maxDelay || 10000,
            
            // Retry configuration
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000,
            
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
            isLocal: process.env.GITHUB_ACTIONS !== 'true',
            
            // Data layer options
            dataLayerOptions: options.dataLayerOptions || {}
        };

        this.state = {
            browser: null,
            page: null,
            totalJobsScraped: 0,
            totalJobsOnSite: 0,
            processedPages: new Set(),
            currentPage: 1,
            consecutiveFailures: 0,
            startTime: new Date(),
            isRunning: false,
            
            // Performance metrics
            pageLoadTimes: [],
            scrapeOperationTimes: [],
            dataOperationTimes: [],
        };

        // Initialize bulletproof data layer
        this.dataLayer = new BulletproofDataLayer({
            apiToken: process.env.CLOUDFLARE_API_TOKEN,
            ...this.config.dataLayerOptions
        });

        console.log('🚀 Bulletproof CalCareers Scraper initialized');
        console.log(`🌐 Environment: ${this.config.isGitHubActions ? 'GitHub Actions' : 'Local'}`);
        console.log(`🎭 Browser mode: ${this.config.headless ? 'Headless' : 'Visible'}`);
    }

    /**
     * Initialize browser with anti-detection measures
     */
    async initializeBrowser() {
        console.log('🌐 Launching browser with anti-detection measures...');
        
        const launchOptions = {
            headless: this.config.headless,
            slowMo: this.config.slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--start-maximized'
            ]
        };

        // Additional args for GitHub Actions environment
        if (this.config.isGitHubActions) {
            launchOptions.args.push(
                '--single-process',
                '--no-zygote',
                '--memory-pressure-off',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            );
        }

        try {
            this.state.browser = await chromium.launch(launchOptions);
            
            // Create page with stealth configuration
            this.state.page = await this.state.browser.newPage({
                viewport: this.config.viewport,
                userAgent: this.config.userAgent
            });

            // Anti-detection measures
            await this.state.page.addInitScript(() => {
                // Remove webdriver property
                delete window.navigator.webdriver;
                
                // Override automation detection
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
                
                // Mock chrome runtime
                window.chrome = {
                    runtime: {}
                };
                
                // Override permissions API
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({ state: Cypress.denied }) :
                    originalQuery(parameters)
                );
            });

            // Set additional HTTP headers
            await this.state.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            });

            console.log('✅ Browser initialized with stealth configuration');
            return true;

        } catch (error) {
            console.error('❌ Browser initialization failed:', error.message);
            throw error;
        }
    }

    /**
     * Navigate to job search with retry logic
     */
    async navigateToJobSearch() {
        console.log('🔍 Navigating to CalCareers job search...');
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                
                await this.state.page.goto(this.config.targetUrl, {
                    waitUntil: 'networkidle',
                    timeout: this.config.navigationTimeout
                });

                const loadTime = Date.now() - startTime;
                this.state.pageLoadTimes.push(loadTime);

                // Wait for page to stabilize
                await this.humanLikeDelay(3000);

                // Configure page settings
                await this.configurePageSettings();

                // Get total job count
                await this.extractTotalJobCount();

                console.log(`✅ Successfully navigated to job search (${loadTime}ms)`);
                return true;

            } catch (error) {
                console.warn(`⚠️ Navigation attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelay * attempt;
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await this.humanLikeDelay(delay);
                } else {
                    throw new Error(`Navigation failed after ${this.config.maxRetries} attempts: ${error.message}`);
                }
            }
        }
    }

    /**
     * Configure page settings (jobs per page, sort order)
     */
    async configurePageSettings() {
        console.log('🔧 Configuring page settings...');

        try {
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
                console.log('✅ Set sort order to newest first');
                await this.humanLikeDelay(3000);
            }

        } catch (error) {
            console.warn('⚠️ Page configuration failed, continuing with defaults:', error.message);
        }
    }

    /**
     * Extract total job count from page
     */
    async extractTotalJobCount() {
        try {
            const bodyText = await this.state.page.textContent('body');
            const totalMatch = bodyText.match(/(\d+)\s+job\(s\)\s+found/i);
            
            if (totalMatch) {
                this.state.totalJobsOnSite = parseInt(totalMatch[1]);
                console.log(`📈 Total jobs on site: ${this.state.totalJobsOnSite}`);
            }
        } catch (error) {
            console.warn('⚠️ Could not extract total job count:', error.message);
        }
    }

    /**
     * Extract jobs from current page with enhanced error handling
     */
    async extractJobsFromCurrentPage() {
        console.log(`📄 Extracting jobs from page ${this.state.currentPage}...`);
        
        const startTime = Date.now();
        
        try {
            // Wait for job listings to load
            await this.state.page.waitForSelector('a[href*="JobPosting.aspx"]', { 
                timeout: this.config.elementTimeout 
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
                        
                        // Find job container
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
                        console.warn('Error extracting job:', error.message);
                    }
                });

                return extractedJobs;
            });

            const extractTime = Date.now() - startTime;
            this.state.scrapeOperationTimes.push(extractTime);

            console.log(`📋 Extracted ${jobs.length} jobs from page ${this.state.currentPage} (${extractTime}ms)`);
            return jobs;

        } catch (error) {
            console.error(`❌ Error extracting jobs from page ${this.state.currentPage}:`, error.message);
            return [];
        }
    }

    /**
     * Process jobs with bulletproof data layer
     */
    async processJobs(jobs) {
        console.log(`💾 Processing ${jobs.length} jobs...`);
        
        let insertedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        
        for (const job of jobs) {
            const startTime = Date.now();
            
            try {
                const result = await this.dataLayer.upsertJob(job);
                
                const operationTime = Date.now() - startTime;
                this.state.dataOperationTimes.push(operationTime);
                
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
                
                // Small delay to prevent overwhelming any storage system
                await this.humanLikeDelay(100);
                
            } catch (error) {
                errorCount++;
                console.error(`❌ Error processing job ${job.job_control}:`, error.message);
            }
        }

        console.log(`📊 Page ${this.state.currentPage} Summary:`);
        console.log(`   • Jobs found: ${jobs.length}`);
        console.log(`   • New jobs: ${insertedCount}`);
        console.log(`   • Updated jobs: ${updatedCount}`);
        console.log(`   • Errors: ${errorCount}`);
        console.log(`   • Storage method: ${this.dataLayer.state.currentStorageMethod.toUpperCase()}`);
        console.log(`   • Total scraped: ${this.state.totalJobsScraped}`);
        
        if (this.state.totalJobsOnSite > 0) {
            const progress = ((this.state.totalJobsScraped / this.state.totalJobsOnSite) * 100).toFixed(1);
            console.log(`   • Progress: ${progress}%`);
        }

        return { inserted: insertedCount, updated: updatedCount, errors: errorCount };
    }

    /**
     * Navigate to next page with multiple strategies
     */
    async navigateToNextPage() {
        console.log(`🔄 Navigating to page ${this.state.currentPage + 1}...`);

        try {
            // Strategy 1: Direct page number click
            const nextPageNum = this.state.currentPage + 1;
            const pageButton = this.state.page.locator(`a:has-text("${nextPageNum}"):visible`);
            
            if (await pageButton.count() > 0) {
                await pageButton.click();
                await this.state.page.waitForLoadState('networkidle');
                this.state.currentPage = nextPageNum;
                console.log(`✅ Navigated to page ${this.state.currentPage} via page button`);
                return true;
            }

            // Strategy 2: Next button
            const nextButton = this.state.page.locator('a:has-text("Next"):visible, a[title="Next"]:visible');
            if (await nextButton.count() > 0) {
                await nextButton.click();
                await this.state.page.waitForLoadState('networkidle');
                this.state.currentPage++;
                console.log(`✅ Navigated to page ${this.state.currentPage} via next button`);
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
                console.log(`✅ Navigated to page ${this.state.currentPage} via ASP.NET postback`);
                return true;
            }

            console.log('❌ No more pages available');
            return false;

        } catch (error) {
            console.error(`❌ Navigation error:`, error.message);
            return false;
        }
    }

    /**
     * Main scraping loop with comprehensive error handling
     */
    async runScrapingLoop() {
        console.log('\n🚀 Starting bulletproof scraping loop...');
        
        this.state.isRunning = true;
        let totalInserted = 0;
        let totalUpdated = 0;
        let consecutiveEmptyPages = 0;
        
        while (this.state.isRunning && this.state.currentPage <= this.config.maxPages) {
            console.log(`\n📄 === PAGE ${this.state.currentPage} ===`);
            
            try {
                // Reset consecutive failures on successful page start
                this.state.consecutiveFailures = 0;
                
                // Extract jobs from current page
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
                    
                    // Process jobs
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

                // Progressive delay between pages
                const delay = Math.min(
                    this.config.baseDelay + (this.state.currentPage * this.config.progressiveDelayIncrement),
                    this.config.maxDelay
                );
                
                console.log(`⏳ Waiting ${delay}ms before next page (progressive backoff)...`);
                await this.humanLikeDelay(delay);

            } catch (error) {
                this.state.consecutiveFailures++;
                console.error(`❌ Error on page ${this.state.currentPage}:`, error.message);
                
                if (this.state.consecutiveFailures >= 3) {
                    console.error('🚨 Too many consecutive failures, stopping scraper');
                    break;
                }
                
                // Longer delay after errors
                console.log('⏳ Waiting 10s after error before continuing...');
                await this.humanLikeDelay(10000);
            }
        }

        this.state.isRunning = false;
        
        console.log('\n✨ === SCRAPING COMPLETE ===');
        console.log(`📊 Final Summary:`);
        console.log(`   • Pages processed: ${this.state.processedPages.size}`);
        console.log(`   • Total new jobs: ${totalInserted}`);
        console.log(`   • Total updated jobs: ${totalUpdated}`);
        console.log(`   • Storage method: ${this.dataLayer.state.currentStorageMethod.toUpperCase()}`);
        console.log(`   • Data layer status: ${JSON.stringify(this.dataLayer.getStatus(), null, 2)}`);
        
        // Performance summary
        this.printPerformanceMetrics();
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
     * Print performance metrics
     */
    printPerformanceMetrics() {
        const runtime = Date.now() - this.state.startTime.getTime();
        const avgPageLoad = this.state.pageLoadTimes.length > 0 ? 
            this.state.pageLoadTimes.reduce((a, b) => a + b, 0) / this.state.pageLoadTimes.length : 0;
        const avgScrapeTime = this.state.scrapeOperationTimes.length > 0 ?
            this.state.scrapeOperationTimes.reduce((a, b) => a + b, 0) / this.state.scrapeOperationTimes.length : 0;
        const avgDataTime = this.state.dataOperationTimes.length > 0 ?
            this.state.dataOperationTimes.reduce((a, b) => a + b, 0) / this.state.dataOperationTimes.length : 0;

        console.log('\n⚡ Performance Metrics:');
        console.log(`   • Total runtime: ${(runtime / 1000 / 60).toFixed(2)} minutes`);
        console.log(`   • Average page load: ${avgPageLoad.toFixed(0)}ms`);
        console.log(`   • Average scrape time: ${avgScrapeTime.toFixed(0)}ms`);
        console.log(`   • Average data operation: ${avgDataTime.toFixed(0)}ms`);
        console.log(`   • Jobs per minute: ${(this.state.totalJobsScraped / (runtime / 1000 / 60)).toFixed(1)}`);
    }

    /**
     * Cleanup and shutdown
     */
    async cleanup() {
        console.log('🧹 Cleaning up resources...');
        
        try {
            // Cleanup data layer
            await this.dataLayer.cleanup();
            
            // Close browser
            if (this.state.browser) {
                await this.state.browser.close();
                console.log('🔒 Browser closed');
            }
            
            console.log('✅ Cleanup complete');
        } catch (error) {
            console.warn('⚠️ Cleanup error:', error.message);
        }
    }

    /**
     * Main run method
     */
    async run() {
        try {
            console.log('🎯 CalCareers Bulletproof Scraper Starting');
            console.log('==========================================');
            console.log('🛡️ Bulletproof features enabled:');
            console.log('   • Multi-tier fallback storage (D1 → SQLite → JSON → Memory)');
            console.log('   • Circuit breaker patterns for failed connections');
            console.log('   • Comprehensive error recovery');
            console.log('   • Anti-detection browser automation');
            console.log('   • Progressive rate limiting');
            console.log('   • Real-time performance monitoring');
            console.log('==========================================\n');

            // Initialize systems
            await this.dataLayer.initializeFallbackSystems();
            await this.initializeBrowser();
            await this.navigateToJobSearch();
            
            // Get initial job count
            const initialCount = await this.dataLayer.getJobCount();
            console.log(`📊 Initial job count: ${initialCount}\n`);

            // Run main scraping loop
            await this.runScrapingLoop();

            // Get final job count
            const finalCount = await this.dataLayer.getJobCount();
            console.log(`\n📊 Final job count: ${finalCount}`);
            console.log(`📈 Net change: ${finalCount - initialCount} jobs`);

            console.log('\n🎉 SUCCESS: Bulletproof scraping completed!');

        } catch (error) {
            console.error('\n💥 FATAL ERROR:', error.message);
            console.error('Stack trace:', error.stack);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// Handle process signals for graceful shutdown
let scraper = null;

process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    if (scraper) {
        scraper.state.isRunning = false;
        await scraper.cleanup();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    if (scraper) {
        scraper.state.isRunning = false;
        await scraper.cleanup();
    }
    process.exit(0);
});

// Main execution
async function main() {
    scraper = new BulletproofScraper({
        maxPages: process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES) : 50,
        headless: process.env.GITHUB_ACTIONS === 'true',
    });
    
    try {
        await scraper.run();
    } catch (error) {
        console.error('\n💥 Scraper failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = BulletproofScraper;