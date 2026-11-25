-- Retail Shop Bottle Management System (MySQL Schema)
CREATE DATABASE IF NOT EXISTS bottle_management_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bottle_management_db;

CREATE TABLE IF NOT EXISTS bottle_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'Water',
    image VARCHAR(255) DEFAULT 'images/19l-water.svg',
    liquid_price DOUBLE NOT NULL DEFAULT 0.0,
    deposit_value DOUBLE NOT NULL DEFAULT 0.0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory (
    bottle_type_id INT PRIMARY KEY,
    full_qty INT NOT NULL DEFAULT 0,
    empty_qty INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_inventory_bottle_type
        FOREIGN KEY (bottle_type_id) REFERENCES bottle_types(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS register_closings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by VARCHAR(100) NOT NULL DEFAULT 'Manager',
    opening_float DOUBLE NOT NULL DEFAULT 0.0,
    contents_sales DOUBLE NOT NULL DEFAULT 0.0,
    deposits_charged DOUBLE NOT NULL DEFAULT 0.0,
    deposit_refunds DOUBLE NOT NULL DEFAULT 0.0,
    net_sales DOUBLE NOT NULL DEFAULT 0.0,
    expected_cash DOUBLE NOT NULL DEFAULT 0.0,
    counted_cash DOUBLE NOT NULL DEFAULT 0.0,
    variance DOUBLE NOT NULL DEFAULT 0.0,
    tx_count INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    customer_id INT NULL,
    total_paid DOUBLE NOT NULL DEFAULT 0.0,
    closed_id INT NULL,
    CONSTRAINT fk_transactions_closing
        FOREIGN KEY (closed_id) REFERENCES register_closings(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaction_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    bottle_type_id INT NOT NULL,
    action_type ENUM('New_Sale', 'Exchange', 'Empty_Return') NOT NULL,
    quantity INT NOT NULL,
    deposit_logged DOUBLE NOT NULL,
    CONSTRAINT fk_tx_items_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_tx_items_bottle_type
        FOREIGN KEY (bottle_type_id) REFERENCES bottle_types(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Seed initial catalog & dual-state inventory (idempotent via INSERT IGNORE)
INSERT IGNORE INTO bottle_types (id, sku, name, category, image, liquid_price, deposit_value) VALUES
(1, '1001', '19L Drinking Water Jug', 'Water', 'images/19l-water.svg', 200.00, 1500.00),
(2, '1002', '5L Drinking Water Refill', 'Water', 'images/5l-water.svg', 110.00, 450.00),
(3, '2001', '12.5kg Domestic Gas Cylinder', 'Gas', 'images/12kg-gas.svg', 3650.00, 8500.00),
(4, '2002', '5kg Mini Gas Cylinder', 'Gas', 'images/5kg-gas.svg', 1480.00, 4200.00),
(5, '2003', '2.3kg Camping Gas Cylinder', 'Gas', 'images/2kg-gas.svg', 720.00, 2800.00),
(6, '3001', '1L Glass Soda Crate (12 Bottles)', 'Beverage', 'images/soda-crate.svg', 1800.00, 1200.00),
(7, '3002', '500ml Ginger Beer Glass Bottle', 'Beverage', 'images/ginger-beer.svg', 160.00, 100.00);

INSERT IGNORE INTO inventory (bottle_type_id, full_qty, empty_qty) VALUES
(1, 45, 12),
(2, 30, 8),
(3, 18, 14),
(4, 22, 6),
(5, 15, 4),
(6, 25, 19),
(7, 120, 64);
