# D1 Database Connection Troubleshooting Guide
*Database Expert - Comprehensive troubleshooting for Cloudflare D1 issues*

## 🚨 Current Problem Analysis

Your D1 database shows **3476 records locally but 0 in GitHub Actions** due to:

1. **Critical**: Node.js v18.20.7 (Wrangler requires v20+)
2. **Critical**: Missing CLOUDFLARE_API_TOKEN in current environment
3. **Issue**: Local vs Remote database discrepancy

## 🎯 Root Cause Analysis

### Primary Issues

| Issue | Impact | Fix Priority |
|-------|--------|--------------|
| Node.js v18 vs v20+ requirement | Wrangler commands completely broken | **CRITICAL** |
| Missing API token | No database access | **CRITICAL** |
| Local/Remote data sync | Development vs Production inconsistency | **HIGH** |

### Why Local Shows 3476 but GitHub Actions Shows 0

1. **Local Development**: Using local SQLite database (`.wrangler/state/`)
2. **GitHub Actions**: Trying to access remote Cloudflare D1 database
3. **No Sync**: Local data was never pushed to remote database
4. **Failed Commands**: All wrangler commands failing due to Node.js version

## 🛠️ Immediate Fix Steps

### Step 1: Fix Node.js Version (CRITICAL)

```bash
# Check available Node versions
nvm list

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify version
node --version  # Should show v20.x.x
```

### Step 2: Set API Token (CRITICAL)

```bash
# Set for current session
export CLOUDFLARE_API_TOKEN="your-actual-token-here"

# Add to your shell profile for persistence
echo 'export CLOUDFLARE_API_TOKEN="your-actual-token-here"' >> ~/.bashrc
# or for zsh:
echo 'export CLOUDFLARE_API_TOKEN="your-actual-token-here"' >> ~/.zshrc

# Verify token is set
echo $CLOUDFLARE_API_TOKEN
```

### Step 3: Test Connection

```bash
# Run diagnostic
node d1-diagnostic.js

# Test database connection
node test-d1-connection.js

# Verify wrangler works
npx wrangler d1 list
```

### Step 4: Sync Local Data to Remote

```bash
# Check local record count
npx wrangler d1 execute Calhr --local --command "SELECT COUNT(*) FROM ccJobs" --json

# Check remote record count
npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) FROM ccJobs" --json

# If local has data and remote doesn't, migrate it
# (You'll need to export and import data)
```

## 🔧 Automated Fixes

### Run the Fix Script

```bash
# Automated diagnosis and fixes
node d1-fix-script.js
```

### Use the Enhanced Connection Manager

```javascript
const D1ConnectionManager = require('./d1-connection-manager');

const manager = new D1ConnectionManager({
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    databaseName: 'Calhr',
    tableName: 'ccJobs',
    verbose: true
});

await manager.initialize();
const count = await manager.getRecordCount();
console.log(`Records: ${count}`);
```

## 🔍 Diagnostic Commands

### Environment Check
```bash
# Node version
node --version

# NVM availability  
nvm --version

# Wrangler version (after Node.js fix)
npx wrangler --version

# API token status
echo $CLOUDFLARE_API_TOKEN | wc -c
```

### Database Check
```bash
# List databases
npx wrangler d1 list

# Check specific database
npx wrangler d1 info Calhr

# Test query
npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) FROM ccJobs" --json
```

### Authentication Check
```bash
# Verify authentication
npx wrangler whoami

# Test API token
curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/user"
```

## 🚀 GitHub Actions Configuration

### Required Secrets

Set in your GitHub repository settings → Secrets and variables → Actions:

```
CLOUDFLARE_API_TOKEN = your-actual-cloudflare-api-token
```

### Workflow Configuration

```yaml
name: D1 Scraper
on: [push, schedule]

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run scraper
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: node playwright-windowed-scraper-d1.js
```

## 🔄 Data Migration Process

### Export Local Data

```bash
# Export local data to JSON
npx wrangler d1 execute Calhr --local --command "SELECT * FROM ccJobs" --json > local_backup.json

# Or create SQL dump
npx wrangler d1 execute Calhr --local --command ".dump ccJobs" > local_backup.sql
```

### Import to Remote

```bash
# Method 1: Using your existing insert script
CLOUDFLARE_API_TOKEN="your-token" node d1-insert-local-updated.js

# Method 2: Batch SQL commands (for large datasets)
# Split your data into smaller batches and run multiple commands
```

### Verify Migration

```bash
# Check counts match
echo "Local count:"
npx wrangler d1 execute Calhr --local --command "SELECT COUNT(*) FROM ccJobs" --json

echo "Remote count:"
npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) FROM ccJobs" --json
```

## 📊 Health Monitoring

### Start Continuous Monitoring

```javascript
const D1HealthMonitor = require('./d1-health-monitor');

const monitor = new D1HealthMonitor({
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    logToFile: true,
    enableAlerts: true
});

await monitor.startMonitoring();
```

### Manual Health Check

```bash
# Basic health check
node -e "
const D1ConnectionManager = require('./d1-connection-manager');
const manager = new D1ConnectionManager();
manager.initialize().then(() => manager.getHealthStatus()).then(console.log);
"
```

## ⚡ Quick Commands Reference

```bash
# Complete diagnostic
node d1-diagnostic.js

# Automated fixes
node d1-fix-script.js

# Test connection
node test-d1-connection.js

# Check record count (remote)
npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) FROM ccJobs" --json

# List all databases
npx wrangler d1 list

# Verify authentication
npx wrangler whoami
```

## 🆘 Emergency Recovery

### If Everything Fails

1. **Verify Prerequisites**:
   ```bash
   node --version  # Must be v20+
   echo $CLOUDFLARE_API_TOKEN  # Must show your token
   npx wrangler whoami  # Must show your account
   ```

2. **Test Basic Connectivity**:
   ```bash
   npx wrangler d1 list  # Should show your databases
   ```

3. **Manual Database Test**:
   ```bash
   npx wrangler d1 execute Calhr --remote --command "SELECT 1 as test" --json
   ```

4. **Check Database Exists**:
   ```bash
   npx wrangler d1 info Calhr
   ```

### Recovery Script

```bash
#!/bin/bash
echo "🚨 D1 Emergency Recovery"
echo "1. Checking Node.js..."
nvm use 20 2>/dev/null || echo "⚠️ Run: nvm install 20 && nvm use 20"

echo "2. Checking API token..."
[ -z "$CLOUDFLARE_API_TOKEN" ] && echo "⚠️ Set: export CLOUDFLARE_API_TOKEN='your-token'"

echo "3. Testing wrangler..."
npx wrangler whoami || echo "❌ Authentication failed"

echo "4. Testing database..."
npx wrangler d1 execute Calhr --remote --command "SELECT 1" --json || echo "❌ Database access failed"
```

## 📞 Support Information

- **Database ID**: f9fe4ade-a55b-4600-bf24-64172903c2c6
- **Database Name**: Calhr  
- **Table Name**: ccJobs
- **Expected Record Count**: 3476+ (based on local data)

## ✅ Success Indicators

You'll know everything is working when:

1. `node --version` shows v20+
2. `npx wrangler whoami` shows your account
3. `node d1-diagnostic.js` shows all green checkmarks
4. `node test-d1-connection.js` completes successfully
5. Remote and local record counts match
6. GitHub Actions can access the database

## 🔜 Next Steps After Fixing

1. Set up continuous monitoring with `d1-health-monitor.js`
2. Implement proper error handling in your scrapers
3. Set up automated backups
4. Configure alerts for data discrepancies
5. Document your deployment process