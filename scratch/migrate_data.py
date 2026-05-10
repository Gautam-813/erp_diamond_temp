
import os
import sys
import json
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")
BACKUP_FILE = "d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/scratch/db_backup_20260510_160403.json"

def migrate_data():
    if not os.path.exists(BACKUP_FILE):
        print(f"Backup file not found: {BACKUP_FILE}")
        return

    with open(BACKUP_FILE, 'r') as f:
        backup_data = json.load(f)

    print(f"Connecting to new database: {DATABASE_URL.split('@')[-1]}")
    engine = create_engine(DATABASE_URL)
    
    # Order matters for foreign keys
    tables = ["users", "master_configs", "tenders", "parcels", "media", "tender_shares"]
    
    try:
        with engine.begin() as conn:
            # Clear any existing data just in case
            for table in reversed(tables):
                conn.execute(text(f"DELETE FROM {table}"))
            print("Cleared existing tables.")

            for table in tables:
                data = backup_data.get(table, [])
                if not data:
                    print(f"No data for table: {table}")
                    continue
                
                print(f"Migrating {len(data)} records to {table}...")
                df = pd.DataFrame(data)
                
                # Convert dict columns back to JSON for SQLAlchemy
                for col in df.columns:
                    if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
                        df[col] = df[col].apply(lambda x: json.dumps(x) if isinstance(x, (dict, list)) else x)

                df.to_sql(table, conn, if_exists='append', index=False, method='multi')
                
        print("\nSUCCESS: All data migrated to the new database.")

    except Exception as e:
        print(f"ERROR during migration: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    migrate_data()
