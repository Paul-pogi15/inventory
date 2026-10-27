const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./inventory.db");

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            type TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// GET PRODUCTS
app.get("/api/products", (req, res) => {

    const search = req.query.search || "";
    const category = req.query.category || "";

    let sql = `
        SELECT * FROM products
        WHERE name LIKE ?
    `;

    let values = [`%${search}%`];

    if (category !== "") {
        sql += " AND category = ?";
        values.push(category);
    }

    sql += " ORDER BY id DESC";

    db.all(sql, values, (err, rows) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        res.json(rows);
    });
});

// ADD PRODUCT
app.post("/api/products", (req, res) => {

    const name = req.body.name;
    const category = req.body.category;
    const price = Number(req.body.price);
    const quantity = Number(req.body.quantity);

    if (!name || !category || isNaN(price) || isNaN(quantity)) {
        return res.status(400).json({
            error: "Please complete all fields."
        });
    }

    if (price < 0 || quantity < 0) {
        return res.status(400).json({
            error: "Price and quantity cannot be negative."
        });
    }

    db.run(
        `
        INSERT INTO products
        (name, category, price, quantity)
        VALUES (?, ?, ?, ?)
        `,
        [name, category, price, quantity],
        function(err) {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (quantity > 0) {
                db.run(
                    `
                    INSERT INTO stock_movements
                    (product_id, type, quantity)
                    VALUES (?, ?, ?)
                    `,
                    [this.lastID, "STOCK IN", quantity]
                );
            }

            res.json({
                message: "Product added successfully!",
                id: this.lastID
            });
        }
    );
});

// STOCK IN
app.post("/api/products/:id/stock-in", (req, res) => {

    const id = req.params.id;
    const amount = Number(req.body.quantity);

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
            error: "Enter a valid quantity."
        });
    }

    db.run(
        `
        UPDATE products
        SET quantity = quantity + ?
        WHERE id = ?
        `,
        [amount, id],
        function(err) {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    error: "Product not found."
                });
            }

            db.run(
                `
                INSERT INTO stock_movements
                (product_id, type, quantity)
                VALUES (?, ?, ?)
                `,
                [id, "STOCK IN", amount]
            );

            res.json({
                message: "Stock added successfully!"
            });
        }
    );
});

// STOCK OUT
app.post("/api/products/:id/stock-out", (req, res) => {

    const id = req.params.id;
    const amount = Number(req.body.quantity);

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
            error: "Enter a valid quantity."
        });
    }

    db.get(
        `
        SELECT quantity
        FROM products
        WHERE id = ?
        `,
        [id],
        (err, product) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (!product) {
                return res.status(404).json({
                    error: "Product not found."
                });
            }

            if (amount > product.quantity) {
                return res.status(400).json({
                    error: "Not enough stock."
                });
            }

            db.run(
                `
                UPDATE products
                SET quantity = quantity - ?
                WHERE id = ?
                `,
                [amount, id],
                function(err) {

                    if (err) {
                        return res.status(500).json({
                            error: err.message
                        });
                    }

                    db.run(
                        `
                        INSERT INTO stock_movements
                        (product_id, type, quantity)
                        VALUES (?, ?, ?)
                        `,
                        [id, "STOCK OUT", amount]
                    );

                    res.json({
                        message: "Stock removed successfully!"
                    });
                }
            );
        }
    );
});

// DELETE PRODUCT
app.delete("/api/products/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        `
        DELETE FROM stock_movements
        WHERE product_id = ?
        `,
        [id],
        function(err) {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            db.run(
                `
                DELETE FROM products
                WHERE id = ?
                `,
                [id],
                function(err) {

                    if (err) {
                        return res.status(500).json({
                            error: err.message
                        });
                    }

                    res.json({
                        message: "Product deleted successfully!"
                    });
                }
            );
        }
    );
});

// STOCK HISTORY
app.get("/api/stock-movements", (req, res) => {

    const sql = `
        SELECT
            stock_movements.id,
            products.name,
            stock_movements.type,
            stock_movements.quantity,
            stock_movements.date
        FROM stock_movements
        JOIN products
        ON stock_movements.product_id = products.id
        ORDER BY stock_movements.id DESC
    `;

    db.all(sql, [], (err, rows) => {

        if (err) {
            return res.status(500).json({
                error: err.message
            });
        }

        res.json(rows);
    });
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});