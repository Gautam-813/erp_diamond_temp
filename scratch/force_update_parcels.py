
import os
import sys
import json
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

sys.path.append('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/backend')
load_dotenv('d:/diamond_project/ef_rough_diamond_purchase-main/09-05-2026/.env')

DATABASE_URL = os.getenv("DATABASE_URL")

# The same price data we want to force into every parcel
all_ranges_data = {
    "r9": { "DEF": [744, 706, 671, 638, 638], "G": [669, 636, 604, 574, 574], "H": [602, 572, 544, 516, 516], "I": [542, 515, 489, 465, 465], "J": [488, 464, 440, 418, 418], "K": [439, 417, 396, 376, 376], "L": [395, 375, 357, 339, 339], "M": [356, 338, 321, 305, 305], "CAPE": [320, 304, 289, 274, 274] },
    "r10": { "DEF": [691, 656, 623, 592, 592], "G": [621, 590, 561, 533, 533], "H": [559, 531, 505, 480, 480], "I": [503, 478, 454, 432, 432], "J": [453, 430, 409, 388, 388], "K": [408, 387, 368, 350, 350], "L": [367, 349, 331, 315, 315], "M": [330, 314, 298, 283, 283], "CAPE": [297, 282, 268, 255, 255] },
    "r11": { "DEF": [691, 656, 623, 592, 592], "G": [621, 590, 561, 533, 533], "H": [559, 531, 505, 480, 480], "I": [503, 478, 454, 432, 432], "J": [453, 430, 409, 388, 388], "K": [408, 387, 368, 350, 350], "L": [367, 349, 331, 315, 315], "M": [330, 314, 298, 283, 283], "CAPE": [297, 282, 268, 255, 255] },
    "r12": { "DEF": [744, 706, 671, 638, 638], "G": [669, 636, 604, 574, 574], "H": [602, 572, 544, 516, 516], "I": [542, 515, 489, 465, 465], "J": [488, 464, 440, 418, 418], "K": [439, 417, 396, 376, 376], "L": [395, 375, 357, 339, 339], "M": [356, 338, 321, 305, 305], "CAPE": [320, 304, 289, 274, 274] },
    "r13": { "DEF": [850, 807, 767, 729, 729], "G": [765, 727, 690, 656, 656], "H": [688, 654, 621, 590, 590], "I": [620, 589, 559, 531, 531], "J": [558, 530, 503, 478, 478], "K": [502, 477, 453, 430, 430], "L": [452, 429, 408, 387, 387], "M": [406, 386, 367, 349, 349], "CAPE": [366, 348, 330, 314, 314] },
    "r14": { "DEF": [956, 908, 863, 820, 820], "G": [861, 817, 777, 738, 738], "H": [774, 736, 699, 664, 664], "I": [697, 662, 629, 598, 598], "J": [627, 596, 566, 538, 538], "K": [565, 536, 510, 484, 484], "L": [508, 483, 459, 436, 436], "M": [457, 434, 413, 392, 392], "CAPE": [412, 391, 371, 353, 353] }
}

clarities = ["VVS", "VS1", "VS2", "SI1", "SI2", "I1", "I2"]

def force_update_all_parcels():
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.begin() as conn:
            # 1. Fetch all parcels
            parcels = conn.execute(text("SELECT id, name, calc_state FROM parcels")).fetchall()
            print(f"Found {len(parcels)} parcels to update.")

            for pid, name, calc_state in parcels:
                if not calc_state: continue
                
                if isinstance(calc_state, str):
                    calc_state = json.loads(calc_state)
                
                # Prices are usually stored in calc_state['prices']
                if 'prices' not in calc_state:
                    calc_state['prices'] = {"Round": {}, "Fancy": {}}
                
                prices = calc_state['prices']
                
                # Force update r9-r14 for both shapes inside the parcel
                for rid, range_data in all_ranges_data.items():
                    for shape in ["Round", "Fancy"]:
                        if shape not in prices: prices[shape] = {}
                        if rid not in prices[shape]: prices[shape][rid] = {}
                        
                        for color, values in range_data.items():
                            if color not in prices[shape][rid]:
                                prices[shape][rid][color] = {}
                            
                            for idx, clarity in enumerate(clarities):
                                if idx < len(values):
                                    prices[shape][rid][color][clarity] = float(values[idx])
                                else:
                                    prices[shape][rid][color][clarity] = 0.0
                
                # Save back to DB
                conn.execute(
                    text("UPDATE parcels SET calc_state = :cs WHERE id = :pid"),
                    {"cs": json.dumps(calc_state), "pid": pid}
                )
                print(f"  - Force updated prices for Parcel: {name} (ID: {pid})")
            
            print("\nSUCCESS: All existing parcels have been force-updated with new prices.")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    force_update_all_parcels()
