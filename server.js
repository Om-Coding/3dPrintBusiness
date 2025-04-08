const express = require('express');
const path = require('path');
const mysql = require('mysql');
const app = express();
const port = 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML) from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Add a default route to serve order.html explicitly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// MySQL connection (Freesqldatabase.com)
const connection = mysql.createConnection({
  host: 'sql12.freesqldatabase.com',
  user: 'sql12769758',
  password: 'YfrYsG8BpA',
  database: 'sql12769758',
  port: 3306
});

connection.connect((err) => {
  if (err) {
    console.error('MySQL connection failed:', err);
    return;
  }
  console.log('Connected to Freesqldatabase.com MySQL');
});

// Price lookup
function getPrice(printer_model) {
  const prices = {
    'HP LaserJet Pro M404dn': 299.99,
    'Canon PIXMA TR8620': 179.99,
    'Brother HL-L2350DW': 199.99
  };
  return prices[printer_model] || 0;
}

// Handle form submission
app.post('/submit', (req, res) => {
  const { full_name, email, phone, address, printer_model, quantity } = req.body;
  const price = getPrice(printer_model) * parseInt(quantity);
  const values = [full_name, email, phone, address, printer_model, quantity, price];
  
  const sql = `
    INSERT INTO PrinterOrders 
    (full_name, email, phone, address, printer_model, quantity, price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  connection.query(sql, values, (err, result) => {
    if (err) {
      console.error('Insert error:', err);
      return res.send('Database error: ' + err.message);
    }
    res.send(`<h2>Order submitted! Order ID: ${result.insertId}</h2>`);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
  console.log('Looking for order.html at:', path.join(__dirname, 'public', 'order.html'));
});
