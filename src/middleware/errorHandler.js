/**
 * Global Error Handler Middleware
 */

function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Log full error in development
    if (process.env.NODE_ENV !== 'production') {
        console.error(`❌ [${req.method} ${req.path}]`, err);
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
}

module.exports = errorHandler;
