const { chromium } = require('playwright');
const D1Config = require('./d1-config');
const D1Insert = require('./d1-insert');

class WindowedPaginationScraperD1 {
  constructor() {
    this.browser = null;
    this.page = null;
    this.existingJobControls = new Set();
    this.totalJobsScraped = 0;
    this.totalJobsOnSite = 0;
    this.processedWindows = [];
    this.processedPages = new Set();
    
    // D1 configuration will be loaded from Cloudflare
    this.d1Config = null;
    this.d1Insert = null;
    
    console.log('🚀 WindowedPaginationScraper D1 - Cloudflare D1 Edition');
  }

  async initializeD1() {
    console.log('☁️  Initializing D1 connection...');
    
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
    }
    
    // Load configuration from D1
    this.d1Config = new D1Config(apiToken);
    await this.d1Config.loadConfig();
    this.d1Config.validateConfig();
    
    // Initialize insert helper
    this.d1Insert = new D1Insert(
      apiToken,
      this.d1Config.get('database_name'),
      this.d1Config.get('table_name')
    );
    
    console.log(`✅ Connected to D1 database: ${this.d1Config.get('database_name')}`);
    console.log(`📊 Target table: ${this.d1Config.get('table_name')}`);
  }

  async initBrowser() {
    console.log('🌐 Launching browser...');
    
    // Check if running in GitHub Actions
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
    
    this.browser = await chromium.launch({ 
      headless: isGitHubActions ? true : false,
      slowMo: isGitHubActions ? 500 : 1200
    });
    
    this.page = await this.browser.newPage();
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('✅ Browser initialized');
  }

  async loadExistingJobControls() {
    console.log('📋 Loading existing job controls from D1...');
    
    try {
      // Get count first
      const totalCount = await this.d1Insert.getJobCount();
      console.log(`📊 Total jobs in D1: ${totalCount}`);
      
      // For now, we'll check each job individually during insert
      // In a production system, you might want to load all job_controls into memory
      // if the dataset is manageable
      console.log('✅ D1 connection verified, will check duplicates during insert');
    } catch (error) {
      console.error('❌ Error connecting to D1:', error);
      throw error;
    }
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
    
    const totalText = await this.page.textContent('body');
    const totalMatch = totalText.match(/(\d+)\s+job\(s\)\s+found/i);
    if (totalMatch) {
      this.totalJobsOnSite = parseInt(totalMatch[1]);
      console.log(`📈 Total jobs on site: ${this.totalJobsOnSite}`);
    }

    console.log('✅ Successfully navigated to job search results');
  }

  async discoverAvailablePageNumbers() {
    console.log('🔍 Discovering available page numbers in current window...');
    
    const availablePages = await this.page.$$eval('a, span', elements => {
      return elements
        .map(el => {
          const text = el.textContent.trim();
          const pageNum = parseInt(text);
          const onclick = el.getAttribute('onclick') || '';
          
          if (!isNaN(pageNum) && pageNum > 0 && pageNum <= 1000) {
            const href = el.getAttribute('href') || '';
            const isCurrentPage = el.tagName === 'SPAN' && el.parentElement?.tagName === 'TD';
            
            if (isCurrentPage || onclick.includes('PagerPage') || href.includes('PagerPage')) {
              return pageNum;
            }
          }
          return null;
        })
        .filter(num => num !== null);
    });

    const uniquePages = [...new Set(availablePages)].sort((a, b) => a - b);
    console.log(`📄 Available pages in current window: [${uniquePages.join(', ')}]`);
    
    return uniquePages;
  }

  async navigateToPage(pageNumber) {
    console.log(`🔄 Navigating to page ${pageNumber}...`);
    
    try {
      const pageButtonSelectors = [
        `a[onclick*="PagerPage'][onclick*="'${pageNumber}'"]`,
        `a[href*="PagerPage=${pageNumber}"]`,
        `td a:has-text("${pageNumber}")`,
        `a[onclick*="${pageNumber},"]:has-text("${pageNumber}")`
      ];
      
      let clicked = false;
      for (const selector of pageButtonSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          if (await element.count() > 0) {
            console.log(`🔗 Clicking page ${pageNumber} button...`);
            await element.click();
            clicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!clicked) {
        console.log(`⚠️ Could not find clickable element for page ${pageNumber}`);
        return false;
      }
      
      await this.page.waitForTimeout(3000);
      console.log(`✅ Successfully navigated to page ${pageNumber}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error navigating to page ${pageNumber}:`, error.message);
      return false;
    }
  }

  async extractJobsFromCurrentPage() {
    console.log('📄 Extracting jobs from current page...');
    
    const jobs = await this.page.$$eval('#cphMainContent_gvSearchResults tr', (rows) => {
      const extractedJobs = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 9) {
          const workingTitleLink = cells[0].querySelector('a');
          const workingTitle = workingTitleLink ? workingTitleLink.textContent.trim() : '';
          const linkTitle = workingTitleLink ? workingTitleLink.getAttribute('title') : '';
          const jobControl = cells[1].textContent.trim();
          const department = cells[2].textContent.trim();
          const location = cells[3].textContent.trim();
          const salaryRange = cells[4].textContent.trim();
          const telework = cells[5].textContent.trim();
          const worktypeSchedule = cells[6].textContent.trim();
          const publishDate = cells[7].textContent.trim();
          const filingDate = cells[8].textContent.trim();
          
          if (jobControl) {
            extractedJobs.push({
              working_title: workingTitle,
              link_title: linkTitle,
              job_control: jobControl,
              department: department,
              location: location,
              salary_range: salaryRange,
              telework: telework,
              worktype_schedule: worktypeSchedule,
              publish_date: publishDate,
              filing_date: filingDate
            });
          }
        }
      }
      
      return extractedJobs;
    });
    
    console.log(`📋 Extracted ${jobs.length} jobs from current page`);
    return jobs;
  }

  async insertJobsToD1(jobs) {
    let newJobs = 0;
    let duplicates = 0;
    let errors = 0;
    
    for (const job of jobs) {
      try {
        const result = await this.d1Insert.insertJob(job);
        
        if (result.success) {
          newJobs++;
          console.log(`✅ NEW: ${job.job_control} - ${job.working_title}`);
        } else if (result.reason === 'duplicate') {
          duplicates++;
        } else {
          errors++;
          console.error(`❌ ERROR: ${job.job_control} - ${result.reason}`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Failed to insert job ${job.job_control}:`, error.message);
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return { newJobs, duplicates, errors };
  }

  async processWindow(windowPages) {
    console.log(`\n🪟 === PROCESSING WINDOW: Pages [${windowPages.join(', ')}] ===`);
    
    let windowResults = {
      totalJobs: 0,
      newJobs: 0,
      duplicates: 0,
      errors: 0
    };
    
    for (const pageNum of windowPages) {
      if (this.processedPages.has(pageNum)) {
        console.log(`⏭️  Page ${pageNum} already processed, skipping`);
        continue;
      }
      
      console.log(`\n📄 === PAGE ${pageNum} ===`);
      
      // Navigate to the page
      const navigationSuccess = await this.navigateToPage(pageNum);
      if (!navigationSuccess) {
        console.log(`⚠️ Skipping page ${pageNum} due to navigation failure`);
        continue;
      }
      
      // Extract jobs from current page
      const jobs = await this.extractJobsFromCurrentPage();
      windowResults.totalJobs += jobs.length;
      
      // Insert jobs to D1
      const insertResults = await this.insertJobsToD1(jobs);
      windowResults.newJobs += insertResults.newJobs;
      windowResults.duplicates += insertResults.duplicates;
      windowResults.errors += insertResults.errors;
      
      this.totalJobsScraped += insertResults.newJobs;
      this.processedPages.add(pageNum);
      
      // Display progress
      const progress = ((this.totalJobsScraped / this.totalJobsOnSite) * 100).toFixed(1);
      console.log(`📊 Page ${pageNum} Summary:`);
      console.log(`   • Jobs found: ${jobs.length}`);
      console.log(`   • New jobs inserted: ${insertResults.newJobs}`);
      console.log(`   • Total scraped: ${this.totalJobsScraped}`);
      console.log(`   • Progress: ${progress}%`);
      
      // Add delay between pages
      await this.page.waitForTimeout(2000);
    }
    
    return windowResults;
  }

  async navigateToNextWindow() {
    console.log('🔄 Looking for next window navigation (ellipsis)...');
    
    try {
      const ellipsisSelectors = [
        'td:has-text("..."):last-of-type a',
        'a[onclick*="PagerPage"]:has-text("...")',
        'td.PagerOtherPageCells a[onclick*="31,"]',
        'a[onclick*=",31,"]'
      ];
      
      for (const selector of ellipsisSelectors) {
        try {
          const elements = await this.page.locator(selector).all();
          
          for (const element of elements) {
            const text = await element.textContent();
            const onclick = await element.getAttribute('onclick');
            
            if (text?.includes('...') || onclick?.includes(',31,')) {
              console.log('✅ Found next window navigation, clicking...');
              await element.click();
              await this.page.waitForTimeout(5000);
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      console.log('❌ No next window navigation found');
      return false;
      
    } catch (error) {
      console.error('❌ Error navigating to next window:', error.message);
      return false;
    }
  }

  async scrapePaginated() {
    console.log('🚀 Starting comprehensive windowed pagination scraping');
    console.log(`📊 Target: All ${this.totalJobsOnSite} jobs across all accessible windows\n`);
    
    let windowNumber = 1;
    let hasMoreWindows = true;
    
    while (hasMoreWindows) {
      console.log(`\n🪟 === DISCOVERING WINDOW ${windowNumber} ===`);
      
      // Discover available pages in current window
      const availablePages = await this.discoverAvailablePageNumbers();
      
      if (availablePages.length === 0) {
        console.log('⚠️ No pages found in current window');
        break;
      }
      
      // Process all pages in current window
      const windowResults = await this.processWindow(availablePages);
      
      // Store window information
      this.processedWindows.push({
        windowNumber,
        pages: availablePages,
        results: windowResults
      });
      
      console.log(`\n📊 Window ${windowNumber} Complete:`);
      console.log(`   • Pages processed: ${availablePages.length}`);
      console.log(`   • Total jobs found: ${windowResults.totalJobs}`);
      console.log(`   • New jobs inserted: ${windowResults.newJobs}`);
      console.log(`   • Duplicates skipped: ${windowResults.duplicates}`);
      
      // Try to navigate to next window
      hasMoreWindows = await this.navigateToNextWindow();
      
      if (hasMoreWindows) {
        windowNumber++;
        console.log('➡️  Moving to next window...\n');
        await this.page.waitForTimeout(3000);
      } else {
        console.log('✅ No more windows to process');
      }
      
      // Safety check to prevent infinite loops
      if (windowNumber > 100) {
        console.log('⚠️ Reached maximum window limit (100), stopping');
        break;
      }
    }
    
    return this.processedWindows;
  }

  async displayFinalSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SCRAPING SUMMARY');
    console.log('='.repeat(60));
    
    // Get final count from D1
    const finalCount = await this.d1Insert.getJobCount();
    
    console.log(`✅ Total jobs in D1 database: ${finalCount}`);
    console.log(`📈 New jobs added this session: ${this.totalJobsScraped}`);
    console.log(`🪟 Windows processed: ${this.processedWindows.length}`);
    console.log(`📄 Pages processed: ${this.processedPages.size}`);
    
    console.log('\n📋 Window Details:');
    this.processedWindows.forEach(window => {
      console.log(`   Window ${window.windowNumber}: Pages [${window.pages.join(', ')}]`);
      console.log(`      • Jobs: ${window.results.totalJobs}`);
      console.log(`      • New: ${window.results.newJobs}`);
      console.log(`      • Duplicates: ${window.results.duplicates}`);
    });
    
    // Get recent jobs
    console.log('\n🆕 Most Recent Jobs Added:');
    const recentJobs = await this.d1Insert.getRecentJobs(5);
    recentJobs.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.job_control} - ${job.working_title}`);
    });
    
    console.log('\n' + '='.repeat(60));
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('🧹 Browser closed');
    }
  }

  async run() {
    try {
      console.log('🎯 CalCareers D1 WINDOWED Pagination Scraper');
      console.log('==========================================');
      console.log('Strategy: Process all accessible page windows comprehensively');
      console.log('Method: Discover → Process → Jump to next window → Repeat');
      console.log('Storage: Cloudflare D1 Database');
      console.log('==========================================\n');
      
      // Initialize D1 connection
      await this.initializeD1();
      
      // Initialize browser
      await this.initBrowser();
      
      // Load existing job controls
      await this.loadExistingJobControls();
      
      // Navigate to job search
      await this.navigateToJobSearch();
      
      // Scrape all windows
      await this.scrapePaginated();
      
      // Display final summary
      await this.displayFinalSummary();
      
    } catch (error) {
      console.error('❌ Fatal error:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new WindowedPaginationScraperD1();
  scraper.run().catch(error => {
    console.error('Scraper failed:', error);
    process.exit(1);
  });
}

module.exports = WindowedPaginationScraperD1;