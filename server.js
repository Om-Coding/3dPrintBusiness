const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51RBMbMIGrxJSEZdQLRrmTQlo123Qw8JvlyPgUnzaV0gaLFPmD3ssPF5ObvgaPKd8oog79JpPPdt6OpUWdFWSgxAC00t7dxit7R');
const app = express();
const port = process.env.PORT || 3000;

// Track database connection status
let dbConnected = false;
const orderMemory = new Map(); // In-memory order storage as fallback

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
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

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'YfrYsG8BpA',
  database: process.env.DB_NAME || 'sql12769758',
  port: process.env.DB_PORT || 3306
};

// Create table if it doesn't exist
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS PrinterOrders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    printer_model VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    razorpay_payment_id VARCHAR(255),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

// Try to connect to database but continue if it fails
function tryConnectToDatabase() {
  let connection;
  try {
    connection = mysql.createConnection(dbConfig);
    
    connection.connect(err => {
      if (err) {
        console.error('MySQL connection failed:', err);
        dbConnected = false;
        console.log('App running in database-less mode');
        
        // Try with a different connection method if it's a specific error
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
          tryLocalDatabase();
        }
      } else {
        console.log('Connected to MySQL');
        dbConnected = true;
        
        // Create table if it doesn't exist
        connection.query(createTableQuery, (err) => {
          if (err) {
            console.error('Error creating table:', err);
          } else {
            console.log('Table checked/created successfully');
          }
        });
      }
    });

    // Handle connection errors
    connection.on('error', function(err) {
      console.error('Database error:', err);
      
      // Don't set dbConnected to false here - only if reconnect fails
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Database connection lost. Attempting to reconnect...');
        setTimeout(tryConnectToDatabase, 5000); // Try to reconnect in 5 seconds
      } else {
        dbConnected = false;
      }
    });
    
    // Return the connection
    return connection;
  } catch (err) {
    console.error('Failed to create database connection:', err);
    dbConnected = false;
    return null;
  }
}

// Fallback to local database if remote fails
function tryLocalDatabase() {
  const localConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'novalayer',
    port: 3306
  };
  
  console.log('Trying local database connection...');
  
  const localConnection = mysql.createConnection(localConfig);
  
  localConnection.connect(err => {
    if (err) {
      console.error('Local MySQL connection also failed:', err);
      dbConnected = false;
    } else {
      console.log('Connected to local MySQL');
      dbConnected = true;
      connection = localConnection;
      
      // Create table if it doesn't exist
      connection.query(createTableQuery, (err) => {
        if (err) {
          console.error('Error creating table:', err);
        } else {
          console.log('Table checked/created successfully');
        }
      });
    }
  });
}

// Try to connect once at startup
const connection = tryConnectToDatabase();

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
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel`
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

// Handle "Pay with cash" option separately
app.post('/process-cash-order', (req, res) => {
  const { full_name, email, phone, address, printer_model, quantity } = req.body;
  const price = getPrice(printer_model);
  const total = price * parseInt(quantity);
  
  // Generate a unique order ID
  const orderId = Date.now().toString();
  
  // Store the order (either in DB or memory)
  if (dbConnected && connection) {
    const values = [
      full_name, 
      email, 
      phone, 
      address,
      printer_model, 
      quantity, 
      total, 
      'CASH-PAYMENT'
    ];
    
    const sql = `
      INSERT INTO PrinterOrders
      (full_name, email, phone, address, printer_model, quantity, price, razorpay_payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error('DB insert error:', err);
        // Fallback to in-memory storage
        orderMemory.set(orderId, {
          full_name,
          email,
          phone,
          address,
          printer_model,
          quantity,
          price: total,
          payment_id: 'CASH-PAYMENT',
          date: new Date().toISOString()
        });
        
        res.json({ success: true, orderId: orderId });
      } else {
        res.json({ success: true, orderId: result.insertId });
      }
    });
  } else {
    // Store in memory since database is not available
    orderMemory.set(orderId, {
      full_name,
      email,
      phone,
      address,
      printer_model,
      quantity,
      price: total,
      payment_id: 'CASH-PAYMENT',
      date: new Date().toISOString()
    });
    
    res.json({ success: true, orderId: orderId });
  }
});

// Cancel page
app.get('/cancel', (req, res) => {
  res.send('<h2>Payment cancelled. <a href="/">Try again</a></h2>');
});

// Success page with DB insert (with fallback to memory storage)
app.get('/success', async (req, res) => {
  const session_id = req.query.session_id;
  
  // Check if we have session data
  if (!req.session.orderData) {
    return res.status(400).send('Order data not found. Please try again.');
  }
  
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const customer_email = session.customer_details ? session.customer_details.email : 'unknown';
    const amount_paid = session.amount_total / 100;
    
    // Get data from the session
    const { full_name, email, phone, address, printer_model, quantity } = req.session.orderData;
    
    // Generate a unique order ID
    const orderId = Date.now().toString();
    
    // Try to save to database if connected
    if (dbConnected && connection) {
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
          // Fallback to in-memory storage
          orderMemory.set(orderId, {
            full_name,
            email,
            phone,
            address,
            printer_model,
            quantity,
            price: amount_paid,
            payment_id: session.payment_intent,
            date: new Date().toISOString()
          });
          
          sendSuccessResponse(res, orderId, full_name);
        } else {
          sendSuccessResponse(res, result.insertId, full_name);
        }
      });
    } else {
      // Store in memory since database is not available
      orderMemory.set(orderId, {
        full_name,
        email,
        phone,
        address,
        printer_model,
        quantity,
        price: amount_paid,
        payment_id: session.payment_intent,
        date: new Date().toISOString()
      });
      
      sendSuccessResponse(res, orderId, full_name);
    }
  } catch (err) {
    console.error('Stripe success error:', err);
    res.status(500).send('Payment verification failed. If your payment was successful, please contact support.');
  }
});

function sendSuccessResponse(res, orderId, full_name) {
  res.send(`
    <h2>Payment successful!</h2>
    <p>Order ID: ${orderId}</p>
    <p>Thank you for your purchase, ${full_name}!</p>
    <p><a href="/">Return to shop</a></p>
  `);
}

// Retrieve orders - admin only route
app.get('/admin/orders', (req, res) => {
  if (dbConnected && connection) {
    const sql = 'SELECT * FROM PrinterOrders ORDER BY order_date DESC';
    
    connection.query(sql, (err, results) => {
      if (err) {
        console.error('DB query error:', err);
        res.json({ orders: Array.from(orderMemory.values()) });
      } else {
        res.json({ orders: results });
      }
    });
  } else {
    // Return in-memory orders
    res.json({ orders: Array.from(orderMemory.values()) });
  }
});

// Status endpoint to check database connection
app.get('/status', (req, res) => {
  res.json({
    database: dbConnected ? 'connected' : 'disconnected',
    ordersInMemory: orderMemory.size
  });
});

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
