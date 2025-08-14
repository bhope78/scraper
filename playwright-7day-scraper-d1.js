const { chromium } = require('playwright');
const { exec } = require('child_process');
const util = require('util');

// Use different modules based on environment
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const D1Insert = require('./d1-insert-local-updated'); // Using updated version
const D1Config = isGitHubActions ? require('./d1-config') : require('./d1-config-local');

const execAsync = util.promisify(exec);

class SevenDayRollingScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.totalJobsScraped = 0;
    this.totalJobsOnSite = 0;
    this.processedPages = new Set();
    
    // D1 configuration will be loaded
    this.d1Config = null;
    this.d1Insert = null;
    
    // Date configuration - 7 day rolling window
    this.targetDays = 7;
    this.cutoffDate = null;
    this.currentDate = null;
    
    // TESTING LIMIT - Remove or increase for production
    this.maxRecordsToProcess = 5;
    this.recordsProcessed = 0;
    
    console.log('🚀 Seven-Day Rolling Window Scraper for D1');
    console.log(`📅 Will scrape jobs from the last ${this.targetDays} days`);
    console.log(`🧪 TEST MODE: Limited to ${this.maxRecordsToProcess} records`);
  }

  /**
   * Get Pacific Time date
   */
  getPacificDate() {
    const now = new Date();
    // Convert to Pacific Time
    const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
    return pacificTime;
  }

  /**
   * Initialize date window
   */
  initializeDateWindow() {
    this.currentDate = this.getPacificDate();
    this.cutoffDate = new Date(this.currentDate);
    this.cutoffDate.setDate(this.cutoffDate.getDate() - this.targetDays);
    
    console.log(`📅 Current Pacific Date: ${this.currentDate.toLocaleDateString()}`);
    console.log(`📅 Cutoff Date (7 days ago): ${this.cutoffDate.toLocaleDateString()}`);
    console.log(`📅 Will process jobs published between these dates`);
  }

  /**
   * Parse date from various formats
   */
  parseDate(dateStr) {
    if (!dateStr || dateStr === 'Not specified') return null;
    
    // Handle different date formats
    // Format: "8/14/2025" or "08/14/2025"
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]);
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      // Handle 2-digit year
      const fullYear = year < 100 ? 2000 + year : year;
      
      return new Date(fullYear, month - 1, day);
    }
    
    // Try standard date parse as fallback
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Check if date is within our window
   */
  isDateInWindow(dateStr) {
    const jobDate = this.parseDate(dateStr);
    if (!jobDate) return false;
    
    return jobDate >= this.cutoffDate && jobDate <= this.currentDate;
  }

  async initializeD1() {
    console.log('☁️  Initializing D1 connection...');
    
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
    
    if (isGitHubActions) {
      console.log('🤖 Running in GitHub Actions with API token');
      if (!apiToken) {
        throw new Error('CLOUDFLARE_API_TOKEN is required for GitHub Actions');
      }
      this.d1Config = new D1Config(apiToken);
    } else {
      console.log('🏠 Running locally with OAuth');
      this.d1Config = new D1Config(null); // null = use OAuth
    }
    
    await this.d1Config.loadConfig();
    this.d1Config.validateConfig();
    
    // Initialize insert helper with updated version
    this.d1Insert = new D1Insert(
      isGitHubActions ? apiToken : null,
      this.d1Config.get('database_name'),
      this.d1Config.get('table_name')
    );
    
    console.log(`✅ Connected to D1 database: ${this.d1Config.get('database_name')}`);
    console.log(`📊 Target table: ${this.d1Config.get('table_name')}`);
  }

  async initBrowser() {
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
    
    console.log(`🌐 Launching browser in ${isGitHubActions ? 'HEADLESS' : 'VISIBLE'} mode...`);
    
    this.browser = await chromium.launch({ 
      headless: isGitHubActions,  // Headless in GitHub Actions, visible locally
      slowMo: isGitHubActions ? 500 : 1200  // Faster in GitHub Actions
    });
    
    this.page = await this.browser.newPage();
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('✅ Browser initialized');
  }

  async navigateToJobSearch() {
    console.log('🔍 Navigating to CalCareers job search...');
    await this.page.goto('https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx#empty', { 
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await this.page.waitForTimeout(3000);
    
    // Set dropdown to 100 jobs per page
    console.log('🔧 Setting show dropdown to 100 jobs per page...');
    try {
      const dropdownExists = await this.page.locator('#cphMainContent_ddlRowCount').count() > 0;
      if (dropdownExists) {
        await this.page.selectOption('#cphMainContent_ddlRowCount', '100');
        console.log('✅ Show value set to 100 jobs');
        await this.page.waitForTimeout(5000); // Wait for page to reload with 100 jobs
      }
    } catch (e) {
      console.log('⚠️ Could not set dropdown to 100, continuing with default');
    }
    
    // Set sort order to Publish Date (newest first)
    console.log('📅 Setting sort order to Publish Date (newest first)...');
    try {
      const sortDropdownExists = await this.page.locator('#cphMainContent_ddlSortBy').count() > 0;
      if (sortDropdownExists) {
        await this.page.selectOption('#cphMainContent_ddlSortBy', 'PublishDate DESC');
        console.log('✅ Sort order set to newest jobs first');
        await this.page.waitForTimeout(3000); // Wait for page to reload with sorted results
      }
    } catch (e) {
      console.log('⚠️ Could not set sort order, continuing with default');
    }
    
    const totalText = await this.page.textContent('body');
    const totalMatch = totalText.match(/(\d+)\s+job\(s\)\s+found/i);
    if (totalMatch) {
      this.totalJobsOnSite = parseInt(totalMatch[1]);
      console.log(`📈 Total jobs on site: ${this.totalJobsOnSite}`);
    }

    console.log('✅ Successfully navigated to job search results');
  }

  async extractJobsFromCurrentPage() {
    console.log(`📄 Extracting jobs from current page...`);
    
    await this.page.waitForSelector('a[href*="JobPosting.aspx"]', { timeout: 10000 });

    const jobs = await this.page.evaluate(() => {
      // Get all job links on the page
      const jobElements = document.querySelectorAll('a[href*="JobPosting.aspx"]');
      const extractedJobs = [];
      const seenJobIds = new Set(); // Track job IDs to prevent duplicates on this page

      jobElements.forEach((linkEl) => {
        const href = linkEl.href;
        const jobControlMatch = href.match(/JobControlId=(\d+)/);
        
        if (jobControlMatch) {
          const job_control = jobControlMatch[1];
          
          // Skip if we've already seen this job ID on this page
          if (seenJobIds.has(job_control)) {
            return;
          }
          seenJobIds.add(job_control);
          
          const link_title = linkEl.textContent.trim() || '';
          
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
            
            const salaryMatch = containerText.match(/Salary Range:\s*([^\n]+)/);
            const deptMatch = containerText.match(/Department:\s*([^\n]+)/);
            const locationMatch = containerText.match(/Location:\s*([^\n]+)/);
            const teleworkMatch = containerText.match(/Telework:\s*([^\n]+)/);
            const publishMatch = containerText.match(/Publish Date:\s*([^\n]+)/);
            const deadlineMatch = containerText.match(/Filing Deadline:\s*([^\n]+)/);
            const workTypeMatch = containerText.match(/Work Type\/Schedule:\s*([^\n]+)/);
            const workingTitleMatch = containerText.match(/Working Title:\s*([^\n]+)/);

            // Map to exact column names in new schema
            const job = {
              job_control: job_control,
              link_title: link_title,
              working_title: workingTitleMatch ? workingTitleMatch[1].trim() : link_title,
              salary_range: salaryMatch ? salaryMatch[1].trim() : 'Not specified',
              work_type_schedule: workTypeMatch ? workTypeMatch[1].trim() : 'Not specified',
              department: deptMatch ? deptMatch[1].trim() : 'Not specified',
              location: locationMatch ? locationMatch[1].trim() : 'Not specified',
              telework: teleworkMatch ? teleworkMatch[1].trim() : 'Not specified',
              publish_date: publishMatch ? publishMatch[1].trim() : 'Not specified',
              filing_deadline: deadlineMatch ? deadlineMatch[1].trim() : 'Not specified',
              job_posting_url: href
            };

            extractedJobs.push(job);
          }
        }
      });

      return extractedJobs;
    });

    console.log(`📋 Extracted ${jobs.length} jobs from current page`);
    return jobs;
  }

  async processJobs(jobs) {
    let processedCount = 0;
    let skippedOldJobs = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let noChangeCount = 0;

    for (const job of jobs) {
      // Check if we've hit our testing limit
      if (this.recordsProcessed >= this.maxRecordsToProcess) {
        console.log(`\n🛑 TEST LIMIT REACHED: Processed ${this.recordsProcessed} records`);
        break;
      }

      // Check if job is within our date window
      if (!this.isDateInWindow(job.publish_date)) {
        skippedOldJobs++;
        console.log(`⏭️  Skipping job ${job.job_control} - Published: ${job.publish_date} (outside 7-day window)`);
        continue;
      }

      try {
        const result = await this.d1Insert.upsertJob(job);
        
        if (result.success) {
          if (result.action === 'inserted') {
            insertedCount++;
            this.totalJobsScraped++;
            this.recordsProcessed++;
            console.log(`✅ NEW: ${job.job_control} - ${job.link_title} | Published: ${job.publish_date} [${this.recordsProcessed}/${this.maxRecordsToProcess}]`);
          } else if (result.action === 'updated') {
            updatedCount++;
            this.recordsProcessed++;
            console.log(`📝 UPDATED: ${job.job_control} - ${job.link_title} [${this.recordsProcessed}/${this.maxRecordsToProcess}]`);
          }
        } else if (result.reason === 'no_changes') {
          noChangeCount++;
          this.recordsProcessed++;
        }
        
        processedCount++;
      } catch (error) {
        console.error(`❌ Error processing job ${job.job_control}:`, error.message);
      }
    }

    console.log(`\n📊 Page Summary:`);
    console.log(`   • Jobs in date window: ${processedCount}`);
    console.log(`   • New jobs inserted: ${insertedCount}`);
    console.log(`   • Jobs updated: ${updatedCount}`);
    console.log(`   • No changes: ${noChangeCount}`);
    console.log(`   • Skipped (too old): ${skippedOldJobs}`);

    return {
      processed: processedCount,
      inserted: insertedCount,
      updated: updatedCount,
      skippedOld: skippedOldJobs,
      shouldContinue: (skippedOldJobs < jobs.length) && (this.recordsProcessed < this.maxRecordsToProcess) // Continue if we're still finding jobs in window AND haven't hit limit
    };
  }

  async scrapeWithDateWindow() {
    let currentPage = 1;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkippedOld = 0;
    let shouldContinue = true;

    console.log('\n🔄 Starting 7-day rolling window scrape...');

    while (shouldContinue && currentPage <= 50) { // Max 50 pages as safety limit
      console.log(`\n📄 === PAGE ${currentPage} ===`);

      try {
        // Extract jobs from current page
        const jobs = await this.extractJobsFromCurrentPage();
        
        if (jobs.length === 0) {
          console.log(`⚠️ No jobs found on page ${currentPage}, stopping`);
          break;
        }

        // Process jobs with date filtering
        const results = await this.processJobs(jobs);
        
        totalInserted += results.inserted;
        totalUpdated += results.updated;
        totalSkippedOld += results.skippedOld;
        shouldContinue = results.shouldContinue;

        // Check if we should stop (all jobs are now too old)
        if (!shouldContinue) {
          console.log(`\n🛑 Reached jobs older than 7 days, stopping scrape`);
          break;
        }

        // Navigate to next page
        currentPage++;
        
        // Try to click next page button
        const nextPageExists = await this.navigateToNextPage(currentPage);
        if (!nextPageExists) {
          console.log(`\n🏁 No more pages available, stopping`);
          break;
        }

        // Progressive delay
        const delay = 2000 + (currentPage * 500);
        console.log(`⏳ Waiting ${delay/1000}s before next page...`);
        await this.page.waitForTimeout(delay);

      } catch (error) {
        console.error(`❌ Error on page ${currentPage}:`, error.message);
        break;
      }
    }

    console.log('\n✨ === SCRAPING COMPLETE ===');
    console.log(`📊 Final Summary:`);
    console.log(`   • Total new jobs inserted: ${totalInserted}`);
    console.log(`   • Total jobs updated: ${totalUpdated}`);
    console.log(`   • Total jobs skipped (>7 days old): ${totalSkippedOld}`);
    console.log(`   • Pages processed: ${currentPage - 1}`);
  }

  async navigateToNextPage(targetPage) {
    console.log(`🔄 Navigating to page ${targetPage}...`);

    try {
      // Method 1: Direct page number click
      const pageButton = await this.page.$(`a:has-text("${targetPage}"):visible`);
      if (pageButton) {
        await pageButton.click();
        await this.page.waitForTimeout(4000);
        await this.page.waitForLoadState('networkidle');
        return true;
      }

      // Method 2: Next button
      const nextButton = await this.page.$('a:has-text("Next"):visible, a[title="Next"]:visible');
      if (nextButton) {
        await nextButton.click();
        await this.page.waitForTimeout(4000);
        await this.page.waitForLoadState('networkidle');
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error navigating to page ${targetPage}:`, error.message);
      return false;
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Seven-Day Rolling Window Scraper');
      console.log('================================================\n');

      // Initialize date window
      this.initializeDateWindow();

      // Initialize D1 connection
      await this.initializeD1();

      // Get initial job count
      const initialCount = await this.d1Insert.getJobCount();
      console.log(`📊 Initial job count in D1: ${initialCount}\n`);

      // Initialize browser
      await this.initBrowser();

      // Navigate to job search
      await this.navigateToJobSearch();

      // Start scraping with date window
      await this.scrapeWithDateWindow();

      // Get final job count
      const finalCount = await this.d1Insert.getJobCount();
      console.log(`\n📊 Final job count in D1: ${finalCount}`);
      console.log(`📈 Net change: ${finalCount - initialCount} jobs`);

    } catch (error) {
      console.error('❌ Fatal error:', error);
    } finally {
      if (this.browser) {
        await this.browser.close();
        console.log('\n👋 Browser closed');
      }
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new SevenDayRollingScraper();
  scraper.run().catch(console.error);
}

module.exports = SevenDayRollingScraper;