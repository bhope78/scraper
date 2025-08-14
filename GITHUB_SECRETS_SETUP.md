# GitHub Secrets Setup

## Add CLOUDFLARE_API_TOKEN to GitHub Secrets

1. **Go to your GitHub repository**
   - Navigate to: https://github.com/bhope78/scraper

2. **Access Settings**
   - Click on "Settings" tab in your repository

3. **Navigate to Secrets**
   - In the left sidebar, click on "Secrets and variables"
   - Click on "Actions"

4. **Add New Secret**
   - Click "New repository secret"
   - **Name**: `CLOUDFLARE_API_TOKEN`
   - **Value**: `7myBlz54TNx-nwoc9AYJriIgQ9HACnAlIBuSSsp2`
   - Click "Add secret"

## Trigger the GitHub Action

Once the secret is added, you can trigger the scraper in two ways:

### Option 1: Manual Trigger
1. Go to the "Actions" tab in your repository
2. Click on "CalCareers D1 Scraper" workflow
3. Click "Run workflow" button
4. Select "main" branch
5. Click "Run workflow" to start

### Option 2: Automatic Daily Run
The scraper is configured to run automatically every day at 2 AM UTC.

## Monitor the Scraper

1. Go to the "Actions" tab
2. Click on the running workflow to see real-time logs
3. The scraper will:
   - Run in headless mode (no visible browser)
   - Use faster delays (500ms instead of 1200ms)
   - Process all accessible windows and pages
   - Insert new jobs into your Cloudflare D1 database

## Verify Results

After the action completes, you can verify the results:

```bash
# Check job count in D1
npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) FROM ccJobs"

# View recent jobs
npx wrangler d1 execute Calhr --remote --command "SELECT job_control, working_title FROM ccJobs ORDER BY created_at DESC LIMIT 10"
```

## Important Notes

- The scraper will run in **headless mode** in GitHub Actions (faster, no UI)
- It will run in **visible mode** when testing locally (slower, with UI)
- GitHub Actions has a timeout of 6 hours for workflow runs
- The scraper automatically handles pagination windows and duplicate detection