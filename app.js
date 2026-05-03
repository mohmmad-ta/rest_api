const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const qs = require('qs');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
require('dotenv').config();

const usersRouter = require('./routes/usersRouter');
const mealsRouter = require('./routes/mealsRouter');
const ordersRouter = require('./routes/ordersRouter');
const reviewRoutes = require('./routes/reviewRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');

const app = express();
const api = process.env.API_URL

const parseTrustProxy = (value) => {
    if (value === undefined || value === null || value === '') {
        return process.env.NODE_ENV === 'production' ? 1 : false;
    }

    if (typeof value === 'number') {
        return value;
    }

    const normalized = String(value).trim().toLowerCase();

    if (['true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    if (normalized === 'loopback' || normalized === 'linklocal' || normalized === 'uniquelocal') {
        return normalized;
    }

    const numericValue = Number(normalized);
    if (Number.isInteger(numericValue) && numericValue >= 0) {
        return numericValue;
    }

    return value;
};

app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === 'development') {
    app.use(logger('dev'));
}

const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 300, // limit each IP to 300 requests per windowMs
    message: 'Too many requests from this IP, please try again in an hour!',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || ''),
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '15kb' }));

app.set('query parser', str => qs.parse(str));

// Prevent parameter pollution
app.use(
    hpp({
        whitelist: [
            'duration',
        ]
    })
);

const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }

    return allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin === origin) {
            return true;
        }

        if (!allowedOrigin.includes('*')) {
            return false;
        }

        const pattern = allowedOrigin
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');

        return new RegExp(`^${pattern}$`).test(origin);
    });
};

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        return callback(new AppError('CORS origin is not allowed.', 403));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-app-client-key', 'x-auth-mode'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(`${api}/auth`, usersRouter);
app.use(`${api}/meal`, mealsRouter);
app.use(`${api}/order`, ordersRouter);
app.use(`${api}/review`, reviewRoutes);
app.use(`${api}/category`, categoryRoutes);
app.use(`${api}/statistics`, statisticsRoutes);



app.use(globalErrorHandler);
module.exports = app;
