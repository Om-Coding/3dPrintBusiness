// server.js (Stripe version)
const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session'); // Add this package
const stripe = require('stripe')('sk_test_51RBMbMIGrxJSEZdQLRrmTQlo123Qw8JvlyPgUnzaV0gaLFPmD3ssPF5ObvgaPKd8oog79JpPPdt6OpUWdFWSgxAC00t7dxit7R');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'print-da-toys-secret',
  resave: false,
  saveUninitialized: true
}));

// Serve order.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// MySQL connection
const connection = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12769758',
  password: 'YfrYsG8BpA',
  database: 'sql12769758',
  port: 3306
});

connection.connect(err => {
  if (err) return console.error('MySQL connection failed:', err);
  console.log('Connected to MySQL');
});

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
    // Get domain dynamically
    const domain = req.protocol + '://' + req.get('host');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: printer_model },
          unit_amount: price * 100
        },
        quantity: quantity
      }],
      mode: 'payment',
      success_url: `${domain}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/cancel`
    });
    
    // Store order info in session
    req.session.orderData = { full_name, email, phone, address, printer_model, quantity, total };
    
    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Stripe session creation failed');
  }
});

// Success page with DB insert
app.get('/success', async (req, res) => {
  const session_id = req.query.session_id;
  
  if (!req.session.orderData) {
    return res.status(400).send('Order data not found');
  }
  
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const amount_paid = session.amount_total / 100;
    
    // Get data from session
    const { full_name, email, phone, address, printer_model, quantity } = req.session.orderData;
    
    const values = [
      full_name, email, phone, address,
      printer_model, quantity, amount_paid, session.payment_intent
    ];
    
    const sql = `
      INSERT INTO PrinterOrders
      (full_name, email, phone, address, printer_model, quantity, price, payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error('DB insert error:', err);
        return res.send('Database error.');
      }
      
      // Clear session data
      req.session.orderData = null;
      
      res.send(`
        <html>
          <head>
            <title>Payment Successful</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
              body { background-color: #212529; color: #fff; text-align: center; padding-top: 50px; }
              .success-container { max-width: 600px; margin: 0 auto; background-color: #333; padding: 30px; border-radius: 8px; }
              h2 { color: #ffc107; }
              .btn-primary { background-color: #ffc107; color: #212529; border: none; }
              .btn-primary:hover { background-color: #e0a800; color: #212529; }
            </style>
          </head>
          <body>
            <div class="success-container">
              <h2>Payment successful!</h2>
              <p>Your order ID: ${result.insertId}</p>
              <p>Thank you for your purchase!</p>
              <a href="/" class="btn btn-primary mt-3">Return to Home</a>
            </div>
          </body>
        </html>
      `);
    });
  } catch (err) {
    console.error('Stripe success error:', err);
    res.status(500).send('Payment verification failed.');
  }
});

// Cancel page
app.get('/cancel', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Payment Cancelled</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          body { background-color: #212529; color: #fff; text-align: center; padding-top: 50px; }
          .cancel-container { max-width: 600px; margin: 0 auto; background-color: #333; padding: 30px; border-radius: 8px; }
          h2 { color: #dc3545; }
          .btn-primary { background-color: #ffc107; color: #212529; border: none; }
          .btn-primary:hover { background-color: #e0a800; color: #212529; }
        </style>
      </head>
      <body>
        <div class="cancel-container">
          <h2>Payment Cancelled</h2>
          <p>Your order has been cancelled.</p>
          <a href="/" class="btn btn-primary mt-3">Return to Home</a>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
