
import os
import sys
sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
from sqlalchemy import create_engine
import models
from database import engine, Base
from dotenv import load_dotenv

load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

def init_new_db():
    print("Initializing new database schema...")
    try:
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("SUCCESS: Database schema initialized in the new database.")
    except Exception as e:
        print(f"ERROR: Failed to initialize database: {e}")

if __name__ == "__main__":
    init_new_db()
