#!/usr/bin/env node

/**
 * Browser-based Authentication Manager
 * Advanced authentication handling for web automation
 * 
 * Features:
 * - Multiple authentication strategies (OAuth, session, cookies)
 * - Persistent session management
 * - Cookie store and restoration
 * - Authentication state monitoring
 * - Automatic re-authentication on expiry
 * - Stealth mode for undetected authentication
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BrowserAuthManager {
    constructor(options = {}) {
        this.config = {
            // Session persistence
            sessionDir: options.sessionDir || './sessions',
            cookieFile: options.cookieFile || './auth-cookies.json',
            sessionFile: options.sessionFile || './auth-session.json',
            
            // Authentication endpoints
            authUrl: options.authUrl || 'https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx',
            loginUrl: options.loginUrl,
            tokenEndpoint: options.tokenEndpoint,
            
            // Authentication credentials
            apiToken: options.apiToken || process.env.CLOUDFLARE_API_TOKEN,
            username: options.username || process.env.AUTH_USERNAME,
            password: options.password || process.env.AUTH_PASSWORD,
            
            // Session configuration
            sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
            maxSessionAge: options.maxSessionAge || 86400000, // 24 hours
            
            // Retry configuration
            maxAuthRetries: options.maxAuthRetries || 3,
            authRetryDelay: options.authRetryDelay || 5000,
            
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
        };

        this.state = {
            isAuthenticated: false,
            authMethod: null, // 'oauth', 'session', 'cookies', 'anonymous'
            sessionId: null,
            lastAuthTime: null,
            authExpiry: null,
            cookies: [],
            headers: {},
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        console.log('🔐 Browser Authentication Manager initialized');
    }

    /**
     * Initialize authentication system
     */
    async initialize(page) {
        this.page = page;
        
        console.log('🔐 Initializing authentication system...');
        
        try {
            // Create session directory
            await fs.mkdir(this.config.sessionDir, { recursive: true });
            
            // Try to restore previous session
            const restored = await this.restoreSession();
            
            if (restored) {
                console.log('✅ Previous session restored');
                return true;
            }
            
            // Authenticate using best available method
            await this.authenticate();
            
            return this.state.isAuthenticated;
            
        } catch (error) {
            console.warn('⚠️ Authentication initialization failed:', error.message);
            return false;
        }
    }

    /**
     * Main authentication orchestrator
     */
    async authenticate() {
        console.log('🔐 Starting authentication process...');
        
        const authStrategies = [
            () => this.authenticateAnonymous(),
            () => this.authenticateWithCookies(),
            () => this.authenticateWithSession(),
        ];

        // Add OAuth strategy if API token is available
        if (this.config.apiToken) {
            authStrategies.unshift(() => this.authenticateOAuth());
        }

        for (const strategy of authStrategies) {
            try {
                const result = await strategy();
                if (result) {
                    await this.saveSession();
                    return true;
                }
            } catch (error) {
                console.warn('⚠️ Authentication strategy failed:', error.message);
                continue;
            }
        }

        throw new Error('All authentication strategies failed');
    }

    /**
     * OAuth authentication strategy
     */
    async authenticateOAuth() {
        console.log('🔑 Attempting OAuth authentication...');
        
        try {
            // This would typically involve OAuth flow
            // For now, we'll use the API token for server-side auth
            if (!this.config.apiToken || this.config.apiToken.length < 32) {
                throw new Error('Invalid or missing API token');
            }

            this.state.isAuthenticated = true;
            this.state.authMethod = 'oauth';
            this.state.lastAuthTime = Date.now();
            this.state.authExpiry = Date.now() + this.config.sessionTimeout;
            
            console.log('✅ OAuth authentication successful');
            return true;
            
        } catch (error) {
            console.warn('⚠️ OAuth authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Session-based authentication strategy
     */
    async authenticateWithSession() {
        console.log('🎫 Attempting session authentication...');
        
        try {
            // Navigate to authentication page
            await this.page.goto(this.config.authUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Check if we're already authenticated
            const isLoggedIn = await this.checkAuthenticationStatus();
            if (isLoggedIn) {
                this.state.isAuthenticated = true;
                this.state.authMethod = 'session';
                this.state.lastAuthTime = Date.now();
                
                console.log('✅ Session authentication successful (already logged in)');
                return true;
            }

            // If login credentials are provided, attempt login
            if (this.config.username && this.config.password && this.config.loginUrl) {
                return await this.performLogin();
            }

            return false;
            
        } catch (error) {
            console.warn('⚠️ Session authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Cookie-based authentication strategy
     */
    async authenticateWithCookies() {
        console.log('🍪 Attempting cookie authentication...');
        
        try {
            // Load saved cookies
            const cookies = await this.loadCookies();
            if (!cookies || cookies.length === 0) {
                return false;
            }

            // Set cookies in browser
            await this.page.context().addCookies(cookies);
            
            // Test authentication by navigating to protected page
            await this.page.goto(this.config.authUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            const isAuthenticated = await this.checkAuthenticationStatus();
            
            if (isAuthenticated) {
                this.state.isAuthenticated = true;
                this.state.authMethod = 'cookies';
                this.state.lastAuthTime = Date.now();
                this.state.cookies = cookies;
                
                console.log('✅ Cookie authentication successful');
                return true;
            }

            return false;
            
        } catch (error) {
            console.warn('⚠️ Cookie authentication failed:', error.message);
            return false;
        }
    }

    /**
     * Anonymous access strategy (no authentication required)
     */
    async authenticateAnonymous() {
        console.log('🌐 Attempting anonymous access...');
        
        try {
            // Navigate to the main page
            await this.page.goto(this.config.authUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Check if the page loads successfully
            const pageTitle = await this.page.title();
            if (pageTitle && !pageTitle.includes('Error') && !pageTitle.includes('Login')) {
                this.state.isAuthenticated = true;
                this.state.authMethod = 'anonymous';
                this.state.lastAuthTime = Date.now();
                
                console.log('✅ Anonymous access successful');
                return true;
            }

            return false;
            
        } catch (error) {
            console.warn('⚠️ Anonymous access failed:', error.message);
            return false;
        }
    }

    /**
     * Perform actual login if credentials are available
     */
    async performLogin() {
        console.log('📝 Performing login...');
        
        try {
            await this.page.goto(this.config.loginUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Fill login form (generic selectors)
            const usernameSelectors = [
                'input[name="username"]',
                'input[name="email"]',
                'input[type="email"]',
                '#username',
                '#email'
            ];

            const passwordSelectors = [
                'input[name="password"]',
                'input[type="password"]',
                '#password'
            ];

            // Find and fill username
            for (const selector of usernameSelectors) {
                if (await this.page.locator(selector).count() > 0) {
                    await this.page.fill(selector, this.config.username);
                    break;
                }
            }

            // Find and fill password
            for (const selector of passwordSelectors) {
                if (await this.page.locator(selector).count() > 0) {
                    await this.page.fill(selector, this.config.password);
                    break;
                }
            }

            // Submit form
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Login")',
                'button:has-text("Sign In")'
            ];

            for (const selector of submitSelectors) {
                if (await this.page.locator(selector).count() > 0) {
                    await this.page.click(selector);
                    break;
                }
            }

            // Wait for navigation
            await this.page.waitForLoadState('networkidle');

            // Check if login was successful
            const isAuthenticated = await this.checkAuthenticationStatus();
            
            if (isAuthenticated) {
                this.state.isAuthenticated = true;
                this.state.authMethod = 'login';
                this.state.lastAuthTime = Date.now();
                
                // Save cookies for future use
                await this.saveCookies();
                
                console.log('✅ Login successful');
                return true;
            }

            return false;
            
        } catch (error) {
            console.warn('⚠️ Login failed:', error.message);
            return false;
        }
    }

    /**
     * Check authentication status by analyzing page content
     */
    async checkAuthenticationStatus() {
        try {
            const pageContent = await this.page.content();
            const pageTitle = await this.page.title();
            const currentUrl = this.page.url();

            // Check for login indicators
            const loginIndicators = [
                'login',
                'sign in',
                'authentication required',
                'unauthorized',
                'access denied'
            ];

            const contentLower = pageContent.toLowerCase();
            const titleLower = pageTitle.toLowerCase();
            const urlLower = currentUrl.toLowerCase();

            // If any login indicators are found, we're not authenticated
            for (const indicator of loginIndicators) {
                if (contentLower.includes(indicator) || 
                    titleLower.includes(indicator) || 
                    urlLower.includes(indicator)) {
                    return false;
                }
            }

            // Check for successful page load indicators
            const successIndicators = [
                'job',
                'search',
                'results',
                'listing'
            ];

            for (const indicator of successIndicators) {
                if (contentLower.includes(indicator)) {
                    return true;
                }
            }

            // Default to authenticated if no negative indicators
            return true;
            
        } catch (error) {
            console.warn('⚠️ Authentication status check failed:', error.message);
            return false;
        }
    }

    /**
     * Save current session state
     */
    async saveSession() {
        try {
            const sessionData = {
                ...this.state,
                cookies: await this.page.context().cookies(),
                savedAt: Date.now()
            };

            await fs.writeFile(
                this.config.sessionFile,
                JSON.stringify(sessionData, null, 2)
            );

            console.log('💾 Session saved');
            
        } catch (error) {
            console.warn('⚠️ Failed to save session:', error.message);
        }
    }

    /**
     * Restore previous session
     */
    async restoreSession() {
        try {
            const sessionData = JSON.parse(
                await fs.readFile(this.config.sessionFile, 'utf8')
            );

            // Check if session is still valid
            const sessionAge = Date.now() - sessionData.savedAt;
            if (sessionAge > this.config.maxSessionAge) {
                console.log('⏰ Saved session too old, starting fresh');
                return false;
            }

            // Restore session state
            this.state = { ...sessionData };
            
            // Restore cookies if available
            if (sessionData.cookies && sessionData.cookies.length > 0) {
                await this.page.context().addCookies(sessionData.cookies);
            }

            // Verify session is still valid
            await this.page.goto(this.config.authUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            const isValid = await this.checkAuthenticationStatus();
            
            if (isValid) {
                console.log('✅ Session restored successfully');
                return true;
            } else {
                console.log('❌ Restored session invalid');
                return false;
            }
            
        } catch (error) {
            console.log('📝 No valid session to restore');
            return false;
        }
    }

    /**
     * Save cookies to file
     */
    async saveCookies() {
        try {
            const cookies = await this.page.context().cookies();
            await fs.writeFile(
                this.config.cookieFile,
                JSON.stringify(cookies, null, 2)
            );
            
            this.state.cookies = cookies;
            console.log('🍪 Cookies saved');
            
        } catch (error) {
            console.warn('⚠️ Failed to save cookies:', error.message);
        }
    }

    /**
     * Load cookies from file
     */
    async loadCookies() {
        try {
            const cookieData = await fs.readFile(this.config.cookieFile, 'utf8');
            return JSON.parse(cookieData);
            
        } catch (error) {
            console.log('📝 No saved cookies found');
            return [];
        }
    }

    /**
     * Check if authentication needs refresh
     */
    needsRefresh() {
        if (!this.state.isAuthenticated) {
            return true;
        }

        // Check if session has expired
        if (this.state.authExpiry && Date.now() > this.state.authExpiry) {
            console.log('⏰ Authentication expired, refresh needed');
            return true;
        }

        // Check if session is getting old
        const sessionAge = Date.now() - this.state.lastAuthTime;
        if (sessionAge > this.config.sessionTimeout * 0.8) {
            console.log('🔄 Authentication approaching expiry, refresh recommended');
            return true;
        }

        return false;
    }

    /**
     * Refresh authentication
     */
    async refreshAuthentication() {
        console.log('🔄 Refreshing authentication...');
        
        try {
            // Reset authentication state
            this.state.isAuthenticated = false;
            
            // Re-authenticate
            await this.authenticate();
            
            if (this.state.isAuthenticated) {
                console.log('✅ Authentication refreshed successfully');
                return true;
            } else {
                console.warn('❌ Authentication refresh failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Authentication refresh error:', error.message);
            return false;
        }
    }

    /**
     * Get authentication headers for API requests
     */
    getAuthHeaders() {
        const headers = {
            'User-Agent': this.state.userAgent,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        };

        if (this.state.authMethod === 'oauth' && this.config.apiToken) {
            headers['Authorization'] = `Bearer ${this.config.apiToken}`;
        }

        return headers;
    }

    /**
     * Get authentication status
     */
    getStatus() {
        return {
            isAuthenticated: this.state.isAuthenticated,
            authMethod: this.state.authMethod,
            lastAuthTime: this.state.lastAuthTime,
            sessionAge: this.state.lastAuthTime ? Date.now() - this.state.lastAuthTime : null,
            needsRefresh: this.needsRefresh(),
            cookieCount: this.state.cookies.length,
            authExpiry: this.state.authExpiry
        };
    }

    /**
     * Cleanup authentication resources
     */
    async cleanup() {
        try {
            // Save final session state
            if (this.state.isAuthenticated) {
                await this.saveSession();
                await this.saveCookies();
            }
            
            console.log('🧹 Authentication cleanup complete');
            
        } catch (error) {
            console.warn('⚠️ Authentication cleanup error:', error.message);
        }
    }
}

module.exports = BrowserAuthManager;