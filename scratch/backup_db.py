
import os
import json
import datetime
from sqlalchemy import create_engine, text
import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")

def backup_database():
    if not DATABASE_URL:
        print("DATABASE_URL not found in .env")
        return

    print(f"Connecting to: {DATABASE_URL.split('@')[-1]}") # Print host only for security
    engine = create_engine(DATABASE_URL)
    
    tables = ["users", "master_configs", "tenders", "tender_shares", "parcels", "media"]
    backup_data = {}
    
    try:
        with engine.connect() as conn:
            for table in tables:
                print(f"Backing up table: {table}...")
                df = pd.read_sql_query(text(f"SELECT * FROM {table}"), conn)
                
                # Convert datetime columns to string for JSON serialization
                for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                    df[col] = df[col].dt.strftime('%Y-%m-%d %H:%M:%S')
                
                backup_data[table] = df.to_dict(orient='records')
                print(f"  - {len(backup_data[table])} records fetched.")
        
        # Save to file
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/scratch/db_backup_{timestamp}.json"
        
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
        
        print(f"\nSUCCESS: Database backup saved to {backup_file}")
        return backup_file

    except Exception as e:
        print(f"ERROR during backup: {e}")
        return None

if __name__ == "__main__":
    backup_database()
