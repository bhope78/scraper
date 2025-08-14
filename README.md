# Cloudflare D1 Database Setup

This folder contains scripts to connect to your existing Cloudflare D1 database and create a jobs table.

## Setup Instructions

1. **Create your .env file:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Cloudflare D1 database credentials.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Login to Wrangler (if not already logged in):**
   ```bash
   npx wrangler login
   ```

4. **Test the connection:**
   ```bash
   npm run test-connection
   ```

5. **Create the jobs table:**
   ```bash
   npm run create-table
   ```

## Files

- `schema.sql` - The jobs table schema (SQLite/D1 compatible)
- `create-table.js` - Script to create the jobs table in your D1 database
- `test-connection.js` - Script to test your D1 connection and check table status
- `wrangler.toml` - Wrangler configuration file (update with your database ID if needed)

## Table Schema

The jobs table includes all fields from your PostgreSQL database:
- Basic job info (title, department, location, etc.)
- Dates (publish_date, filing_date)
- Long text fields (job_description_duties, special_requirements, etc.)
- Timestamps (created_at, updated_at)

The schema uses SQLite syntax compatible with Cloudflare D1.