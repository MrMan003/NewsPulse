const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { spawn } = require('child_process');
const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs');

const app = express();

// Enhanced CORS configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============ FIXED: Configuration with environment variables ============
// Get the project root directory (where scraper folder is)
const projectRoot = path.resolve(__dirname, '..'); // Go up one level from backend

const dbPath = path.resolve(projectRoot, process.env.DB_PATH || 'scraper/news_pulse.db');
const scriptPath = path.resolve(projectRoot, process.env.SCRIPT_PATH || 'scraper/pipeline.py');
const pythonPath = process.env.PYTHON_PATH || 'python3';

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`📁 Project Root: ${projectRoot}`);
console.log(`📁 DB Path: ${dbPath}`);
console.log(`📁 Script Path: ${scriptPath}`);

function getDb() {
    try {
        return new Database(dbPath, { readonly: false });
    } catch (err) {
        console.error('Database connection error:', err);
        throw new Error('Failed to connect to database');
    }
}

const jobs = new Map();

// Clean up old jobs periodically (every 10 minutes)
setInterval(() => {
    const now = Date.now();
    const MAX_JOB_AGE = 3600000; // 1 hour
    let cleanedCount = 0;
    
    for (const [id, job] of jobs) {
        if (job.finishedAt && (now - new Date(job.finishedAt).getTime() > MAX_JOB_AGE)) {
            jobs.delete(id);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old jobs`);
    }
}, 600000);

// ===== ROOT ENDPOINT =====
app.get('/', (req, res) => {
    res.json({
        message: 'NewsPulse API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            clusters: '/clusters',
            clusterDetail: '/clusters/:id',
            timeline: '/timeline',
            sources: '/sources',
            stats: '/stats',
            ingest: '/ingest/trigger (POST)',
            jobStatus: '/ingest/status/:jobId'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        db: 'unknown'
    };
    
    try {
        const db = getDb();
        db.prepare('SELECT 1').get();
        db.close();
        health.db = 'connected';
        res.json(health);
    } catch (err) {
        health.db = 'disconnected';
        health.status = 'unhealthy';
        health.error = err.message;
        res.status(503).json(health);
    }
});

// Get all clusters with enhanced information
app.get('/clusters', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT c.id, c.label, COUNT(a.id) as articleCount, 
                   MIN(a.published_at) as earliestArticle, 
                   MAX(a.published_at) as latestArticle,
                   GROUP_CONCAT(DISTINCT a.source) as sources
            FROM clusters c
            JOIN articles a ON c.id = a.cluster_id
            GROUP BY c.id
            ORDER BY latestArticle DESC
        `).all();
        db.close();
        res.json(rows);
    } catch (err) {
        console.error('Error fetching clusters:', err);
        res.status(500).json({ error: 'Failed to fetch clusters' });
    }
});

// Get specific cluster details
app.get('/clusters/:id', (req, res) => {
    try {
        const db = getDb();
        const clusterId = req.params.id;
        
        if (!clusterId || clusterId.length < 8) {
            return res.status(400).json({ error: 'Invalid cluster ID format' });
        }
        
        const rows = db.prepare(`
            SELECT title, url, summary, body, published_at, source, fetched_at
            FROM articles 
            WHERE cluster_id = ? 
            ORDER BY published_at ASC
        `).all(clusterId);
        
        db.close();
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Cluster not found' });
        }
        
        res.json({ 
            clusterId, 
            articleCount: rows.length,
            articles: rows 
        });
    } catch (err) {
        console.error('Error fetching cluster details:', err);
        res.status(500).json({ error: 'Failed to fetch cluster details' });
    }
});

// Get timeline data with source filtering
app.get('/timeline', (req, res) => {
    try {
        const db = getDb();
        const { source, startDate, endDate } = req.query;
        
        let query = `
            SELECT c.id, c.label, COUNT(a.id) as articleCount, 
                   MIN(a.published_at) as start_time, 
                   MAX(a.published_at) as end_time,
                   GROUP_CONCAT(DISTINCT a.source) as sources
            FROM clusters c
            JOIN articles a ON c.id = a.cluster_id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (source) {
            const sources = source.split(',').map(s => s.trim());
            query += ` AND a.source IN (${sources.map(() => '?').join(',')})`;
            params.push(...sources);
        }
        
        if (startDate) {
            query += ` AND a.published_at >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND a.published_at <= ?`;
            params.push(endDate);
        }
        
        query += ` GROUP BY c.id`;
        
        const rows = db.prepare(query).all(...params);
        db.close();
        
        if (rows.length === 0) {
            return res.json([]);
        }
        
        const maxCount = rows.reduce((m, r) => Math.max(m, r.articleCount), 1);
        
        const timelineData = rows.map(row => ({
            id: row.id,
            label: row.label,
            startDate: row.start_time,
            endDate: row.end_time,
            sizeMetric: row.articleCount,
            intensity: row.articleCount / maxCount,
            sources: row.sources ? row.sources.split(',') : []
        }));
        
        res.json(timelineData);
    } catch (err) {
        console.error('Error fetching timeline:', err);
        res.status(500).json({ error: 'Failed to fetch timeline data' });
    }
});

// Get distinct sources
app.get('/sources', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT DISTINCT source, COUNT(*) as articleCount 
            FROM articles 
            GROUP BY source 
            ORDER BY source
        `).all();
        db.close();
        res.json(rows.map(r => r.source));
    } catch (err) {
        console.error('Error fetching sources:', err);
        res.status(500).json({ error: 'Failed to fetch sources' });
    }
});

// Get statistics
app.get('/stats', (req, res) => {
    try {
        const db = getDb();
        const stats = {
            totalArticles: 0,
            totalClusters: 0,
            sources: [],
            oldestArticle: null,
            newestArticle: null
        };
        
        const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get();
        stats.totalArticles = articleCount.count;
        
        const clusterCount = db.prepare('SELECT COUNT(*) as count FROM clusters').get();
        stats.totalClusters = clusterCount.count;
        
        const dateRange = db.prepare(`
            SELECT MIN(published_at) as oldest, MAX(published_at) as newest 
            FROM articles
        `).get();
        stats.oldestArticle = dateRange.oldest;
        stats.newestArticle = dateRange.newest;
        
        db.close();
        res.json(stats);
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Trigger ingestion with improved error handling
app.post('/ingest/trigger', (req, res) => {
    const jobId = randomUUID();
    
    if (!fs.existsSync(scriptPath)) {
        return res.status(500).json({ 
            error: 'Pipeline script not found',
            path: scriptPath 
        });
    }
    
    jobs.set(jobId, { 
        status: 'running', 
        startedAt: new Date().toISOString(),
        progress: 0
    });
    
    console.log(`Starting job ${jobId}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath], {
        env: {
            ...process.env,
            DB_PATH: dbPath,
            PYTHONUNBUFFERED: '1'
        }
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log(`[Job ${jobId}]`, chunk.trim());
        
        if (chunk.includes('Fetching')) {
            jobs.set(jobId, { 
                ...jobs.get(jobId), 
                progress: 20,
                message: 'Fetching articles...'
            });
        } else if (chunk.includes('Extracting body')) {
            jobs.set(jobId, { 
                ...jobs.get(jobId), 
                progress: 40,
                message: 'Extracting article content...'
            });
        } else if (chunk.includes('Running clustering')) {
            jobs.set(jobId, { 
                ...jobs.get(jobId), 
                progress: 60,
                message: 'Clustering articles...'
            });
        } else if (chunk.includes('Grouped data into')) {
            jobs.set(jobId, { 
                ...jobs.get(jobId), 
                progress: 80,
                message: 'Saving clusters...'
            });
        } else if (chunk.includes('Pipeline Run Complete')) {
            jobs.set(jobId, { 
                ...jobs.get(jobId), 
                progress: 95,
                message: 'Finalizing...'
            });
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        console.error(`[Job ${jobId}] Error:`, chunk.trim());
    });

    pythonProcess.on('close', (code) => {
        const job = jobs.get(jobId);
        if (!job) return;
        
        const status = code === 0 ? 'completed' : 'failed';
        console.log(`Job ${jobId} completed with status: ${status}`);
        
        jobs.set(jobId, {
            ...job,
            status: status,
            finishedAt: new Date().toISOString(),
            progress: status === 'completed' ? 100 : 0,
            output: output.slice(-1000),
            error: errorOutput.slice(-1000),
            exitCode: code
        });
    });

    pythonProcess.on('error', (err) => {
        console.error(`Failed to start job ${jobId}:`, err);
        jobs.set(jobId, {
            ...jobs.get(jobId),
            status: 'failed',
            error: err.message,
            finishedAt: new Date().toISOString()
        });
    });

    res.status(202).json({ 
        jobId,
        message: 'Ingestion started',
        status: 'running'
    });
});

// Get job status
app.get('/ingest/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    const { output, error, ...safeJob } = job;
    res.json(safeJob);
});

// Get all jobs (for debugging)
app.get('/jobs', (req, res) => {
    const jobList = Array.from(jobs.entries()).map(([id, job]) => ({
        id,
        ...job,
        output: job.output ? 'Available' : undefined,
        error: job.error ? 'Available' : undefined
    }));
    res.json(jobList);
});

// 404 handler - MUST BE AFTER ALL ROUTES
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 3001;

// Validate environment variables
const requiredEnvVars = ['DB_PATH'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.warn('⚠️  Missing environment variables:', missingVars.join(', '));
    console.warn('Using default values where available');
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    process.exit(0);
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Backend REST API running at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📰 Sources: http://localhost:${PORT}/sources`);
    console.log(`📈 Timeline: http://localhost:${PORT}/timeline`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log(`\n🔧 Environment:`);
    console.log(`   DB_PATH: ${dbPath}`);
    console.log(`   Python: ${pythonPath}`);
    console.log(`   Script: ${scriptPath}`);
});

module.exports = app;