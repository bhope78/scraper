const { chromium } = require('playwright');
const { exec } = require('child_process');
const util = require('util');
const D1Insert = require('./d1-insert-local');
const D1Config = require('./d1-config-local');

const execAsync = util.promisify(exec);

class WindowedPaginationScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.existingJobControls = new Set();
    this.totalJobsScraped = 0;
    this.totalJobsOnSite = 0;
    this.processedWindows = [];
    this.processedPages = new Set();
    
    // D1 configuration will be loaded
    this.d1Config = null;
    this.d1Insert = null;
    
    console.log('🚀 WindowedPaginationScraper D1 - Using Working Scraper Logic');
  }

  async initializeD1() {
    console.log('☁️  Initializing D1 connection...');
    
    // Load configuration from D1 using OAuth (for local runs)
    this.d1Config = new D1Config(null); // null = use OAuth
    await this.d1Config.loadConfig();
    this.d1Config.validateConfig();
    
    // Initialize insert helper
    this.d1Insert = new D1Insert(
      null, // null = use OAuth
      this.d1Config.get('database_name'),
      this.d1Config.get('table_name')
    );
    
    console.log(`✅ Connected to D1 database: ${this.d1Config.get('database_name')}`);
    console.log(`📊 Target table: ${this.d1Config.get('table_name')}`);
  }

  async initBrowser() {
    console.log('🌐 Launching browser...');
    this.browser = await chromium.launch({ 
      headless: false,
      slowMo: 1200
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
      const totalCount = await this.d1Insert.getJobCount();
      console.log(`📊 Total jobs in D1: ${totalCount}`);
      
      // For D1, we'll check duplicates during insert to avoid loading all into memory
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
          const href = el.getAttribute('href') || '';
          
          return {
            pageNum,
            text,
            isClickable: (el.tagName === 'A' || onclick.includes('doPostBack')) && !isNaN(pageNum) && pageNum > 0,
            element: el
          };
        })
        .filter(item => item.isClickable && item.pageNum <= 1000) // Reasonable upper bound
        .sort((a, b) => a.pageNum - b.pageNum);
    });

    const pageNumbers = [...new Set(availablePages.map(p => p.pageNum))];
    console.log(`📄 Available pages in current window: [${pageNumbers.join(', ')}]`);
    
    return pageNumbers;
  }

  async extractJobsFromCurrentPage() {
    console.log(`📄 Extracting jobs from current page...`);
    
    await this.page.waitForSelector('a[href*="JobPosting.aspx"]', { timeout: 10000 });

    const jobs = await this.page.evaluate(() => {
      const jobElements = document.querySelectorAll('a[href*="JobPosting.aspx"]');
      const extractedJobs = [];

      jobElements.forEach((linkEl) => {
        const href = linkEl.href;
        const jobControlMatch = href.match(/JobControlId=(\d+)/);
        
        if (jobControlMatch) {
          const job_control = jobControlMatch[1];
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

  async insertNewJobs(jobs) {
    let insertedCount = 0;
    let duplicates = 0;

    for (const job of jobs) {
      try {
        // Convert field names to match D1 schema
        const d1Job = {
          working_title: job.working_title,
          department: job.department,
          job_control: job.job_control,
          location: job.location,
          salary_range: job.salary_range,
          telework: job.telework,
          worktype_schedule: job.work_type_schedule,
          publish_date: job.publish_date,
          filing_date: job.filing_deadline,
          link_title: job.link_title
        };

        const result = await this.d1Insert.insertJob(d1Job);
        
        if (result.success) {
          insertedCount++;
          this.totalJobsScraped++;
          
          if (insertedCount <= 3) { // Only log first 3 to reduce noise
            console.log(`✅ NEW: ${job.job_control} - ${job.link_title}`);
          }
        } else if (result.reason === 'duplicate') {
          duplicates++;
        }
      } catch (error) {
        console.error(`❌ Error inserting job ${job.job_control}:`, error.message);
      }
    }

    if (duplicates > 0) {
      console.log(`⏭️  Skipped ${duplicates} duplicate jobs`);
    }

    return insertedCount;
  }

  async navigateToSpecificPage(targetPage) {
    console.log(`🔄 Navigating to page ${targetPage}...`);

    try {
      // Method 1: Direct page number click
      const pageButton = await this.page.$(`a:has-text("${targetPage}"):visible`);
      if (pageButton) {
        console.log(`🔗 Clicking page ${targetPage} button...`);
        await pageButton.click();
        await this.page.waitForTimeout(4000);
        await this.page.waitForLoadState('networkidle');
        
        const hasJobs = await this.page.$('a[href*="JobPosting.aspx"]');
        if (hasJobs) {
          console.log(`✅ Successfully navigated to page ${targetPage}`);
          return true;
        }
      }

      // Method 2: ASP.NET postback
      console.log(`🔄 Trying ASP.NET postback for page ${targetPage}...`);
      const success = await this.page.evaluate((pageNum) => {
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
      }, targetPage);

      if (success) {
        await this.page.waitForTimeout(6000);
        await this.page.waitForLoadState('networkidle');
        
        const hasJobs = await this.page.$('a[href*="JobPosting.aspx"]');
        if (hasJobs) {
          console.log(`✅ ASP.NET postback successful for page ${targetPage}`);
          return true;
        }
      }

      console.log(`❌ Failed to navigate to page ${targetPage}`);
      return false;

    } catch (error) {
      console.error(`❌ Error navigating to page ${targetPage}:`, error.message);
      return false;
    }
  }

  async processCurrentWindow(availablePages) {
    console.log(`\n🪟 === PROCESSING WINDOW: Pages [${availablePages.join(', ')}] ===`);
    
    let pagesProcessedInWindow = 0;
    
    for (const pageNum of availablePages) {
      if (this.processedPages.has(pageNum)) {
        console.log(`⏭️ Skipping already processed page ${pageNum}`);
        continue;
      }

      console.log(`\n📄 === PAGE ${pageNum} ===`);

      try {
        // Navigate to specific page
        const navigationSuccess = await this.navigateToSpecificPage(pageNum);
        
        if (!navigationSuccess) {
          console.log(`⚠️ Failed to navigate to page ${pageNum}`);
          continue;
        }

        // Extract jobs from current page
        const jobs = await this.extractJobsFromCurrentPage();
        
        if (jobs.length === 0) {
          console.log(`⚠️ No jobs found on page ${pageNum}`);
          continue;
        }

        // Insert new jobs
        const insertedCount = await this.insertNewJobs(jobs);
        
        console.log(`📊 Page ${pageNum} Summary:`);
        console.log(`   • Jobs found: ${jobs.length}`);
        console.log(`   • New jobs inserted: ${insertedCount}`);
        console.log(`   • Total scraped: ${this.totalJobsScraped}`);
        console.log(`   • Progress: ${((this.totalJobsScraped / this.totalJobsOnSite) * 100).toFixed(1)}%`);

        this.processedPages.add(pageNum);
        pagesProcessedInWindow++;

        // Respectful delay between pages
        await this.page.waitForTimeout(2000);

      } catch (error) {
        console.error(`❌ Error processing page ${pageNum}:`, error.message);
      }
    }

    console.log(`🪟 Window completed: ${pagesProcessedInWindow} pages processed`);
    this.processedWindows.push({
      pages: availablePages,
      processed: pagesProcessedInWindow
    });
    
    return pagesProcessedInWindow > 0;
  }

  async findNextWindow() {
    console.log('\n🔍 Looking for next accessible window...');
    
    // Try to jump to a much higher page number to trigger a new window
    const jumpTargets = [50, 100, 150, 200, 250, 300, 350];
    
    for (const jumpTarget of jumpTargets) {
      if (this.processedPages.has(jumpTarget)) continue;
      
      console.log(`🦘 Attempting to jump to page ${jumpTarget}...`);
      
      const success = await this.page.evaluate((pageNum) => {
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
      }, jumpTarget);

      if (success) {
        await this.page.waitForTimeout(6000);
        await this.page.waitForLoadState('networkidle');
        
        const hasJobs = await this.page.$('a[href*="JobPosting.aspx"]');
        if (hasJobs) {
          console.log(`✅ Successfully jumped to page ${jumpTarget} - discovered new window!`);
          return true;
        }
      }
    }
    
    console.log('❌ No more accessible windows found');
    return false;
  }

  async scrapeAllWindowsComprehensively() {
    console.log(`🚀 Starting comprehensive windowed pagination scraping`);
    console.log(`📊 Target: All ${this.totalJobsOnSite} jobs across all accessible windows`);

    let totalWindows = 0;
    let maxWindows = 20; // Safety limit

    while (totalWindows < maxWindows) {
      totalWindows++;
      console.log(`\n🪟 === DISCOVERING WINDOW ${totalWindows} ===`);
      
      // Discover available pages in current window
      const availablePages = await this.discoverAvailablePageNumbers();
      
      if (availablePages.length === 0) {
        console.log('❌ No available pages found in current position');
        break;
      }

      // Check if we've already processed this window
      const newPages = availablePages.filter(p => !this.processedPages.has(p));
      if (newPages.length === 0) {
        console.log('⏭️ All pages in this window already processed');
        
        // Try to find next window
        const foundNextWindow = await this.findNextWindow();
        if (!foundNextWindow) {
          console.log('🏁 No more accessible windows found - scraping complete');
          break;
        }
        continue;
      }

      // Process all pages in current window
      const processedSuccessfully = await this.processCurrentWindow(availablePages);
      
      if (!processedSuccessfully) {
        console.log('⚠️ No pages successfully processed in this window');
      }

      // Try to find next window
      const foundNextWindow = await this.findNextWindow();
      if (!foundNextWindow) {
        console.log('🏁 No more accessible windows found - scraping complete');
        break;
      }

      // Safety delay between windows
      await this.page.waitForTimeout(3000);
    }

    console.log('\n🎉 Comprehensive windowed scraping completed!');
    console.log(`📊 Final Summary:`);
    console.log(`   • Windows processed: ${this.processedWindows.length}`);
    console.log(`   • Total pages processed: ${this.processedPages.size}`);
    console.log(`   • New jobs scraped: ${this.totalJobsScraped}`);
    console.log(`   • Total jobs on site: ${this.totalJobsOnSite}`);
    console.log(`   • Coverage: ${((this.totalJobsScraped / this.totalJobsOnSite) * 100).toFixed(2)}%`);
    console.log(`   • Processed pages: ${Array.from(this.processedPages).sort((a,b) => a-b).join(', ')}`);
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }

  async run() {
    try {
      await this.initializeD1();
      await this.initBrowser();
      await this.loadExistingJobControls();
      await this.navigateToJobSearch();
      await this.scrapeAllWindowsComprehensively();
    } catch (error) {
      console.error('💥 Scraper failed:', error);
      throw error;
    } finally {
      await this.closeBrowser();
    }
  }
}

// Run the scraper
async function main() {
  console.log('🎯 CalCareers D1 WINDOWED Pagination Scraper');
  console.log('==========================================');
  console.log('Strategy: Process all accessible page windows comprehensively');
  console.log('Method: Discover → Process → Jump to next window → Repeat');
  console.log('Storage: Cloudflare D1 Database');
  console.log('==========================================\n');

  const scraper = new WindowedPaginationScraper();
  
  try {
    await scraper.run();
    console.log('\n🎉 SUCCESS: Windowed pagination scraping completed!');
  } catch (error) {
    console.error('\n💥 FAILED: Windowed scraping error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}