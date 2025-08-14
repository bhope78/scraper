# CalCareers D1 Scraper Setup Guide

## Overview
This scraper stores CalCareers job data directly in Cloudflare D1, requiring only ONE secret in GitHub.

## Architecture
```
GitHub Actions → (CLOUDFLARE_API_TOKEN) → D1 Config Table → Scraper → D1 Jobs Table
```

## Setup Steps

### 1. Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Custom token" template
4. Set permissions:
   - **Account** → **D1** → **Edit**
5. Add Account Resources: Include → Your account
6. Create token and **copy it immediately**

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add:
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Value:** [your token from step 1]

### 3. Test Locally

```bash
# Set your API token
export CLOUDFLARE_API_TOKEN="your-token-here"

# Test connection
cd D1
node test-d1-connection.js

# Test scraper (will run with visible browser)
node playwright-windowed-scraper-d1.js
```

### 4. Deploy to GitHub

```bash
# Commit and push
git add .
git commit -m "Add D1 scraper with GitHub Actions"
git push

# Manually trigger the workflow
# Go to Actions tab → CalCareers D1 Scraper → Run workflow
```

### 5. Enable Schedule

Once manual run works, the workflow will run daily at 2 AM UTC automatically.

## Files Structure

```
D1/
├── d1-config.js                    # Loads config from D1
├── d1-insert.js                    # Handles job inserts
├── test-d1-connection.js           # Test script
├── playwright-windowed-scraper-d1.js # Main scraper
└── SETUP_GUIDE.md                  # This file

.github/workflows/
└── scrape-calcareers-d1.yml        # GitHub Actions workflow
```

## Database Structure

**Database:** Calhr
- **Table:** `ccJobs` - Stores job data
- **Table:** `scraper_config` - Stores configuration

## Configuration

All configuration is stored in the `scraper_config` table:
- `account_id`: Your Cloudflare account ID
- `database_id`: D1 database ID
- `database_name`: Calhr
- `table_name`: ccJobs
- `batch_size`: 50
- `max_retries`: 3

## Monitoring

### Check Total Jobs
```bash
npx wrangler d1 execute Calhr --remote \
  --command "SELECT COUNT(*) FROM ccJobs"
```

### Check Recent Jobs
```bash
npx wrangler d1 execute Calhr --remote \
  --command "SELECT * FROM ccJobs ORDER BY created_at DESC LIMIT 5"
```

### View Config
```bash
npx wrangler d1 execute Calhr --remote \
  --command "SELECT * FROM scraper_config"
```

## Troubleshooting

### Authentication Error
- Verify your API token has D1 permissions
- Check token hasn't expired
- Ensure token is correctly set in GitHub Secrets

### Database Not Found
- Verify database name is "Calhr"
- Check you're using the correct account

### No Jobs Inserted
- Check for duplicates (jobs already exist)
- Verify table structure matches
- Look at GitHub Actions logs for errors

## Security Notes

- Only ONE secret stored in GitHub (API token)
- All other config stored in Cloudflare
- No database credentials in code
- Token has minimal required permissions

## Support

Check GitHub Actions logs for detailed error messages. The workflow creates artifacts with logs for debugging.