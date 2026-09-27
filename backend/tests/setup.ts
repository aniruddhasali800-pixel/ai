process.env.NODE_ENV = 'test';
// Force the embedded MongoDB so tests never touch a real database.
process.env.MONGODB_URI = '';
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-0000000000';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-0000000000';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-payment-webhook-secret';
process.env.SWIGGY_WEBHOOK_SECRET = 'test-swiggy-webhook-secret';
process.env.ZOMATO_WEBHOOK_SECRET = 'test-zomato-webhook-secret';
process.env.WEBSITE_WEBHOOK_SECRET = 'test-website-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-razorpay-webhook-secret';
