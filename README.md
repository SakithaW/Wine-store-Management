# Retail Shop Bottle Management System — Full Stack v2 (Frontend + Python FastAPI + MySQL)

This archive bundles all three layers of the Retail Shop Bottle Management System with full MySQL persistence for bottles, inventory, transactions, and daily cash register closings:
- `frontend/`: POS Terminal & Admin Dashboard (`index.html`, `js/app.js`, `js/features.js`, `css/styles.css`, `images/`)
- `backend/`: Python FastAPI + SQLAlchemy application (`main.py`, `requirements.txt`)
- `database/`: MySQL schema and seed script (`schema.sql`)

## Quick Start

1. **Start MySQL & Create Database**
   - Start MySQL (e.g., MAMP or XAMPP) and run `database/schema.sql` (or let FastAPI auto-create tables and seed default bottles on startup).
2. **Run the FastAPI Backend**
   - `cd backend`
   - `python -m venv venv`
   - Activate `venv`, then run `pip install -r requirements.txt`
   - Update `DATABASE_URL` in `main.py` (or set the `DATABASE_URL` environment variable) if your MySQL port/password differs
   - Run `uvicorn main:app --reload --port 8000`
3. **Open the Frontend & Connect to FastAPI**
   - Open `frontend/index.html` in your browser
   - Click the gear icon in the top-right corner, set `http://localhost:8000`, enable live API mode, and save
