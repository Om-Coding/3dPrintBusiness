const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session'); // Added session middleware
const stripe = require('stripe')('sk_test_51RBMbMIGrxJSEZdQLRrmTQlo123Qw8JvlyPgUnzaV0gaLFPmD3ssPF5ObvgaPKd8oog79JpPPdt6OpUWdFWSgxAC00t7dxit7R');
const app = express();
const port = 3000;

// Session middleware - add this before other middleware
app.use(session({
  secret: 'your-secret-key', // Change this to a secure random string
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve order.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Database connection with improved error handling
const connection = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12769758',
  password: 'YfrYsG8BpA',
  database: 'sql12769758',
  port: 3306
});

// Better connection handling with retry logic
function connectWithRetry() {
  connection.connect(err => {
    if (err) {
      console.error('MySQL connection failed:', err);
      console.log('Retrying in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    } else {
      console.log('Connected to MySQL');
    }
  });
}

connectWithRetry();

// Price lookup
function getPrice(printer_model) {
  const prices = {
    "Hexagon Fidget": 2,
    "Cone Fidget": 2,
    "Fidget Ring": 1,
    "Big Hexagon Fidget": 3,
    "Infinity Cube": 3,
    "Dragon": 4,
    "Sword": 9,
    "Octopus": 3,
    "Shark": 2,
    "The Rocktopus": 2,
    "Mini Tic Tac Toe": 4,
    "Reed Case": 3,
    "Small Container": 2,
    "Big Container": 3,
    "Among Us": 2 
  };
  return prices[printer_model] || 0;
}

// Stripe Checkout session creation
app.post('/create-checkout-session', async (req, res) => {
  const { full_name, email, phone, address, printer_model, quantity } = req.body;
  const price = getPrice(printer_model);
  const total = price * parseInt(quantity);
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: printer_model },
          unit_amount: price * 100
        },
        quantity: parseInt(quantity)
      }],
      mode: 'payment',
      success_url: `http://localhost:${port}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:${port}/cancel`
    });
    
    // Store order data in session
    req.session.orderData = { 
      full_name, 
      email, 
      phone, 
      address, 
      printer_model, 
      quantity, 
      total 
    };
    
    res.json({ id: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).send('Stripe session creation failed');
  }
});

// Cancel page
app.get('/cancel', (req, res) => {
  res.send('<h2>Payment cancelled. <a href="/">Try again</a></h2>');
});

// Success page with DB insert
app.get('/success', async (req, res) => {
  const session_id = req.query.session_id;
  
  // Check if we have session data
  if (!req.session.orderData) {
    return res.status(400).send('Order data not found. Please try again.');
  }
  
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const customer_email = session.customer_details.email;
    const amount_paid = session.amount_total / 100;
    
    // Get data from the session
    const { full_name, email, phone, address, printer_model, quantity } = req.session.orderData;
    
    const values = [
      full_name, 
      email, 
      phone, 
      address,
      printer_model, 
      quantity, 
      amount_paid, 
      session.payment_intent
    ];
    
    const sql = `
      INSERT INTO PrinterOrders
      (full_name, email, phone, address, printer_model, quantity, price, razorpay_payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error('DB insert error:', err);
        return res.status(500).send('Database error. Your payment was successful, but we could not save your order. Please contact support.');
      }
      
      // Clear session data after successful order
      req.session.orderData = null;
      
      res.send(`
        <h2>Payment successful!</h2>
        <p>Order ID: ${result.insertId}</p>
        <p>Thank you for your purchase, ${full_name}!</p>
        <p><a href="/">Return to shop</a></p>
      `);
    });
  } catch (err) {
    console.error('Stripe success error:', err);
    res.status(500).send('Payment verification failed. If your payment was successful, please contact support.');
  }
});

// Error handling for database connection loss
connection.on('error', function(err) {
  console.error('Database error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('Database connection lost. Attempting to reconnect...');
    connectWithRetry();
  } else {
    throw err;
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
