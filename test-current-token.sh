#!/bin/bash

echo "🔍 Testing Current Cloudflare API Token"
echo "========================================"
echo ""

# Check if token is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN is not set"
    echo ""
    echo "To test your token, run:"
    echo "export CLOUDFLARE_API_TOKEN='your_token_here'"
    echo "./test-current-token.sh"
    exit 1
fi

echo "✅ Token is set"
echo "   Length: ${#CLOUDFLARE_API_TOKEN} characters"
echo "   Starts with underscore: $([ "${CLOUDFLARE_API_TOKEN:0:1}" = "_" ] && echo "YES ✅" || echo "NO ❌")"
echo ""

echo "📋 Test 1: Verify token with Cloudflare API"
echo "--------------------------------------------"
response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json")

success=$(echo $response | jq -r '.success')
if [ "$success" = "true" ]; then
    echo "✅ Token is valid!"
    status=$(echo $response | jq -r '.result.status')
    echo "   Status: $status"
else
    echo "❌ Token is invalid!"
    echo "   Response: $response"
    exit 1
fi

echo ""
echo "📋 Test 2: Check D1 permissions"
echo "--------------------------------"
echo "Attempting to list D1 databases..."

# Use the token to list D1 databases
export CLOUDFLARE_API_TOKEN
result=$(npx wrangler d1 list --json 2>&1)
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "✅ D1 access successful!"
    echo ""
    echo "Databases found:"
    echo "$result" | jq -r '.[] | "   - \(.name) (ID: \(.uuid))"'
    
    # Check if Calhr database exists
    if echo "$result" | jq -e '.[] | select(.name == "Calhr")' > /dev/null; then
        echo ""
        echo "✅ Calhr database found!"
        
        echo ""
        echo "📋 Test 3: Query Calhr database"
        echo "--------------------------------"
        
        # Try to get count from ccJobs
        count_result=$(npx wrangler d1 execute Calhr --remote --command "SELECT COUNT(*) as count FROM ccJobs" --json 2>&1)
        count_exit=$?
        
        if [ $count_exit -eq 0 ]; then
            count=$(echo "$count_result" | jq -r '.[0].results[0].count')
            echo "✅ Successfully queried database!"
            echo "   Records in ccJobs: $count"
        else
            echo "❌ Failed to query database"
            echo "   Error: $count_result"
        fi
    else
        echo ""
        echo "⚠️  Calhr database not found in account"
        echo "   This token may be for a different account"
    fi
else
    echo "❌ D1 access failed!"
    echo "   Error: $result"
    echo ""
    echo "This token does not have D1 permissions or is for the wrong account"
fi

echo ""
echo "========================================"
echo "📊 SUMMARY"
echo "========================================"

if [ "$success" = "true" ] && [ $exit_code -eq 0 ]; then
    echo "✅ Token is valid and has D1 access"
    echo ""
    echo "This token should work in GitHub Actions."
    echo "Make sure it's properly set in GitHub Secrets:"
    echo "1. Go to: https://github.com/bhope78/scraper/settings/secrets/actions"
    echo "2. Update CLOUDFLARE_API_TOKEN"
    echo "3. Paste the token WITHOUT quotes"
else
    echo "❌ Token is not properly configured"
    echo ""
    echo "You need to generate a new token with D1 permissions."
    echo "See: generate-valid-token.md for instructions"
fi