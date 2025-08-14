#!/bin/bash

# Script to run the scraper locally using OAuth (no API token needed)
echo "🚀 Running CalCareers D1 Scraper Locally"
echo "This will use your Wrangler OAuth login (no API token needed)"
echo "==========================================="

# Use Node 20
source ~/.nvm/nvm.sh
nvm use v20.19.4

# Unset any API token to force OAuth
unset CLOUDFLARE_API_TOKEN

# Set flag to indicate local run
export LOCAL_RUN=true

# Run the scraper
node playwright-windowed-scraper-d1-local.js