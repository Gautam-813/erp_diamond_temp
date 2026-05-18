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
    usableColourMax: state.usableColourMax || 'G',
    usableClarityMin: state.usableClarityMin || 'VS1',
    usableFluoMax: state.usableFluoMax || 'None-Faint'
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
    if (state.usableFluoMax && state.usableFluoMax !== localState.usableFluoMax) {
      setLocalState(s => ({ ...s, usableFluoMax: state.usableFluoMax }));
    }
  }, [state.usableColourMax, state.usableClarityMin, state.usableFluoMax]);

  const usableColourOptions = ['DEF', 'G', 'H', 'I', 'J', 'K'];
  const usableClarityOptions = ['VVS', 'VS1', 'VS2', 'SI1'];
  const usableFluoOptions = ['None-Faint', 'Med-Strng'];

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
          <h1 style={{margin:0}}>{parcel.number || 'Lot 80'}</h1>
          <p style={{margin:0}}>{parcel.name} | {tender.name}</p>
        </div>

        <div className="report-header-grid">
          <div className="stat-card">
            <label>Rough Cts</label>
            <div className="val">{formatNum(totalRoughCts, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Polish Cts</label>
            <div className="val text-gold">{formatNum(totalPolCts, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Yield (%)</label>
            <div className="val text-gold">{formatNum(avgYield, 1)}%</div>
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
            <div className="val text-green">${formatNum(totalPolVal, 0)}</div>
          </div>
          <div className="stat-card">
            <label>Per Ct (Pol)</label>
            <div className="val">${formatNum(perCtPol, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Labour</label>
            <div className="val">${formatNum(labourPerRoughCt, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Rough Cost Per/CT</label>
            <div className="val text-gold">${formatNum(roughCostPerCt, 2)}</div>
          </div>
          <div className="stat-card">
            <label>Profit (${profitPct}%)</label>
            <div className="val">${formatNum(profitDollars, 2)}</div>
          </div>
          <div className="stat-card">
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
      <div style={{display: 'flex', gap: 20, marginTop: 20, marginBottom: 20, padding: 15, background: '#f5f5f5', border: '1px solid #cccccc', borderRadius: 4}}>
        <div>
          <div style={{fontSize: 11, fontWeight: 700, marginBottom: 5}}>USABLE COLOUR (MAX)</div>
          <select
            value={localState.usableColourMax}
            onChange={e => handleUsableChange('usableColourMax', e.target.value)}
            style={{padding: '6px 10px', borderRadius: 4, border: '1px solid #cccccc', background: '#ffffff', color: '#000000', fontSize: 11}}
          >
            {usableColourOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize: 11, fontWeight: 700, marginBottom: 5}}>USABLE CLARITY (MIN)</div>
          <select
            value={localState.usableClarityMin}
            onChange={e => handleUsableChange('usableClarityMin', e.target.value)}
            style={{padding: '6px 10px', borderRadius: 4, border: '1px solid #cccccc', background: '#ffffff', color: '#000000', fontSize: 11}}
          >
            {usableClarityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize: 11, fontWeight: 700, marginBottom: 5}}>USABLE FLUORESCENCE (MAX)</div>
          <select
            value={localState.usableFluoMax}
            onChange={e => handleUsableChange('usableFluoMax', e.target.value)}
            style={{padding: '6px 10px', borderRadius: 4, border: '1px solid #cccccc', background: '#ffffff', color: '#000000', fontSize: 11}}
          >
            {usableFluoOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{flex: 1, fontSize: 11, opacity: 0.6, display: 'flex', alignItems: 'flex-end'}}>
          Usable = {usableColourOptions.slice(0, usableColourOptions.indexOf(localState.usableColourMax) + 1).join(', ')} + {usableClarityOptions.slice(0, usableClarityOptions.indexOf(localState.usableClarityMin) + 1).join(', ')}
        </div>
      </div>


      {/* 2. SIEVE SUMMARY TABLE */}
      <div className="section">
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
                  <td style={{fontWeight:700}}>{r}</td>
                  <td>{formatNum(rData.roughCts, 2)}</td>
                  <td>{formatNum(rData.pcs, 0)}</td>
                  <td>{formatNum(rData.cts, 2)}</td>
                  <td>{formatNum(rangeYield, 1)}%</td>
                  <td style={{fontWeight: 700}}>{formatNum(avgPolSz, 4)}</td>
                  <td style={{fontSize:11, opacity:0.8}}>{sieveInfo.sieve}</td>
                  <td style={{fontWeight: 700}}>{polMM}</td>
                  <td style={{fontWeight: 700}}>${formatNum(rData.val, 0)}</td>
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
              <td style={{fontWeight: 700}}>${formatNum(totalPolVal, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2.5 CLARITY BREAKDOWN BY SHAPE & CATEGORY */}
      <div className="section">
        <div style={{display: 'flex', flexDirection: 'column', gap: 30}}>
          {['Round', 'Fancy'].map(shape => {
            const scp = usableData.shapeClarityCategoryProfile?.[shape] || {};
            const availableRanges = ranges.filter(r => Object.keys(scp).includes(r));
            if (availableRanges.length === 0) return null;

            // Define Clarity Groups
            const groups = [
              { label: 'VVS-VS2', clarities: ['VVS', 'VS1', 'VS2'] },
              { label: 'SI1-I2', clarities: ['SI1', 'SI2', 'I1', 'I2'] }
            ];

            // Local logic to calculate avg size for a specific shape and clarity group
            const getGroupAvgSize = (targetClarities) => {
              let totalCts = 0;
              let totalPcs = 0;
              
              ranges.forEach(r => {
                const rangeCfg = state.rangeConfig?.[r] || {};
                const selectedShapes = rangeCfg.selectedShapes || ["Round"];
                const clarityMultipliers = rangeCfg.clarityMultipliers || {};
                const scaleFactorCts = (parseFloat(state.sizeProfile?.[r]?.cts) || 0) / (parseFloat(state.sampleConfig?.[r]?.cts) || 1);
                const scaleFactorPcs = (Math.round((parseFloat(state.sizeProfile?.[r]?.cts) || 0) / (parseFloat(state.sizeProfile?.[r]?.avg) || 1))) / (parseFloat(state.sampleConfig?.[r]?.pcs) || 1);
                
                const isCategoryRound = shape === "Round";
                const roundYield = parseFloat(rangeCfg.roundYield) || 44;
                const fancyYield = parseFloat(rangeCfg.fancyYield) || 40;
                const roundMultiplier = parseFloat(rangeCfg.roundMultiplier) || 1;
                const fancyMultiplier = parseFloat(rangeCfg.fancyMultiplier) || 1.5;

                // Identify which specific shapes to scan for this category
                const shapesToScan = isCategoryRound ? ["Round"] : selectedShapes.filter(s => s !== "Round");

                shapesToScan.forEach(sName => {
                  COLOUR_LIST.forEach(colour => {
                    targetClarities.forEach(clarity => {
                      const rCts = parseFloat(state.table?.[r]?.[colour]?.[sName]?.[clarity]?.cts) || 0;
                      const rPcs = parseFloat(state.table?.[r]?.[colour]?.[sName]?.[clarity]?.pcs) || 0;
                      if (rCts > 0) {
                        const cMult = parseFloat(clarityMultipliers[clarity]) || 1;
                        const yieldVal = isCategoryRound 
                          ? (parseFloat(rangeCfg.roundYieldByClarity?.[clarity]) || roundYield)
                          : (parseFloat(rangeCfg.fancyYieldByClarity?.[clarity]) || fancyYield);
                        const multVal = isCategoryRound
                          ? (parseFloat(rangeCfg.roundMultiplierByClarity?.[clarity]) || roundMultiplier)
                          : (parseFloat(rangeCfg.fancyMultiplierByClarity?.[clarity]) || fancyMultiplier);

                        totalCts += (rCts * scaleFactorCts * cMult) * (yieldVal / 100);
                        totalPcs += Math.round((rPcs * scaleFactorPcs * cMult) * multVal);
                      }
                    });
                  });
                });
              });
              return totalPcs > 0 ? totalCts / totalPcs : 0;
            };

            return (
              <div key={shape} style={{display: 'flex', gap: 20}}>
                {groups.map(group => {
                  const groupAvg = getGroupAvgSize(group.clarities);
                  const groupTotalCts = availableRanges.reduce((sum, r) => sum + group.clarities.reduce((s, clr) => s + (scp[r]?.[clr]?.cts || 0), 0), 0);
                  
                  if (groupTotalCts === 0) return null;

                  return (
                    <div key={group.label} style={{flex: 1}}>
                      <div className="section-title">
                        {shape.toUpperCase()} POLISH DETAIL ({group.label}): {formatNum(groupAvg, 3)}
                      </div>
                      <table className="summary-table mini">
                        <thead>
                          <tr>
                            <th>Clarity</th>
                            {availableRanges.map(r => <th key={r}>{r}<br/><small>(CTS/Pcs)</small></th>)}
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.clarities.map(clr => {
                            const rowTotalCts = availableRanges.reduce((sum, r) => sum + (scp[r]?.[clr]?.cts || 0), 0);
                            const rowTotalPcs = availableRanges.reduce((sum, r) => sum + (scp[r]?.[clr]?.pcs || 0), 0);
                            
                            if (rowTotalCts === 0) return null;

                            return (
                              <tr key={clr}>
                                <td style={{fontWeight: 700}}>{clr}</td>
                                {availableRanges.map(r => (
                                  <td key={r}>
                                    {formatNum(scp[r]?.[clr]?.cts || 0, 2)} / {formatNum(scp[r]?.[clr]?.pcs || 0, 0)}
                                  </td>
                                ))}
                                <td style={{fontWeight: 700, backgroundColor: '#f5f5f5'}}>
                                  {formatNum(rowTotalCts, 2)} / {formatNum(rowTotalPcs, 0)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="total-row">
                            <td>TOTAL</td>
                            {availableRanges.map(r => {
                              const colTotalCts = group.clarities.reduce((sum, clr) => sum + (scp[r]?.[clr]?.cts || 0), 0);
                              const colTotalPcs = group.clarities.reduce((sum, clr) => sum + (scp[r]?.[clr]?.pcs || 0), 0);
                              return <td key={r}>{formatNum(colTotalCts, 2)} / {formatNum(colTotalPcs, 0)}</td>;
                            })}
                            <td>
                              {formatNum(groupTotalCts, 2)} / 
                              {formatNum(availableRanges.reduce((sum, r) => sum + group.clarities.reduce((s, clr) => s + (scp[r]?.[clr]?.pcs || 0), 0), 0), 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. USABLE vs NON-USABLE */}
      <div className="section">
        <div className="section-title">USABLE vs NON-USABLE</div>
        <div className="info-banner">
          <b>Usable:</b> {COLOUR_LIST[0]} to {localState.usableColourMax} / {CLARITY_LIST[0]} to {localState.usableClarityMin} / {localState.usableFluoMax}. <b>Non-Usable (Colour/Clarity):</b> {COLOUR_LIST[COLOUR_LIST.indexOf(localState.usableColourMax)+1]} to {COLOUR_LIST[5]} / {CLARITY_LIST[CLARITY_LIST.indexOf(localState.usableClarityMin)+1]} to {CLARITY_LIST[CLARITY_LIST.length-1]}. <b>Non-Usable (Fluorescence):</b> Within usable colour+clarity, excluded by {localState.usableFluoMax}.
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
              <td style={{fontWeight:700}}>Usable (Colour/Clarity/Fluoro)</td>
              <td>{formatNum(usableData.usableRough, 2)}</td>
              <td>{formatNum(usableData.usablePol, 2)}</td>
              <td>${formatNum(usableData.usableVal, 0)}</td>
              <td>${usableData.usableRough > 0 ? (usableData.usableVal / usableData.usableRough).toFixed(2) : 0}</td>
              <td>{totalPolCts > 0 ? ((usableData.usablePol / totalPolCts) * 100).toFixed(1) : 0}%</td>
              <td>{totalPolVal > 0 ? ((usableData.usableVal / totalPolVal) * 100).toFixed(1) : 0}%</td>
            </tr>
            <tr>
              <td style={{fontWeight:700}}>Non-Usable (Fluorescence) — within usable Colour/Clarity</td>
              <td>{formatNum(usableData.nonUsableFluoRough, 2)}</td>
              <td>{formatNum(usableData.nonUsableFluoPol, 2)}</td>
              <td>${formatNum(usableData.nonUsableFluoVal, 0)}</td>
              <td>${usableData.nonUsableFluoRough > 0 ? (usableData.nonUsableFluoVal / usableData.nonUsableFluoRough).toFixed(2) : 0}</td>
              <td>{totalPolCts > 0 ? ((usableData.nonUsableFluoPol / totalPolCts) * 100).toFixed(1) : 0}%</td>
              <td>{totalPolVal > 0 ? ((usableData.nonUsableFluoVal / totalPolVal) * 100).toFixed(1) : 0}%</td>
            </tr>
            <tr>
              <td style={{fontWeight:700}}>Non-Usable (Colour/Clarity)</td>
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
      </div>

{/* 4. USABLE & NON-USABLE DETAIL (PCS) */}
      {(() => {
         const usableColours = usableColourOptions.slice(0, usableColourOptions.indexOf(localState.usableColourMax) + 1);
         const usableClarities = usableClarityOptions.slice(0, usableClarityOptions.indexOf(localState.usableClarityMin) + 1);
         const nonUsableColours = usableColourOptions.slice(usableColourOptions.indexOf(localState.usableColourMax) + 1);

         return (
      <div className="section">
        <div style={{display: 'flex', gap: 20}}>
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
                        <td>{col}</td>
                        {usableClarities.map(clr => <td key={clr}>{usablePcs[col]?.[clr] || 0}</td>)}
                        <td>{rowTotal}</td>
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
             <div className="section-title">NON-USABLE DETAIL (FLUORESCENCE) — within usable Colour/Clarity</div>
            <table className="summary-table mini" style={{maxWidth: 300}}>
              <thead>
                <tr><th>Color</th>{usableClarities.map(c => <th key={c}>{c}</th>)}<th>Total</th><th>%</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const { nonUsableFluoPcs } = usableData;
                  const totalFluoNonUsable = usableColours.reduce((sum, col) => {
                     return sum + usableClarities.reduce((s, clr) => s + (nonUsableFluoPcs[col]?.[clr] || 0), 0);
                  }, 0);
                  return usableColours.length > 0 ? usableColours.map(col => {
                    const rowTotal = usableClarities.reduce((s, clr) => s + (nonUsableFluoPcs[col]?.[clr] || 0), 0);
                    const pct = totalFluoNonUsable > 0 ? ((rowTotal / totalFluoNonUsable) * 100).toFixed(1) : 0;
                    return (
                      <tr key={col}>
                        <td>{col}</td>
                        {usableClarities.map(clr => <td key={clr}>{nonUsableFluoPcs[col]?.[clr] || 0}</td>)}
                        <td>{rowTotal}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  }).concat(
                    <tr className="total-row" key="total">
                      <td>TOTAL</td>
                      {usableClarities.map(clr => <td key={clr}>{usableColours.reduce((s, c) => s + (nonUsableFluoPcs[c]?.[clr] || 0), 0)}</td>)}
                      <td>{usableColours.reduce((sum, col) => sum + usableClarities.reduce((s, clr) => s + (nonUsableFluoPcs[col]?.[clr] || 0), 0), 0)}</td>
                      <td>100.0%</td>
                    </tr>
                  ) : <tr><td colSpan={usableClarities.length + 3}>No data</td></tr>;
                })()}
              </tbody>
            </table>
           </div>

           <div style={{flex: 1}}>
             <div className="section-title">NON-USABLE DETAIL (COLOUR/CLARITY)</div>
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
                        <td>{col}</td>
                        {nonUsableClarities.map(clr => <td key={clr}>{nonUsablePcs[col]?.[clr] || 0}</td>)}
                        <td>{rowTotal}</td>
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
      </div>
           );
        })()}

      {/* 6. COLOUR PROFILE (POL CTS) */}
      <div className="section">
        <div className="section-title">COLOUR PROFILE (POL CTS)</div>
        <table className="summary-table mini">
          <thead>
            <tr><th>Colour</th><th>Pol Cts</th><th>%</th></tr>
          </thead>
          <tbody>
            {COLOUR_LIST.map(col => (
              <tr key={col}>
                <td>{col}</td>
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
      </div>

      {/* 7. CLARITY PROFILE (POL CTS) */}
      <div className="section">
        <div className="section-title">CLARITY PROFILE (POL CTS)</div>
        <table className="summary-table mini">
          <thead>
            <tr><th>Clarity</th><th>Pol Cts</th><th>%</th></tr>
          </thead>
          <tbody>
            {CLARITY_LIST.map(clr => (
              <tr key={clr}>
                <td>{clr}</td>
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
      </div>

      {/* 8. VALUATION BREAKDOWN */}
      <div className="section">
        <div className="section-title">VALUATION BREAKDOWN</div>
        <div className="bid-summary-grid">
           <div className="bid-item"><span>Total Polish Value</span><b>${formatNum(totalPolVal, 2)}</b></div>
           <div className="bid-item"><span>Labour / Rough Ct</span><b>${formatNum(labourPerRoughCt, 2)}</b></div>
           <div className="bid-item"><span>Rough Cost Per/CT (Pre-Profit)</span><b>${formatNum(roughCostPerCt, 2)}</b></div>
           <div className="bid-item"><span>Profit Margin ({profitPct}%)</span><b>${formatNum(profitDollars, 2)}</b></div>
           <div className="bid-item highlight"><span>Final Bid Per CT</span><b>${formatNum(bidPerCt, 2)}</b></div>
           <div className="bid-item highlight"><span>Total Bid Amount</span><b>${formatNum(bidTotalAmount, 0)}</b></div>
        </div>
      </div>

      {/* 9. FLUORESCENCE PROFILE */}
      <div className="section">
        <div className="section-title">FLUORESCENCE PROFILE (ROUGH CTS BASIS)</div>
        <table className="summary-table mini" style={{maxWidth:500}}>
           <thead><tr><th>Fluorescence</th><th>Rough Cts</th><th>% of Parcel</th></tr></thead>
           <tbody>
              {Object.entries(state.fluo || { "None": 100, "Fnt": 0, "Med/Stg": 0 }).map(([cat, pct]) => {
                 const cts = totalRoughCts * (parseFloat(pct) || 0) / 100;
                 return (
                    <tr key={cat}>
                       <td>{cat}</td>
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
      </div>
      <style jsx>{`
        .summary-report-container {
          background: #ffffff;
          color: #000000;
          padding: 30px 20px;
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
          margin-bottom: 5px;
          color: #000000;
        }
        .report-title-box p {
          font-size: 11px;
          color: #666666;
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
          text-align: center;
          padding: 6px 4px;
          background: #ffffff;
        }
        .stat-card label {
          display: block;
          font-size: 8px;
          text-transform: uppercase;
          font-weight: bold;
          color: #666666;
          margin-bottom: 2px;
        }
        .stat-card .val {
          font-size: 11px;
          font-weight: bold;
          color: #000000;
        }
        .stat-card.highlighted {
          background: #000000;
        }
        .stat-card.highlighted .val, .stat-card.highlighted label {
          color: #ffffff;
        }
        .section-title {
          font-size: 10px;
          font-weight: bold;
          color: #666666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          padding-top: 5px;
          border-bottom: none;
        }
        .section {
          page-break-inside: avoid;
          break-inside: avoid;
          margin-bottom: 20px;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 10px;
        }
        .summary-table th {
          background: #000000;
          color: #ffffff;
          font-size: 9px;
          font-weight: bold;
          text-align: center;
          padding: 6px 4px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: 1px solid #333333;
        }
        .summary-table th:first-child, .summary-table td:first-child {
          text-align: left;
          background: #f5f5f5;
          color: #000000;
          font-weight: bold;
        }
        .summary-table th small {
          font-size: 8px;
          opacity: 0.7;
          text-transform: none;
        }
        .summary-table td {
          padding: 6px 4px;
          font-size: 10px;
          border: 1px solid #e0e0e0;
          color: #000000;
          text-align: center;
        }
        .summary-table tr:nth-child(even) {
          background-color: #f5f5f5;
        }
        .total-row {
          background-color: #f5f5f5 !important;
          font-weight: bold;
        }
        .total-row td {
          border-top: 2px solid #cccccc;
        }
        .bid-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          border: 1px solid #cccccc;
          page-break-inside: avoid;
        }
        .bid-item {
          display: flex;
          justify-content: space-between;
          padding: 9px 15px;
          border-bottom: 1px solid #e0e0e0;
          border-right: 1px solid #e0e0e0;
          font-size: 11px;
          color: #000000;
        }
        .bid-item:nth-child(even) {
          background-color: #f5f5f5;
        }
        .bid-item.highlight {
          font-weight: bold;
        }
        .bid-item span { color: #666666; }
        .bid-item b { font-weight: bold; color: #000000; }

        @media print {
          body {
            background: #ffffff !important;
          }
          .summary-report-container {
            padding: 0 !important;
            width: 100% !important;
            max-width: none !important;
          }
          .summary-table, .bid-summary-grid {
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ParcelSummaryReport;
