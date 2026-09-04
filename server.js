import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import compression from 'compression';
import authRoutes from './routes/authRoutes.js';
import snippetRoutes from './routes/snippetRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import favoriteRoutes from './routes/favoriteRoutes.js';
import versionRoutes from './routes/versionRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Trust reverse proxy in production (Render, Vercel, Railway, Heroku) ─────
app.set('trust proxy', 1);

// ─── Response compression ───────────────────────────────────────────────────
app.use(compression());

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://codesnippetrayulu.vercel.app',
  'https://rayulumukku.com',
  'https://www.rayulumukku.com',
  'http://localhost:5173',
  'http://localhost:3000',
];
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    if (allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && isLocalhost)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

// ─── General rate limit ───────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});
app.use(generalLimiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/snippets', versionRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/favorites', favoriteRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Server error'),
  });
});

// ─── DB + Server ──────────────────────────────────────────────────────────────
let server;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/code-snippet-manager')
  .then(() => {
    console.log('MongoDB connected successfully');
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// ─── Graceful shutdown & unhandled errors ─────────────────────────────────────
const gracefulShutdown = (signal) => {
  console.log(`${signal} received. Closing HTTP server and database connection...`);
  if (server) {
    server.close(async () => {
      try {
        await mongoose.connection.close(false);
        console.log('HTTP server and MongoDB connection closed gracefully.');
        process.exit(0);
      } catch (err) {
        console.error('Error during database disconnection:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
