
import os
import sys
import json
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")

def check_db_data():
    engine = create_engine(DATABASE_URL)
    try:
        with engine.connect() as conn:
            # Check users
            users = conn.execute(text("SELECT id, email FROM users")).fetchall()
            print(f"Users in DB: {users}")
            
            # Check admin config
            admin = conn.execute(text("SELECT id FROM users WHERE email = 'admin@efdiamond.com'")).fetchone()
            if admin:
                config = conn.execute(text("SELECT price_overrides FROM master_configs WHERE user_id = :uid"), {"uid": admin[0]}).fetchone()
                if config and config[0]:
                    data = config[0]
                    if isinstance(data, str): data = json.loads(data)
                    
                    r9_round = data.get("Round", {}).get("r9", "NOT FOUND")
                    print(f"\nPrices for r9 (Round): {r9_round}")
                else:
                    print("\nNo price overrides found for admin.")
            else:
                print("\nAdmin user 'admin@efdiamond.com' not found.")
                
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    check_db_data()
