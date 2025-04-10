// server.js (Stripe version)
const express = require('express');
const path = require('path');
const mysql = require('mysql');
const stripe = require('stripe')('YOUR_STRIPE_SECRET_KEY');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve home.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
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
    "Hexagon Fidget": 99,
    "Cone Fidget": 79,
    "Fidget Ring": 49,
    "Big Hexagon Fidget": 149,
    "Infinity Cube": 129,
    "Dragon": 199,
    "Sword": 179,
    "Octopus": 89,
    "Shark": 109,
    "The Rocktopus": 159,
    "Mini Tic Tac Toe": 99,
    "Reed Case": 69,
    "Small Container": 89,
    "Big Container": 149,
    "Among Us": 99
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
        quantity: quantity
      }],
      mode: 'payment',
      success_url: `http://localhost:${port}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:${port}/cancel`
    });

    // Store basic order info in session
    req.sessionData = { full_name, email, phone, address, printer_model, quantity, total };
    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Stripe session creation failed');
  }
});

// Success page with DB insert
app.get('/success', async (req, res) => {
  const session_id = req.query.session_id;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const customer_email = session.customer_details.email;
    const amount_paid = session.amount_total / 100;

    // This assumes you have access to the order data; adjust accordingly.
    const { full_name, email, phone, address, printer_model, quantity } = req.sessionData || {};

    const values = [
      full_name, email, phone, address,
      printer_model, quantity, amount_paid, session.payment_intent
    ];

    const sql = `
      INSERT INTO PrinterOrders
      (full_name, email, phone, address, printer_model, quantity, price, razorpay_payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error('DB insert error:', err);
        return res.send('Database error.');
      }
      res.send(`<h2>Payment successful! Order ID: ${result.insertId}</h2>`);
    });
  } catch (err) {
    console.error('Stripe success error:', err);
    res.status(500).send('Payment verification failed.');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
