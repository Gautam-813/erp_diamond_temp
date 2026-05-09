import React, { useState } from 'react';
import { formatNum } from '../utils/calculations';
import { COLOUR_LIST, CLARITY_LIST, MASTER_SIZE_CHART } from '../constants/diamondData';

// Helper: Get MM Range based SOLELY on weight markers in the size chart
const getMMByWeight = (weight, chart) => {
  if (!chart || chart.length === 0 || weight <= 0) return "-";

  // 1. Flatten all markers into a simple sorted list of {weight, mm}
  const markers = [];
  chart.forEach(row => {
    const weights = row.weight.split(',').map(w => parseFloat(w.trim()));
    const mms = row.mm.split(',').map(m => m.trim());
    weights.forEach((w, idx) => {
      if (!isNaN(w) && mms[idx]) {
        markers.push({ weight: w, mm: mms[idx] });
      }
    });
  });

  if (markers.length === 0) return "-";
  markers.sort((a, b) => a.weight - b.weight);

  // 2. Find the "Sandwich" markers
  let lower = null;
  let upper = null;

  for (let i = 0; i < markers.length; i++) {
    if (markers[i].weight <= weight) {
      lower = markers[i];
    }
    if (markers[i].weight >= weight) {
      upper = markers[i];
      break; // Found the first one above or equal
    }
  }

  // Handle edge cases (target weight outside chart bounds)
  if (!lower) lower = markers[0];
  if (!upper) upper = markers[markers.length - 1];

  // 3. Extract MM Start and MM End
  const getMMBounds = (mmStr) => {
    const nums = mmStr.match(/[\d.]+/g);
    if (!nums || nums.length < 1) return { start: "?", end: "?" };
    return { start: nums[0], end: nums[1] || nums[0] };
  };

  const lowerBounds = getMMBounds(lower.mm);
  const upperBounds = getMMBounds(upper.mm);

  if (lower === upper) return lower.mm;
  return `${lowerBounds.start} - ${upperBounds.end} mm`;
};

const ParcelSummaryReport = ({ parcel, tender, state, prices, totals, onUpdate }) => {
  if (!state || !state.table || !totals) return <div className="p-20 text-center">No calculation data available for this parcel.</div>;

  const [localState, setLocalState] = useState({
    usableColourMax: state.usableColourMax || 'H',
    usableClarityMin: state.usableClarityMin || 'VS1'
  });

  const handleUsableChange = (key, value) => {
    const newState = { ...localState, [key]: value };
    setLocalState(newState);
    if (onUpdate) {
      onUpdate(key, value);
    }
  };

  // Sync localState when state changes from outside (e.g., page load)
  React.useEffect(() => {
    if (state.usableColourMax && state.usableColourMax !== localState.usableColourMax) {
      setLocalState(s => ({ ...s, usableColourMax: state.usableColourMax }));
    }
    if (state.usableClarityMin && state.usableClarityMin !== localState.usableClarityMin) {
      setLocalState(s => ({ ...s, usableClarityMin: state.usableClarityMin }));
    }
  }, [state.usableColourMax, state.usableClarityMin]);

  const usableColourOptions = ['DEF', 'G', 'H', 'I', 'J', 'K'];
  const usableClarityOptions = ['VVS', 'VS1', 'VS2', 'SI1'];

  // Use the pre-calculated totals from Dashboard.jsx for consistency
  const { 
    totalCts: totalPolCts, 
    totalPcs: totalPolPcs, 
    totalValue: totalPolVal, 
    rangeWise, 
    colorProfile, 
    clarityProfile, 
    usableData 
  } = totals;

  const totalRoughCts = parcel.total_cts;
  
  // 1. Calculate Total Rough Pcs from the size profile table (using cts / avg logic)
  const totalRoughPcs = (state.ranges || []).reduce((sum, r) => {
    const data = state.sizeProfile?.[r] || {};
    const cts = parseFloat(data.cts) || 0;
    const avg = parseFloat(data.avg) || 0;
    return sum + (avg > 0 ? Math.round(cts / avg) : 0);
  }, 0);

  
  // 2. Rough Avg Size = Total Rough CTS / Total PCS
  const roughAvgSize = totalRoughPcs > 0 ? totalRoughCts / totalRoughPcs : 0;
  
  // 3. Total Polish $ is already extracted as totalPolVal above

  
  // 4. Per Ct = Total Polish $ / Rough CTS
  const perCtPol = totalRoughCts > 0 ? totalPolVal / totalRoughCts : 0;
  
  // 5. Labour = from state.labour
  const labourPerRoughCt = parseFloat(state.labour) || 0;
  
  // 6. Rough Cost Per/CT = Per Ct - Labour
  const roughCostPerCt = perCtPol - labourPerRoughCt;
  
  // 7. Profit = Calculated based on profit margin % from the Rough Cost Per/CT
  const profitPct = parseFloat(state.profit_margin) || 0;
  const profitDollars = roughCostPerCt * (profitPct / 100);
  
  // 8. Bid Per CT = Rough Cost Per/CT - Profit
  const bidPerCt = roughCostPerCt - profitDollars;
  
  // 9. Bid Total Amount = Bid Per CT * Rough CTS
  const bidTotalAmount = bidPerCt * totalRoughCts;

  const avgYield = totalRoughCts > 0 ? (totalPolCts / totalRoughCts) * 100 : 0;
  const avgPricePerPolCt = totalPolCts > 0 ? totalPolVal / totalPolCts : 0;


  const ranges = state.ranges || [];

  return (
    <div className="summary-report-container">
      {/* 1. HEADER SUMMARY */}
      <div className="report-header-section">
        <div className="report-title-box">
          <h1>{parcel.number || 'Lot 80'} — PARCEL PURCHASE SUMMARY</h1>
          <p>{tender.name} · May 2026 · {parcel.name}</p>
        </div>

        <div className="report-header-grid">
          <div className="stat-card">
            <label>Rough Cts</label>
            <div className="val">{formatNum(totalRoughCts, 2)}</div>
          </div>
          <div className="stat-card highlighted">
            <label>Polish Cts</label>
            <div className="val">{formatNum(totalPolCts, 2)}</div>
          </div>
          <div className="stat-card highlighted">
            <label>Yield (%)</label>
            <div className="val">{formatNum(avgYield, 1)}%</div>
          </div>
          <div className="stat-card">
            <label>Rough Pcs</label>
            <div className="val">{formatNum(totalRoughPcs, 0)}</div>
          </div>
          <div className="stat-card">
            <label>Rough Avg Size</label>
            <div className="val">{formatNum(roughAvgSize, 3)}</div>
          </div>
          <div className="stat-card">
            <label>Total Polish $</label>
            <div className="val">${formatNum(totalPolVal, 0)}</div>
          </div>
          <div className="stat-card highlight-blue">
            <label>Per Ct (Pol)</label>
            <div className="val">${formatNum(perCtPol, 2)}</div>
          </div>
          <div className="stat-card highlight-blue">
            <label>Labour</label>
            <div className="val">${formatNum(labourPerRoughCt, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Rough Cost Per/CT</label>
            <div className="val">${formatNum(roughCostPerCt, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Profit ({profitPct}%)</label>
            <div className="val">${formatNum(profitDollars, 2)}</div>
          </div>
          <div className="stat-card highlight-blue">
            <label>Bid Per CT</label>
            <div className="val">${formatNum(bidPerCt, 2)}</div>
          </div>
          <div className="stat-card highlighted">
            <label>Bid Total Amount</label>
            <div className="val">${formatNum(bidTotalAmount, 0)}</div>
          </div>
        </div>
      </div>

      {/* USABLE SETTINGS */}
      <div className="usable-settings-bar">
        <div>
          <label>USABLE COLOUR (MAX)</label>
          <select 
            className="ef-select-audit"
            value={localState.usableColourMax} 
            onChange={e => handleUsableChange('usableColourMax', e.target.value)}
          >
            {usableColourOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>USABLE CLARITY (MIN)</label>
          <select 
            className="ef-select-audit"
            value={localState.usableClarityMin} 
            onChange={e => handleUsableChange('usableClarityMin', e.target.value)}
          >
            {usableClarityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{flex: 1, fontSize: 10, color: '#666', fontStyle: 'italic', display: 'flex', alignItems: 'flex-end'}}>
          * Calculation Logic: Usable = {usableColourOptions.slice(0, usableColourOptions.indexOf(localState.usableColourMax) + 1).join(', ')} + {usableClarityOptions.slice(0, usableClarityOptions.indexOf(localState.usableClarityMin) + 1).join(', ')}
        </div>
      </div>


      {/* 2. SIEVE SUMMARY TABLE */}
      <div className="section-title">SIEVE-WISE / POLISH SIZE-WISE SUMMARY</div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Rough Sieve</th>
            <th>Rough Cts</th>
            <th>Pol Pcs</th>
            <th>Pol Cts</th>
            <th>Yield</th>
            <th>Avg Pol Sz (ct)</th>
            <th>Polish Sieve</th>
            <th>Pol MM (Dia)</th>
            <th>Value US$</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map(r => {
            const rData = rangeWise[r] || { pcs: 0, cts: 0, val: 0, roughCts: 0 };
            const sieveInfo = MASTER_SIZE_CHART.find(m => m.sieve.includes(r)) || { sieve: r };
            const rangeYield = rData.roughCts > 0 ? (rData.cts / rData.roughCts) * 100 : 0;
            const avgPolSz = rData.pcs > 0 ? rData.cts / rData.pcs : 0;
            const polMM = getMMByWeight(avgPolSz, MASTER_SIZE_CHART);

            return (
              <tr key={r}>
                <td className="metric-label">{r}</td>
                <td>{formatNum(rData.roughCts, 2)}</td>
                <td>{formatNum(rData.pcs, 0)}</td>
                <td>{formatNum(rData.cts, 2)}</td>
                <td>{formatNum(rangeYield, 1)}%</td>
                <td style={{fontWeight: 'bold'}}>{formatNum(avgPolSz, 4)}</td>
                <td style={{opacity: 0.8}}>{sieveInfo.sieve}</td>
                <td style={{fontWeight: 'bold'}}>{polMM}</td>
                <td style={{fontWeight: 'bold'}}>${formatNum(rData.val, 0)}</td>
              </tr>
            );
          })}
          <tr className="total-row">
            <td>TOTAL</td>
            <td>{formatNum(totalRoughCts, 2)}</td>
            <td>{formatNum(totalPolPcs, 0)}</td>
            <td>{formatNum(totalPolCts, 2)}</td>
            <td>{formatNum(avgYield, 1)}%</td>
            <td>{totalPolPcs > 0 ? formatNum(totalPolCts / totalPolPcs, 4) : 0}</td>
            <td>-</td>
            <td>-</td>
            <td>${formatNum(totalPolVal, 0)}</td>
          </tr>
        </tbody>
      </table>

      {/* 3. USABLE vs NON-USABLE */}
      <div className="section-title" style={{marginTop:30}}>USABLE vs NON-USABLE</div>
      <div className="info-banner">
        <b>Usable:</b> {COLOUR_LIST[0]} to {localState.usableColourMax} / {CLARITY_LIST[0]} to {localState.usableClarityMin}. <b>Non-Usable:</b> {COLOUR_LIST[COLOUR_LIST.indexOf(localState.usableColourMax)+1]} to {COLOUR_LIST[5]} / {CLARITY_LIST[CLARITY_LIST.indexOf(localState.usableClarityMin)+1]} to {CLARITY_LIST[CLARITY_LIST.length-1]}.
      </div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Rough Cts</th>
            <th>Pol Cts</th>
            <th>Pol Value</th>
            <th>Pol $/ct (rough)</th>
            <th>% Pol Cts</th>
            <th>% Pol Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="metric-label">Usable ({COLOUR_LIST[0]} to {localState.usableColourMax} / {CLARITY_LIST[0]} to {localState.usableClarityMin})</td>
            <td>{formatNum(usableData.usableRough, 2)}</td>
            <td>{formatNum(usableData.usablePol, 2)}</td>
            <td>${formatNum(usableData.usableVal, 0)}</td>
            <td>${usableData.usableRough > 0 ? (usableData.usableVal / usableData.usableRough).toFixed(2) : 0}</td>
            <td>{totalPolCts > 0 ? ((usableData.usablePol / totalPolCts) * 100).toFixed(1) : 0}%</td>
            <td>{totalPolVal > 0 ? ((usableData.usableVal / totalPolVal) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr>
            <td className="metric-label">Non-Usable ({COLOUR_LIST[COLOUR_LIST.indexOf(localState.usableColourMax)+1]} to {COLOUR_LIST[5]} / {CLARITY_LIST[CLARITY_LIST.indexOf(localState.usableClarityMin)+1]} to {CLARITY_LIST[CLARITY_LIST.length-1]})</td>
            <td>{formatNum(usableData.nonUsableRough, 2)}</td>
            <td>{formatNum(usableData.nonUsablePol, 2)}</td>
            <td>${formatNum(usableData.nonUsableVal, 0)}</td>
            <td>${usableData.nonUsableRough > 0 ? (usableData.nonUsableVal / usableData.nonUsableRough).toFixed(2) : 0}</td>
            <td>{totalPolCts > 0 ? ((usableData.nonUsablePol / totalPolCts) * 100).toFixed(1) : 0}%</td>
            <td>{totalPolVal > 0 ? ((usableData.nonUsableVal / totalPolVal) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr className="total-row">
            <td>TOTAL</td>
            <td>{formatNum(totalRoughCts, 2)}</td>
            <td>{formatNum(totalPolCts, 2)}</td>
            <td>${formatNum(totalPolVal, 0)}</td>
            <td>${totalRoughCts > 0 ? (totalPolVal / totalRoughCts).toFixed(2) : 0}</td>
            <td>100.0%</td>
            <td>100.0%</td>
          </tr>
        </tbody>
      </table>

      {/* 4. USABLE & NON-USABLE DETAIL (PCS) */}
      {(() => {
         const usableColours = usableColourOptions.slice(0, usableColourOptions.indexOf(localState.usableColourMax) + 1);
         const usableClarities = usableClarityOptions.slice(0, usableClarityOptions.indexOf(localState.usableClarityMin) + 1);
         const nonUsableColours = usableColourOptions.slice(usableColourOptions.indexOf(localState.usableColourMax) + 1);
         
         return (
      <div style={{display: 'flex', gap: 20, marginTop: 30}}>
         <div style={{flex: 1}}>
           <div className="section-title">USABLE DETAIL (PCS)</div>
            <table className="summary-table mini" style={{maxWidth: 300}}>
              <thead>
                <tr><th>Color</th>{usableClarities.map(c => <th key={c}>{c}</th>)}<th>Total</th><th>%</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const { usablePcs } = usableData;
                  const totalUsable = usableColours.reduce((sum, col) => {
                     return sum + usableClarities.reduce((s, clr) => s + (usablePcs[col]?.[clr] || 0), 0);
                  }, 0);
                  return usableColours.length > 0 ? usableColours.map(col => {
                    const rowTotal = usableClarities.reduce((s, clr) => s + (usablePcs[col]?.[clr] || 0), 0);
                    const pct = totalUsable > 0 ? ((rowTotal / totalUsable) * 100).toFixed(1) : 0;
                    return (
                      <tr key={col}>
                        <td className="metric-label">{col}</td>
                        {usableClarities.map(clr => <td key={clr}>{usablePcs[col]?.[clr] || 0}</td>)}
                        <td style={{fontWeight: 'bold'}}>{rowTotal}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  }).concat(
                    <tr className="total-row" key="total">
                      <td>TOTAL</td>
                      {usableClarities.map(clr => <td key={clr}>{usableColours.reduce((s, c) => s + (usablePcs[c]?.[clr] || 0), 0)}</td>)}
                      <td>{usableColours.reduce((sum, col) => sum + usableClarities.reduce((s, clr) => s + (usablePcs[col]?.[clr] || 0), 0), 0)}</td>
                      <td>100.0%</td>
                    </tr>
                  ) : <tr><td colSpan={usableClarities.length + 3}>No data</td></tr>;
                })()}
              </tbody>
            </table>
         </div>

         <div style={{flex: 1}}>
           <div className="section-title">NON-USABLE DETAIL (PCS)</div>
            <table className="summary-table mini" style={{maxWidth: 400}}>
              <thead>
                <tr><th>Color</th>{usableClarityOptions.slice(usableClarityOptions.indexOf(localState.usableClarityMin) + 1).map(c => <th key={c}>{c}</th>)}<th>Total</th><th>%</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const { nonUsablePcs } = usableData;
                  const nonUsableClarities = usableClarityOptions.slice(usableClarityOptions.indexOf(localState.usableClarityMin) + 1);
                  const totalNonUsable = nonUsableColours.reduce((sum, col) => {
                     return sum + nonUsableClarities.reduce((s, clr) => s + (nonUsablePcs[col]?.[clr] || 0), 0);
                  }, 0);
                  return nonUsableColours.length > 0 ? nonUsableColours.map(col => {
                    const rowTotal = nonUsableClarities.reduce((s, clr) => s + (nonUsablePcs[col]?.[clr] || 0), 0);
                    const pct = totalNonUsable > 0 ? ((rowTotal / totalNonUsable) * 100).toFixed(1) : 0;
                    return (
                      <tr key={col}>
                        <td className="metric-label">{col}</td>
                        {nonUsableClarities.map(clr => <td key={clr}>{nonUsablePcs[col]?.[clr] || 0}</td>)}
                        <td style={{fontWeight: 'bold'}}>{rowTotal}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  }).concat(
                    <tr className="total-row" key="total">
                      <td>TOTAL</td>
                      {nonUsableClarities.map(clr => <td key={clr}>{nonUsableColours.reduce((s, c) => s + (nonUsablePcs[c]?.[clr] || 0), 0)}</td>)}
                      <td>{nonUsableColours.reduce((sum, col) => sum + nonUsableClarities.reduce((s, clr) => s + (nonUsablePcs[col]?.[clr] || 0), 0), 0)}</td>
                      <td>100.0%</td>
                    </tr>
                  ) : <tr><td colSpan={nonUsableClarities.length + 3}>No data</td></tr>;
                })()}
              </tbody>
            </table>
         </div>
</div>
          );
       })()}

      {/* 6. COLOUR PROFILE (POL CTS) */}
      <div className="section-title" style={{marginTop:30}}>COLOUR PROFILE (POL CTS)</div>
      <table className="summary-table mini" style={{maxWidth: 300}}>
        <thead>
          <tr><th>Colour</th><th>Pol Cts</th><th>%</th></tr>
        </thead>
        <tbody>
          {COLOUR_LIST.map(col => (
            <tr key={col}>
              <td className="metric-label">{col}</td>
              <td>{formatNum(colorProfile[col], 2)}</td>
              <td>{totalPolCts > 0 ? ((colorProfile[col] / totalPolCts) * 100).toFixed(1) : 0}%</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>TOTAL</td>
            <td>{formatNum(totalPolCts, 2)}</td>
            <td>100%</td>
          </tr>
        </tbody>
      </table>

      {/* 7. CLARITY PROFILE (POL CTS) */}
      <div className="section-title" style={{marginTop:30}}>CLARITY PROFILE (POL CTS)</div>
      <table className="summary-table mini" style={{maxWidth: 300}}>
        <thead>
          <tr><th>Clarity</th><th>Pol Cts</th><th>%</th></tr>
        </thead>
        <tbody>
          {CLARITY_LIST.map(clr => (
            <tr key={clr}>
              <td className="metric-label">{clr}</td>
              <td>{formatNum(clarityProfile[clr], 2)}</td>
              <td>{totalPolCts > 0 ? ((clarityProfile[clr] / totalPolCts) * 100).toFixed(1) : 0}%</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>TOTAL</td>
            <td>{formatNum(totalPolCts, 2)}</td>
            <td>100%</td>
          </tr>
        </tbody>
      </table>

      {/* 8. VALUATION BREAKDOWN */}
      <div className="section-title" style={{marginTop:30}}>VALUATION BREAKDOWN</div>
      <div className="bid-summary-grid">
         <div className="bid-item"><span>Total Polish Value</span><b>${formatNum(totalPolVal, 2)}</b></div>
         <div className="bid-item"><span>Labour / Rough Ct</span><b>${formatNum(labourPerRoughCt, 2)}</b></div>
         <div className="bid-item"><span>Rough Cost Per/CT (Pre-Profit)</span><b>${formatNum(roughCostPerCt, 2)}</b></div>
         <div className="bid-item"><span>Profit Margin ({profitPct}%)</span><b>${formatNum(profitDollars, 2)}</b></div>
         <div className="bid-item highlight"><span>Final Bid Per CT</span><b>${formatNum(bidPerCt, 2)}</b></div>
         <div className="bid-item highlight"><span>Total Bid Amount</span><b>${formatNum(bidTotalAmount, 0)}</b></div>
      </div>

      {/* 9. FLUORESCENCE PROFILE */}
      <div className="section-title" style={{marginTop:30}}>FLUORESCENCE PROFILE (ROUGH CTS BASIS)</div>
      <table className="summary-table mini" style={{maxWidth:500}}>
         <thead><tr><th>Fluorescence</th><th>Rough Cts</th><th>% of Parcel</th></tr></thead>
         <tbody>
            {Object.entries(state.fluo || { "None": 100, "Fnt": 0, "Med/Stg": 0 }).map(([cat, pct]) => {
               const cts = totalRoughCts * (parseFloat(pct) || 0) / 100;
               return (
                  <tr key={cat}>
                     <td className="metric-label">{cat}</td>
                     <td>{formatNum(cts, 2)}</td>
                     <td>{formatNum(parseFloat(pct) || 0, 1)}%</td>
                  </tr>
               );
            })}
            <tr className="total-row">
               <td>TOTAL</td>
               <td>{formatNum(totalRoughCts, 2)}</td>
               <td>100.0%</td>
            </tr>
         </tbody>
      </table>

      {/* FOOTER */}
      <div className="footer-audit">
          <div className="footer-left">
              <span>Excellent Facets Pvt Ltd</span>
              <span>|</span>
              <span>{tender.name} Analysis</span>
              <span>|</span>
              <span>Confidential Report</span>
          </div>
          <div>Page 1 of 1</div>
      </div>
      <style jsx>{`
        .summary-report-container {
          background: #ffffff;
          color: #000000;
          padding: 30px 40px;
          font-family: Arial, sans-serif;
          max-width: 1300px;
          margin: 0 auto;
        }

        .report-header-section {
          margin-bottom: 30px;
          border-bottom: 1px solid #cccccc;
          padding-bottom: 15px;
        }

        .report-title-box h1 {
          font-size: 22px;
          font-weight: bold;
          margin: 0 0 5px 0;
          color: #000000;
        }

        .report-title-box p {
          font-size: 11px;
          color: #666666;
          margin: 0;
        }

        .report-header-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 1px;
          background: #cccccc;
          border: 1px solid #cccccc;
          margin-top: 20px;
        }

        .stat-card {
          text-align: left;
          padding: 12px 15px;
          background: #ffffff;
        }

        .stat-card label {
          display: block;
          font-size: 10px;
          text-transform: uppercase;
          font-weight: bold;
          color: #666666;
          margin-bottom: 5px;
          letter-spacing: 0.3px;
        }

        .stat-card .val {
          font-size: 14px;
          font-weight: bold;
          color: #000000;
        }

        .stat-card.highlighted {
          background: #f1f5f9;
        }

        .stat-card.highlight-blue {
          background: #f8fafc;
        }

        .usable-settings-bar {
          display: flex;
          gap: 30px;
          margin: 20px 0 40px 0;
          padding: 15px 20px;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          align-items: center;
        }

        .usable-settings-bar label {
          font-size: 11px;
          font-weight: bold;
          color: #666666;
          text-transform: uppercase;
          margin-bottom: 5px;
          display: block;
        }

        .ef-select-audit {
          padding: 6px 10px;
          border: 1px solid #cccccc;
          background: #ffffff;
          font-size: 12px;
          font-weight: bold;
        }

        .section-title {
          font-size: 11px;
          font-weight: bold;
          color: #666666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 40px 0 12px 0;
          padding-top: 10px;
        }

        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
          font-size: 11px;
        }

        .summary-table th {
          background-color: #000000;
          color: #ffffff;
          font-size: 10px;
          font-weight: bold;
          text-align: left;
          padding: 9px 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: 1px solid #333333;
        }

        .summary-table td {
          padding: 9px 8px;
          font-size: 11px;
          border: 1px solid #e0e0e0;
          color: #000000;
        }

        .summary-table tr:nth-child(even) {
          background-color: #f8f8f8;
        }

        .metric-label {
          font-weight: 600;
          color: #000000;
        }

        .total-row {
          background-color: #f1f5f9 !important;
          font-weight: bold;
        }

        .total-row td {
          border-top: 2px solid #333333;
        }

        .info-banner {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 10px 15px;
          font-size: 11px;
          margin-bottom: 15px;
          color: #4b5563;
        }

        .bid-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 1px solid #cccccc;
        }

        .bid-item {
          display: flex;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid #e0e0e0;
          border-right: 1px solid #e0e0e0;
          font-size: 13px;
          color: #000000;
        }

        .bid-item span {
          color: #666666;
          font-weight: normal;
        }

        .bid-item b {
          font-weight: bold;
        }

        .bid-item.highlight {
          background: #f5f5f5;
        }

        .footer-audit {
          margin-top: 50px;
          padding-top: 15px;
          border-top: 1px solid #cccccc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
          color: #666666;
        }

        .footer-left {
          display: flex;
          gap: 15px;
        }

        @media print {
          .summary-report-container {
            width: 210mm;
            padding: 10mm !important;
            margin: 0;
          }
          .summary-table, .stat-card, .section-title, .bid-summary-grid, .info-banner {
            break-inside: avoid;
          }
          .summary-table th {
            background-color: #000000 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

export default ParcelSummaryReport;
