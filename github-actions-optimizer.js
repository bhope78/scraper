#!/usr/bin/env node

/**
 * GitHub Actions Performance Optimizer
 * Specialized optimizations for CI/CD environments
 * 
 * Features:
 * - Environment-specific browser configuration
 * - Resource management and memory optimization
 * - Parallel processing with worker threads
 * - Network optimization for cloud environments
 * - Artifact management and caching
 * - Performance monitoring and reporting
 * - Job timeout and failure handling
 */

const os = require('os');
const path = require('path');
const fs = require('fs').promises;

class GitHubActionsOptimizer {
    constructor(options = {}) {
        this.config = {
            // Environment detection
            isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
            runnerOS: process.env.RUNNER_OS || 'Linux',
            runnerName: process.env.RUNNER_NAME || 'unknown',
            
            // Resource limits
            maxMemoryUsage: options.maxMemoryUsage || this.calculateMemoryLimit(),
            maxCPUUsage: options.maxCPUUsage || this.calculateCPULimit(),
            
            // Browser optimization
            headless: options.headless !== undefined ? options.headless : true,
            disableImages: options.disableImages !== undefined ? options.disableImages : true,
            disableCSS: options.disableCSS !== undefined ? options.disableCSS : true,
            disableJavaScript: options.disableJavaScript !== undefined ? options.disableJavaScript : false,
            
            // Network optimization
            concurrentConnections: options.concurrentConnections || 6,
            requestTimeout: options.requestTimeout || 30000,
            navigationTimeout: options.navigationTimeout || 45000,
            
            // Performance optimization
            enableParallelProcessing: options.enableParallelProcessing !== undefined ? options.enableParallelProcessing : true,
            workerThreads: options.workerThreads || Math.min(os.cpus().length, 4),
            
            // Artifact management
            artifactsDir: options.artifactsDir || './artifacts',
            enableArtifacts: options.enableArtifacts !== undefined ? options.enableArtifacts : true,
            
            // Monitoring
            performanceReporting: options.performanceReporting !== undefined ? options.performanceReporting : true,
            memoryMonitoring: options.memoryMonitoring !== undefined ? options.memoryMonitoring : true,
            
            // Timeouts
            jobTimeout: options.jobTimeout || 3600000, // 1 hour
            operationTimeout: options.operationTimeout || 300000, // 5 minutes
        };

        this.state = {
            startTime: Date.now(),
            memoryPeaks: [],
            performanceMetrics: {
                browserLaunchTime: 0,
                pageNavigationTimes: [],
                dataOperationTimes: [],
                totalOperations: 0,
                successfulOperations: 0
            },
            resourceUsage: {
                currentMemory: 0,
                peakMemory: 0,
                cpuUsage: 0
            },
            artifacts: []
        };

        console.log('⚡ GitHub Actions Optimizer initialized');
        console.log(`🖥️  Runner: ${this.config.runnerOS} (${this.config.runnerName})`);
        console.log(`💾 Memory limit: ${(this.config.maxMemoryUsage / 1024 / 1024).toFixed(0)}MB`);
        console.log(`🧠 CPU cores: ${this.config.workerThreads}`);
        
        if (this.config.isGitHubActions) {
            this.startResourceMonitoring();
        }
    }

    /**
     * Calculate optimal memory limit based on environment
     */
    calculateMemoryLimit() {
        const totalMemory = os.totalmem();
        
        if (this.config.isGitHubActions) {
            // GitHub Actions runners typically have 7GB available
            // Reserve 2GB for system and other processes
            return Math.min(totalMemory * 0.7, 5 * 1024 * 1024 * 1024); // 5GB max
        }
        
        // Local development - more conservative
        return Math.min(totalMemory * 0.5, 4 * 1024 * 1024 * 1024); // 4GB max
    }

    /**
     * Calculate optimal CPU limit
     */
    calculateCPULimit() {
        const cpuCount = os.cpus().length;
        
        if (this.config.isGitHubActions) {
            // Use most cores in CI/CD environment
            return Math.max(Math.floor(cpuCount * 0.8), 1);
        }
        
        // Local development - leave some cores for other processes
        return Math.max(Math.floor(cpuCount * 0.6), 1);
    }

    /**
     * Get optimized browser launch options
     */
    getBrowserLaunchOptions() {
        const baseOptions = {
            headless: this.config.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off',
            ]
        };

        if (this.config.isGitHubActions) {
            // GitHub Actions specific optimizations
            baseOptions.args.push(
                '--single-process',
                '--no-zygote',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run'
            );
            
            // Resource limits
            baseOptions.args.push(
                `--max_old_space_size=${Math.floor(this.config.maxMemoryUsage / 1024 / 1024)}`,
                `--memory-pressure-off`
            );
        }

        // Performance optimizations
        if (this.config.disableImages) {
            baseOptions.args.push('--blink-settings=imagesEnabled=false');
        }

        return baseOptions;
    }

    /**
     * Get optimized page context options
     */
    getPageContextOptions() {
        const options = {
            viewport: { width: 1280, height: 720 }, // Smaller viewport for better performance
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            javaScriptEnabled: !this.config.disableJavaScript,
            permissions: [], // Disable all permissions for performance
            geolocation: undefined,
            timezoneId: 'UTC',
            locale: 'en-US',
            
            // Network optimization
            extraHTTPHeaders: {
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        };

        if (this.config.isGitHubActions) {
            // Additional CI/CD optimizations
            options.ignoreHTTPSErrors = true;
            options.bypassCSP = true;
        }

        return options;
    }

    /**
     * Configure network interception for performance
     */
    async configureNetworkOptimization(page) {
        if (!this.config.isGitHubActions) return;

        // Block unnecessary resources
        await page.route('**/*', (route, request) => {
            const resourceType = request.resourceType();
            const url = request.url();
            
            // Block images if disabled
            if (this.config.disableImages && resourceType === 'image') {
                route.abort();
                return;
            }
            
            // Block CSS if disabled
            if (this.config.disableCSS && resourceType === 'stylesheet') {
                route.abort();
                return;
            }
            
            // Block unnecessary resources
            if (['font', 'media', 'websocket'].includes(resourceType)) {
                route.abort();
                return;
            }
            
            // Block tracking and analytics
            if (url.includes('google-analytics') || 
                url.includes('googletagmanager') ||
                url.includes('facebook.com') ||
                url.includes('twitter.com') ||
                url.includes('linkedin.com')) {
                route.abort();
                return;
            }
            
            // Continue with the request
            route.continue();
        });

        console.log('🌐 Network optimization configured');
    }

    /**
     * Start resource monitoring
     */
    startResourceMonitoring() {
        if (!this.config.memoryMonitoring) return;

        const monitorInterval = setInterval(() => {
            const memUsage = process.memoryUsage();
            const currentMemory = memUsage.heapUsed + memUsage.external;
            
            this.state.resourceUsage.currentMemory = currentMemory;
            
            if (currentMemory > this.state.resourceUsage.peakMemory) {
                this.state.resourceUsage.peakMemory = currentMemory;
            }
            
            this.state.memoryPeaks.push({
                timestamp: Date.now(),
                memory: currentMemory,
                heap: memUsage.heapUsed,
                external: memUsage.external
            });
            
            // Keep only last 100 measurements
            if (this.state.memoryPeaks.length > 100) {
                this.state.memoryPeaks = this.state.memoryPeaks.slice(-50);
            }
            
            // Warning if memory usage is high
            if (currentMemory > this.config.maxMemoryUsage * 0.8) {
                console.warn(`⚠️ High memory usage: ${(currentMemory / 1024 / 1024).toFixed(0)}MB`);
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
            }
            
        }, 30000); // Check every 30 seconds

        // Clear interval on process exit
        process.on('exit', () => clearInterval(monitorInterval));
    }

    /**
     * Create performance monitoring wrapper
     */
    createPerformanceWrapper(operation, asyncFn) {
        return async (...args) => {
            const startTime = Date.now();
            this.state.performanceMetrics.totalOperations++;
            
            try {
                const result = await asyncFn(...args);
                
                const duration = Date.now() - startTime;
                this.recordPerformanceMetric(operation, duration, true);
                
                this.state.performanceMetrics.successfulOperations++;
                
                return result;
                
            } catch (error) {
                const duration = Date.now() - startTime;
                this.recordPerformanceMetric(operation, duration, false);
                
                throw error;
            }
        };
    }

    /**
     * Record performance metric
     */
    recordPerformanceMetric(operation, duration, success) {
        if (!this.config.performanceReporting) return;
        
        switch (operation) {
            case 'browser_launch':
                this.state.performanceMetrics.browserLaunchTime = duration;
                break;
            case 'page_navigation':
                this.state.performanceMetrics.pageNavigationTimes.push(duration);
                break;
            case 'data_operation':
                this.state.performanceMetrics.dataOperationTimes.push(duration);
                break;
        }
        
        // Log slow operations
        if (duration > 30000) { // 30 seconds
            console.warn(`🐌 Slow ${operation}: ${(duration / 1000).toFixed(1)}s`);
        }
    }

    /**
     * Create and save artifact
     */
    async createArtifact(name, data, type = 'json') {
        if (!this.config.enableArtifacts) return;

        try {
            await fs.mkdir(this.config.artifactsDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${name}-${timestamp}.${type}`;
            const filepath = path.join(this.config.artifactsDir, filename);
            
            let content;
            if (type === 'json') {
                content = JSON.stringify(data, null, 2);
            } else {
                content = data;
            }
            
            await fs.writeFile(filepath, content);
            
            this.state.artifacts.push({
                name,
                filename,
                filepath,
                size: content.length,
                created: Date.now()
            });
            
            console.log(`📄 Artifact created: ${filename}`);
            
        } catch (error) {
            console.warn(`⚠️ Failed to create artifact ${name}:`, error.message);
        }
    }

    /**
     * Save performance report
     */
    async savePerformanceReport() {
        const runtime = Date.now() - this.state.startTime;
        
        const report = {
            environment: {
                isGitHubActions: this.config.isGitHubActions,
                runnerOS: this.config.runnerOS,
                runnerName: this.config.runnerName,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            
            configuration: {
                maxMemoryUsage: this.config.maxMemoryUsage,
                maxCPUUsage: this.config.maxCPUUsage,
                workerThreads: this.config.workerThreads,
                headless: this.config.headless,
                disableImages: this.config.disableImages,
                disableCSS: this.config.disableCSS
            },
            
            performance: {
                totalRuntime: runtime,
                browserLaunchTime: this.state.performanceMetrics.browserLaunchTime,
                averagePageNavigation: this.calculateAverage(this.state.performanceMetrics.pageNavigationTimes),
                averageDataOperation: this.calculateAverage(this.state.performanceMetrics.dataOperationTimes),
                totalOperations: this.state.performanceMetrics.totalOperations,
                successfulOperations: this.state.performanceMetrics.successfulOperations,
                successRate: this.state.performanceMetrics.totalOperations > 0 ? 
                    (this.state.performanceMetrics.successfulOperations / this.state.performanceMetrics.totalOperations * 100).toFixed(2) + '%' : '0%'
            },
            
            resources: {
                peakMemoryUsage: this.state.resourceUsage.peakMemory,
                peakMemoryMB: (this.state.resourceUsage.peakMemory / 1024 / 1024).toFixed(2),
                memoryEfficiency: this.config.maxMemoryUsage > 0 ? 
                    (this.state.resourceUsage.peakMemory / this.config.maxMemoryUsage * 100).toFixed(2) + '%' : 'N/A',
                memoryTimeline: this.state.memoryPeaks
            },
            
            artifacts: this.state.artifacts,
            
            recommendations: this.generateOptimizationRecommendations()
        };
        
        await this.createArtifact('performance-report', report);
        
        return report;
    }

    /**
     * Calculate average from array of numbers
     */
    calculateAverage(numbers) {
        if (numbers.length === 0) return 0;
        return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }

    /**
     * Generate optimization recommendations
     */
    generateOptimizationRecommendations() {
        const recommendations = [];
        
        // Memory recommendations
        const memoryUsagePercent = this.config.maxMemoryUsage > 0 ? 
            (this.state.resourceUsage.peakMemory / this.config.maxMemoryUsage) : 0;
            
        if (memoryUsagePercent > 0.9) {
            recommendations.push({
                type: 'memory',
                level: 'high',
                message: 'Memory usage is very high. Consider increasing memory limits or reducing concurrent operations.'
            });
        } else if (memoryUsagePercent > 0.7) {
            recommendations.push({
                type: 'memory',
                level: 'medium',
                message: 'Memory usage is high. Monitor for potential memory leaks.'
            });
        }
        
        // Performance recommendations
        const avgNavTime = this.calculateAverage(this.state.performanceMetrics.pageNavigationTimes);
        if (avgNavTime > 10000) {
            recommendations.push({
                type: 'performance',
                level: 'medium',
                message: 'Page navigation is slow. Consider enabling more aggressive resource blocking.'
            });
        }
        
        // Success rate recommendations
        const successRate = this.state.performanceMetrics.totalOperations > 0 ? 
            (this.state.performanceMetrics.successfulOperations / this.state.performanceMetrics.totalOperations) : 1;
            
        if (successRate < 0.9) {
            recommendations.push({
                type: 'reliability',
                level: 'high',
                message: 'Low success rate detected. Check error handling and retry mechanisms.'
            });
        }
        
        return recommendations;
    }

    /**
     * Print performance summary
     */
    printPerformanceSummary() {
        const runtime = Date.now() - this.state.startTime;
        const memoryMB = (this.state.resourceUsage.peakMemory / 1024 / 1024).toFixed(0);
        const successRate = this.state.performanceMetrics.totalOperations > 0 ? 
            (this.state.performanceMetrics.successfulOperations / this.state.performanceMetrics.totalOperations * 100).toFixed(1) : 0;
        
        console.log('\n⚡ GitHub Actions Performance Summary:');
        console.log(`   • Total runtime: ${(runtime / 1000 / 60).toFixed(2)} minutes`);
        console.log(`   • Peak memory usage: ${memoryMB}MB`);
        console.log(`   • Total operations: ${this.state.performanceMetrics.totalOperations}`);
        console.log(`   • Success rate: ${successRate}%`);
        console.log(`   • Browser launch time: ${(this.state.performanceMetrics.browserLaunchTime / 1000).toFixed(1)}s`);
        
        if (this.state.performanceMetrics.pageNavigationTimes.length > 0) {
            const avgNav = this.calculateAverage(this.state.performanceMetrics.pageNavigationTimes);
            console.log(`   • Average page navigation: ${(avgNav / 1000).toFixed(1)}s`);
        }
        
        if (this.state.artifacts.length > 0) {
            console.log(`   • Artifacts created: ${this.state.artifacts.length}`);
        }
    }

    /**
     * Cleanup and save final reports
     */
    async cleanup() {
        console.log('🧹 GitHub Actions optimizer cleanup...');
        
        // Save performance report
        if (this.config.performanceReporting) {
            await this.savePerformanceReport();
        }
        
        // Print summary
        this.printPerformanceSummary();
        
        console.log('✅ GitHub Actions optimization cleanup complete');
    }
}

module.exports = GitHubActionsOptimizer;