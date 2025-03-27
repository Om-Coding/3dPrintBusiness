const mysql = require("mysql")
const express = require("express");
const path = require("path")

const app = express();
var port = 3000;

app.use(express.urlencoded({
    extended:true
}))

app.use(express.static(path.join(__dirname,"public")))

app.get("/", (req,res) => {
    res.sendFile((path.join(__dirname,"public","home.html")))
})

const db = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'poonam482',
    database:'printer_shop',
});

db.connect(err => {
    if (err) {
        console.error('Database does not work, ok :|')
    }
    else {
        console.log('good job, your computer works')
    }
});

// Comment price look up

function getPrice(printer_model){
    const prices ={
       "Hexagon Fidget":2.0,
       "Cone Fidget":2.0,
       "Fidget Ring":1.0,
       "Big hexagon fidget":3.0,
       "Infinity Cube":3.0,
       "Dragon":4.0,
       "Sword":10.0,
       "Octopus":3.0,
       "Shark":2.0,
       "The Rocktopus":2.0,
       "Mini Tic Tac Toe":4.0,
       "Reed Case":3.0,
       "Small Container":2.0,
       "Big container":3.0,
       "Among us":3.0
    }
    return prices[printer_model]|| 0
}

app.post("/submit",(req,res) => {
    const {full_name,email,phone,address,printer_model,quantity}= req.body;
    const price = getPrice(printer_model) * parseInt(quantity)
    const values = [full_name,email,phone,address,printer_model,quantity,price];
    const sql = `
    INSERT INTO printerorders(full_name,email,phone,address,printer_model,quantity,price)
    VALUES(?,?,?,?,?,?,?);
    `
    db.query(sql,values,(err,results) => {
        if (err) {
            res.send('error is fetching some data')
        }
        else{
            res.send(`Thank you so much for your information, i guarantee u that we are not trying to steal your information like hackers.<br><br> Sincerly om sharma<br>CustomerId#${results.insertId}`)
        }
    })
}) 


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}/`)
})
