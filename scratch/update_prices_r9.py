
import os
import sys
import json
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")

# The data provided by the user for 0.059-0.069 (r9)
# Mapping: Rows are Colors, Columns are VVS, VS1, VS2, SI1, SI2
price_data = {
    "DEF": [744, 706, 671, 638, 638],
    "G":   [669, 636, 604, 574, 574],
    "H":   [602, 572, 544, 516, 516],
    "I":   [542, 515, 489, 465, 465],
    "J":   [488, 464, 440, 418, 418],
    "K":   [439, 417, 396, 376, 376],
    "L":   [395, 375, 357, 339, 339],
    "M":   [356, 338, 321, 305, 305],
    "CAPE":[320, 304, 289, 274, 274]
}

clarities = ["VVS", "VS1", "VS2", "SI1", "SI2", "I1", "I2"]

def update_r9_prices():
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.begin() as conn:
            # 1. Get the admin user ID
            result = conn.execute(text("SELECT id FROM users WHERE email = 'admin@efdiamond.com'")).fetchone()
            if not result:
                print("Admin user not found.")
                return
            user_id = result[0]
            
            # 2. Get the current master config
            config_result = conn.execute(text("SELECT price_overrides FROM master_configs WHERE user_id = :uid"), {"uid": user_id}).fetchone()
            
            if not config_result:
                print("Master config not found.")
                return
            
            price_overrides = config_result[0]
            if isinstance(price_overrides, str):
                price_overrides = json.loads(price_overrides)
            elif price_overrides is None:
                price_overrides = {"Round": {}, "Fancy": {}}

            # Ensure the structure exists
            for shape in ["Round", "Fancy"]:
                if shape not in price_overrides: price_overrides[shape] = {}
                if "r9" not in price_overrides[shape]: price_overrides[shape]["r9"] = {}
                
                # 3. Update the prices for r9
                for color, values in price_data.items():
                    if color not in price_overrides[shape]["r9"]:
                        price_overrides[shape]["r9"][color] = {}
                    
                    for idx, clarity in enumerate(clarities):
                        if idx < len(values):
                            price_overrides[shape]["r9"][color][clarity] = float(values[idx])
                        else:
                            # For I1, I2 which were not provided
                            price_overrides[shape]["r9"][color][clarity] = 0.0

            # 4. Save back to DB
            conn.execute(
                text("UPDATE master_configs SET price_overrides = :po WHERE user_id = :uid"),
                {"po": json.dumps(price_overrides), "uid": user_id}
            )
            
            print(f"SUCCESS: Prices for Range 0.059-0.069 (r9) uploaded for Round & Fancy.")

    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    update_r9_prices()
