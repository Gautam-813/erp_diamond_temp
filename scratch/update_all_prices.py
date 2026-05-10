
import os
import sys
import json
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")

# Define the colors and clarities mapping
colors = ["DEF", "G", "H", "I", "J", "K", "L", "M", "CAPE"]
clarities = ["VVS", "VS1", "VS2", "SI1", "SI2", "I1", "I2"]

# Organize all the price data provided by the user
all_ranges_data = {
    "r9": { # 0.059-0.069
        "DEF": [744, 706, 671, 638, 638], "G": [669, 636, 604, 574, 574], "H": [602, 572, 544, 516, 516],
        "I": [542, 515, 489, 465, 465], "J": [488, 464, 440, 418, 418], "K": [439, 417, 396, 376, 376],
        "L": [395, 375, 357, 339, 339], "M": [356, 338, 321, 305, 305], "CAPE": [320, 304, 289, 274, 274]
    },
    "r10": { # 0.070-0.078
        "DEF": [691, 656, 623, 592, 592], "G": [621, 590, 561, 533, 533], "H": [559, 531, 505, 480, 480],
        "I": [503, 478, 454, 432, 432], "J": [453, 430, 409, 388, 388], "K": [408, 387, 368, 350, 350],
        "L": [367, 349, 331, 315, 315], "M": [330, 314, 298, 283, 283], "CAPE": [297, 282, 268, 255, 255]
    },
    "r11": { # 0.079-0.095 (Same as r10 as per user request)
        "DEF": [691, 656, 623, 592, 592], "G": [621, 590, 561, 533, 533], "H": [559, 531, 505, 480, 480],
        "I": [503, 478, 454, 432, 432], "J": [453, 430, 409, 388, 388], "K": [408, 387, 368, 350, 350],
        "L": [367, 349, 331, 315, 315], "M": [330, 314, 298, 283, 283], "CAPE": [297, 282, 268, 255, 255]
    },
    "r12": { # 0.10-0.125 (Same as r9 as per user request)
        "DEF": [744, 706, 671, 638, 638], "G": [669, 636, 604, 574, 574], "H": [602, 572, 544, 516, 516],
        "I": [542, 515, 489, 465, 465], "J": [488, 464, 440, 418, 418], "K": [439, 417, 396, 376, 376],
        "L": [395, 375, 357, 339, 339], "M": [356, 338, 321, 305, 305], "CAPE": [320, 304, 289, 274, 274]
    },
    "r13": { # 0.126-0.159
        "DEF": [850, 807, 767, 729, 729], "G": [765, 727, 690, 656, 656], "H": [688, 654, 621, 590, 590],
        "I": [620, 589, 559, 531, 531], "J": [558, 530, 503, 478, 478], "K": [502, 477, 453, 430, 430],
        "L": [452, 429, 408, 387, 387], "M": [406, 386, 367, 349, 349], "CAPE": [366, 348, 330, 314, 314]
    },
    "r14": { # 0.16-0.18
        "DEF": [956, 908, 863, 820, 820], "G": [861, 817, 777, 738, 738], "H": [774, 736, 699, 664, 664],
        "I": [697, 662, 629, 598, 598], "J": [627, 596, 566, 538, 538], "K": [565, 536, 510, 484, 484],
        "L": [508, 483, 459, 436, 436], "M": [457, 434, 413, 392, 392], "CAPE": [412, 391, 371, 353, 353]
    }
}

def update_all_users_prices():
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.begin() as conn:
            # 1. Fetch all master configs
            configs = conn.execute(text("SELECT user_id, price_overrides FROM master_configs")).fetchall()
            print(f"Found {len(configs)} user configs to update.")

            for uid, price_overrides in configs:
                if isinstance(price_overrides, str):
                    price_overrides = json.loads(price_overrides)
                elif price_overrides is None:
                    price_overrides = {"Round": {}, "Fancy": {}}

                # Ensure base structure
                if "Round" not in price_overrides: price_overrides["Round"] = {}
                if "Fancy" not in price_overrides: price_overrides["Fancy"] = {}

                # 2. Update each specified range
                for rid, range_data in all_ranges_data.items():
                    for shape in ["Round", "Fancy"]:
                        if rid not in price_overrides[shape]:
                            price_overrides[shape][rid] = {}
                        
                        for color, values in range_data.items():
                            if color not in price_overrides[shape][rid]:
                                price_overrides[shape][rid][color] = {}
                            
                            for idx, clarity in enumerate(clarities):
                                if idx < len(values):
                                    price_overrides[shape][rid][color][clarity] = float(values[idx])
                                else:
                                    price_overrides[shape][rid][color][clarity] = 0.0

                # 3. Save back to DB for this specific user
                conn.execute(
                    text("UPDATE master_configs SET price_overrides = :po WHERE user_id = :uid"),
                    {"po": json.dumps(price_overrides), "uid": uid}
                )
                print(f"  - Updated prices for user ID: {uid}")
            
            print("\nSUCCESS: All price ranges (r9-r14) pushed to all users.")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    update_all_users_prices()
