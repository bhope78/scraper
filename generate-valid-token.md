# 🔐 Generate Valid Cloudflare API Token for GitHub Actions

## Step 1: Generate New Token with Correct Permissions

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"

2. **Use Custom Token Template**
   - Click "Get started" under "Custom token"

3. **Configure Token Permissions**
   
   **Token Name:** `GitHub Actions D1 Scraper`
   
   **Permissions (CRITICAL - Add ALL of these):**
   ```
   Account - D1:Edit
   Account - Account Settings:Read
   Account - Cloudflare Workers:Edit
   Zone - Zone:Read (optional, if you have zones)
   ```

4. **Account Resources**
   - Include → Select your account: `Bryan@bhdev.co's Account`
   - Account ID should be: `a2d15074d39d49779729f74c83fc8189`

5. **IP Filtering (Optional)**
   - Leave blank for GitHub Actions

6. **TTL**
   - Leave as "Forever" or set a long expiration

7. **Create Token**
   - Click "Continue to summary"
   - Review permissions
   - Click "Create Token"

## Step 2: Copy Token EXACTLY

⚠️ **CRITICAL**: The token will look like this:
```
_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- It starts with an underscore `_`
- Copy the ENTIRE token including the underscore
- You won't see this token again!

## Step 3: Test Token Locally First

```bash
# Set the token locally
export CLOUDFLARE_API_TOKEN="_your_actual_token_here"

# Test it works
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json"

# Should return:
# {"result":{"id":"...","status":"active"},"success":true,...}
```

## Step 4: Test with Wrangler

```bash
# Test D1 access
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" npx wrangler d1 list

# Should show:
# ┌──────────────────────────────────────┬───────┬─────────────────────┐
# │ uuid                                 │ name  │ created_at          │
# ├──────────────────────────────────────┼───────┼─────────────────────┤
# │ f9fe4ade-a55b-4600-bf24-64172903c2c6 │ Calhr │ 2025-08-14T16:48:47 │
# └──────────────────────────────────────┴───────┴─────────────────────┘
```

## Step 5: Update GitHub Secret

1. **Go to GitHub Repository Settings**
   - https://github.com/bhope78/scraper/settings/secrets/actions

2. **Update CLOUDFLARE_API_TOKEN**
   - Click on `CLOUDFLARE_API_TOKEN`
   - Click "Update"
   - **IMPORTANT**: Paste the token WITHOUT quotes
   - The token should start with underscore: `_xxxxx...`
   - Click "Update secret"

## Step 6: Verify in GitHub Actions

Run this test workflow to verify:

```yaml
name: Test Token
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test Token
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          echo "Token length: ${#CLOUDFLARE_API_TOKEN}"
          echo "Token starts with underscore: $([ "${CLOUDFLARE_API_TOKEN:0:1}" = "_" ] && echo "YES" || echo "NO")"
          
          # Test API
          curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
               -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
               -H "Content-Type: application/json"
```

## Common Issues & Solutions

### Issue 1: "Authentication error"
**Cause:** Token doesn't have D1 permissions
**Solution:** Create new token with D1:Edit permission

### Issue 2: "Command failed: npx wrangler d1 execute..."
**Cause:** Token is invalid or expired
**Solution:** Generate fresh token with correct permissions

### Issue 3: Token works locally but not in GitHub Actions
**Cause:** Token not properly set in GitHub Secrets
**Solution:** Re-paste token, ensure no extra spaces or quotes

### Issue 4: "Cannot read properties of undefined"
**Cause:** Wrangler can't authenticate
**Solution:** Ensure token starts with underscore and has full permissions

## Required Token Permissions Summary

✅ **MUST HAVE:**
- Account → D1 → Edit
- Account → Account Settings → Read

✅ **RECOMMENDED:**
- Account → Cloudflare Workers → Edit

❌ **NOT NEEDED:**
- User permissions
- Billing permissions
- Analytics permissions

## Test Command After Setup

Once token is updated in GitHub Secrets, test with:

```bash
gh workflow run "CalCareers D1 Scraper" --ref main
```

Then check the health-check job in the workflow run. It should show:
- ✅ Authentication successful
- ✅ D1 access granted
- ✅ Database found: Calhr

If health check passes, the scraper will run successfully.