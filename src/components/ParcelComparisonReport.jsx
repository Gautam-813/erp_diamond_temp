import React, { useState, useEffect } from 'react';
import { formatNum } from '../utils/calculations';
import { calculateParcelTotals, getPriceIdxByWeight } from '../utils/parcelMath';
import { COLOUR_LIST, CLARITY_LIST, SIEVE_RANGES, MASTER_SIZE_CHART, isHotSize } from '../constants/diamondData';
import html2pdf from 'html2pdf.js';

const ParcelComparisonReport = ({ parcels, tender, prices, onBack }) => {
  const [selectedParcels, setSelectedParcels] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (parcels && parcels.length > 0) {
      // Sync internal selection with parcels passed from parent
      setSelectedParcels(parcels.map(p => p.id));
      
      // Only jump to comparison view if we have at least 2 parcels to compare
      if (parcels.length > 1) {
        setShowComparison(true);
      }
    }
  }, [parcels]);

  if (!parcels || parcels.length === 0) return <div className="p-20 text-center">No parcels available for comparison.</div>;

  const handleBack = () => {
    if (onBack) onBack();
  };

  const getMMByWeight = (weight, chart) => {
    if (!chart || chart.length === 0 || weight <= 0) return "-";
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
    let lower = null;
    let upper = null;
    for (let i = 0; i < markers.length; i++) {
       if (markers[i].weight <= weight) lower = markers[i];
       if (markers[i].weight >= weight) {
          upper = markers[i];
          break;
       }
    }
    if (!lower) lower = markers[0];
    if (!upper) upper = markers[markers.length - 1];
    const getMMBounds = (mmStr) => {
       const nums = mmStr.match(/[\d.]+/g);
       if (!nums || nums.length < 1) return { start: "?", end: "?" };
       return { start: nums[0], end: nums[1] || nums[0] };
    };
    const lowerBounds = getMMBounds(lower.mm);
    const upperBounds = getMMBounds(upper.mm);
    if (lower === upper) return lower.mm;
    return `${lowerBounds.start}-${upperBounds.end} mm`;
  };

  // Calculate metrics for a parcel
  const calculateParcelMetrics = (parcel) => {
    if (!parcel) return null;
    let state = parcel.calc_state;
    if (typeof state === 'string') {
      try {
        state = JSON.parse(state);
      } catch (e) {
        console.error("Error parsing calc_state:", e);
        return null;
      }
    }
    if (!state || !state.table) return null;

    // Use parcel-specific prices if available, otherwise fallback to global prices
    const parcelPrices = state.prices || prices;

    // Check if prices are still the default empty ones
    const hasPrices = parcelPrices && 
      ((parcelPrices.Round && Object.values(parcelPrices.Round).some(r => Object.values(r).some(c => Object.values(c).some(p => p > 0)))) ||
       (parcelPrices.Fancy && Object.values(parcelPrices.Fancy).some(r => Object.values(r).some(c => Object.values(c).some(p => p > 0)))));

    const totals = calculateParcelTotals(state, parcel, parcelPrices, COLOUR_LIST, CLARITY_LIST, isHotSize);
    if (!totals) return null;

    const roughCts = (state.ranges || []).reduce((sum, r) => sum + (parseFloat(state.sizeProfile?.[r]?.cts) || 0), 0) || parcel.total_cts || 0;
    const roughPcs = (state.ranges || []).reduce((sum, r) => {
      const data = state.sizeProfile?.[r] || {};
      const cts = parseFloat(data.cts) || 0;
      const avg = parseFloat(data.avg) || 0;
      return sum + (avg > 0 ? Math.round(cts / avg) : 0);
    }, 0) || parcel.pcs || 0;

    const clarityGroups = { high: ['VVS', 'VS1', 'VS2'], low: ['SI1', 'SI2', 'I1', 'I2'] };

    const calcGroupAvgSize = (category, clarities) => {
      let tPolC = 0;
      let tPolP = 0;
      const isRoundCategory = category.toLowerCase() === "round";

      (state.ranges || []).forEach(r => {
        const target = state.sizeProfile?.[r] || { cts: 0, avg: 0 };
        const sample = state.sampleConfig?.[r] || { cts: 0, pcs: 0 };
        const sFactorCts = (parseFloat(target.cts) > 0 && parseFloat(sample.cts) > 0) ? (parseFloat(target.cts) / parseFloat(sample.cts)) : 1;
        const sFactorPcs = (parseFloat(target.avg) > 0 && parseFloat(target.cts) > 0 && parseFloat(sample.pcs) > 0) ? (Math.round(parseFloat(target.cts)/parseFloat(target.avg)) / parseFloat(sample.pcs)) : 1;
        
        const rCfg = state.rangeConfig?.[r] || {};
        const roundYield = parseFloat(rCfg.roundYield) || 44;
        const fancyYield = parseFloat(rCfg.fancyYield) || 40;
        const roundMultiplier = parseFloat(rCfg.roundMultiplier) || 1;
        const fancyMultiplier = parseFloat(rCfg.fancyMultiplier) || 1.5;
        const clarityMultipliers = rCfg.clarityMultipliers || {};
        const roundYieldByClarity = rCfg.roundYieldByClarity || {};
        const fancyYieldByClarity = rCfg.fancyYieldByClarity || {};
        const roundMultiplierByClarity = rCfg.roundMultiplierByClarity || {};
        const fancyMultiplierByClarity = rCfg.fancyMultiplierByClarity || {};

        COLOUR_LIST.forEach(colour => {
          const shapesInTable = Object.keys(state.table?.[r]?.[colour] || {});
          const shapesToScan = isRoundCategory 
            ? shapesInTable.filter(s => s.toLowerCase() === "round")
            : shapesInTable.filter(s => s.toLowerCase() !== "round");

          shapesToScan.forEach(shape => {
            clarities.forEach(clarity => {
              const roughP_sample = parseFloat(state.table?.[r]?.[colour]?.[shape]?.[clarity]?.pcs) || 0;
              const assortmentCts = parseFloat(state.table?.[r]?.[colour]?.[shape]?.[clarity]?.cts) || 0;
              if (assortmentCts > 0 && roughP_sample > 0) {
                const isRound = shape.toLowerCase() === "round";
                const cMult = parseFloat(clarityMultipliers[clarity]) || 1;
                const yld = isRound ? (parseFloat(roundYieldByClarity[clarity]) || roundYield) : (parseFloat(fancyYieldByClarity[clarity]) || fancyYield);
                const mult = isRound ? (parseFloat(roundMultiplierByClarity[clarity]) || roundMultiplier) : (parseFloat(fancyMultiplierByClarity[clarity]) || fancyMultiplier);
                
                const polP = Math.round((roughP_sample * sFactorPcs * cMult) * mult);
                const polC = (assortmentCts * sFactorCts * cMult) * (yld / 100);
                tPolP += polP;
                tPolC += polC;
              }
            });
          });
        });
      });
      return tPolP > 0 ? tPolC / tPolP : 0;
    };
    const allShapes = new Set();
    (state.ranges || []).forEach(r => {
      COLOUR_LIST.forEach(col => {
        Object.keys(state.table?.[r]?.[col] || {}).forEach(s => allShapes.add(s));
      });
    });

    const avgRoundSize = calcGroupAvgSize("Round", clarityGroups.high, state);
    const polMM = getMMByWeight(avgRoundSize, state.sizeChart || MASTER_SIZE_CHART);
    const labour = parseFloat(state.labour) || parseFloat(state.labourCost) || 0;
    const profitPct = parseFloat(state.profit_margin) || 0;
    const polPerRough = roughCts > 0 ? totals.totalValue / roughCts : 0;
    const finalBid = (polPerRough - labour) * (1 - profitPct / 100) * roughCts;

    return {
      id: parcel.id, name: parcel.name, number: parcel.number,
      roughCts, roughPcs, polCts: totals.totalCts, polPcs: totals.totalPcs,
      yield: roughCts > 0 ? (totals.totalCts / roughCts) * 100 : 0,
      polVal: totals.totalValue, polPerRough,
      usablePol: totals.usableData?.usablePol || 0, usableVal: totals.usableData?.usableVal || 0,
      nonUsablePol: totals.usableData?.nonUsablePol || 0, nonUsableVal: totals.usableData?.nonUsableVal || 0,
      colorProfile: totals.colorProfile, clarityProfile: totals.clarityProfile,
      fluo: state.fluo || { "None": 100, "Fnt": 0, "Med/Stg": 0 },
      polMM, avgRoundSize, shapes: Array.from(allShapes).join(', '),
      finalBid, hasPrices
    };
  };

  const handleParcelSelect = (parcelId) => {
    setSelectedParcels(prev => {
      if (prev.includes(parcelId)) return prev.filter(id => id !== parcelId);
      else if (prev.length < 5) return [...prev, parcelId];
      return prev;
    });
  };

  const comparisonData = selectedParcels.map(id => {
    const parcel = parcels.find(p => p.id === id);
    return calculateParcelMetrics(parcel);
  }).filter(data => data !== null);

  const handleGenerateComparison = () => setShowComparison(true);

  const handleDownloadPDF = () => {
    const element = document.querySelector('.comparison-report');
    const opt = {
      margin: 0.2,
      filename: `parcel_comparison_${tender.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
  };

  if (!showComparison) {
    return (
      <div className="comparison-selector">
        <div className="section-hdr">
          <h2>Parcel Comparison Tool</h2>
          <p>Select up to 5 parcels to compare side-by-side</p>
        </div>
        <div className="parcel-grid">
          {parcels.map(parcel => {
            const isSelected = selectedParcels.includes(parcel.id);
            const metrics = calculateParcelMetrics(parcel);
            return (
              <div key={parcel.id} className={`parcel-card ${isSelected ? 'selected' : ''}`} onClick={() => handleParcelSelect(parcel.id)}>
                <div className="card-header">
                  <input type="checkbox" checked={isSelected} onChange={() => handleParcelSelect(parcel.id)} style={{marginRight: 8}} />
                  <h3>Lot {parcel.number}</h3>
                </div>
                <div className="card-body">
                  <p>{parcel.name}</p>
                  {metrics && (
                    <div className="quick-stats">
                      <div>Rough: {formatNum(metrics.roughCts, 1)} cts</div>
                      <div>Yield: {formatNum(metrics.yield, 1)}%</div>
                      <div>Bid: ${formatNum(metrics.finalBid / metrics.roughCts, 0)}/ct</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {selectedParcels.length > 0 && (
          <div className="comparison-actions">
            <button className="btn btn-gold" onClick={handleGenerateComparison} disabled={selectedParcels.length < 2}>📊 Compare {selectedParcels.length} Parcels</button>
            <button className="btn btn-outline" onClick={() => setSelectedParcels([])}>Clear Selection</button>
          </div>
        )}
        <style jsx>{`
          .comparison-selector { padding: 20px; }
          .parcel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin: 20px 0; }
          .parcel-card { border: 1px solid #cccccc; border-radius: 8px; padding: 20px; cursor: pointer; background: #ffffff; }
          .parcel-card.selected { border-color: #000000; background: #f5f5f5; }
          .card-header h3 { margin: 0; color: #000000; font-size: 16px; font-weight: bold; }
          .card-body p { margin: 5px 0 15px 0; color: #666666; font-size: 13px; }
          .quick-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #666666; background: #f5f5f5; padding: 8px; border-radius: 4px; }
          .comparison-actions { display: flex; gap: 15px; justify-content: center; margin-top: 30px; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="comparison-report">
      <div className="report-header">
        <div className="title-section">
          <h1>PARCEL COMPARISON REPORT</h1>
          <p>{tender.name} | {comparisonData.length} Lots Compared</p>
        </div>
        <div className="report-actions">
          <button className="btn btn-outline" onClick={handleBack}>← Back to Parcels</button>
          <button className="btn btn-gold" onClick={handleDownloadPDF}>📄 Download PDF</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">OVERVIEW — ROUGH & POLISH KEY METRICS</div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Metric</th>
              {comparisonData.map(data => (
                <th key={data.id}>Lot {data.number}<br/>{data.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td>Rough Cts</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.roughCts, 2)} cts / {formatNum(data.roughPcs, 0)} pcs</td>)}</tr>
            <tr><td>Polish Cts</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.polCts, 2)}</td>)}</tr>
            <tr><td>Polish Pcs</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.polPcs, 0)}</td>)}</tr>
            <tr><td>Avg Yield</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.yield, 1)}%</td>)}</tr>
            <tr><td>Polish Value ($)</td>{comparisonData.map(data => <td key={data.id} style={{fontWeight:700}}>${formatNum(data.polVal, 0)}</td>)}</tr>
            <tr><td>Pol $/Rough Ct</td>{comparisonData.map(data => <td key={data.id}>${formatNum(data.polPerRough, 2)}</td>)}</tr>
            <tr><td>Final Bid $/Rough Ct</td>{comparisonData.map(data => <td key={data.id} style={{fontWeight:700}}>${formatNum(data.finalBid / data.roughCts, 2)}</td>)}</tr>
            <tr><td>Total Bid ($)</td>{comparisonData.map(data => <td key={data.id} style={{fontWeight:700}}>${formatNum(data.finalBid, 0)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">COLOUR PROFILE COMPARISON (% of pol cts)</div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Colour</th>
              {comparisonData.map(data => <th key={data.id}>Lot {data.number}</th>)}
            </tr>
          </thead>
          <tbody>
            {COLOUR_LIST.map(color => (
              <tr key={color}>
                <td>{color}</td>
                {comparisonData.map(data => {
                  const percentage = data.polCts > 0 ? (data.colorProfile[color] / data.polCts) * 100 : 0;
                  return <td key={data.id}>{formatNum(percentage, 1)}%</td>;
                })}
              </tr>
            ))}
            <tr className="total-row"><td>TOTAL</td>{comparisonData.map(data => <td key={data.id}>100.0%</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">CLARITY PROFILE COMPARISON (% of pol cts)</div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Clarity</th>
              {comparisonData.map(data => <th key={data.id}>Lot {data.number}</th>)}
            </tr>
          </thead>
          <tbody>
            {CLARITY_LIST.map(clarity => (
              <tr key={clarity}>
                <td>{clarity}</td>
                {comparisonData.map(data => {
                  const percentage = data.polCts > 0 ? (data.clarityProfile[clarity] / data.polCts) * 100 : 0;
                  return <td key={data.id}>{formatNum(percentage, 1)}%</td>;
                })}
              </tr>
            ))}
            <tr className="total-row"><td>TOTAL</td>{comparisonData.map(data => <td key={data.id}>100.0%</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">USABLE vs NON-USABLE COMPARISON</div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Category</th>
              {comparisonData.map(data => <th key={data.id}>Lot {data.number}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td>Usable % (pol cts)</td>{comparisonData.map(data => <td key={data.id}>{data.polCts > 0 ? ((data.usablePol/data.polCts)*100).toFixed(1) : 0}%</td>)}</tr>
            <tr><td>Usable % (pol value)</td>{comparisonData.map(data => <td key={data.id}>{data.polVal > 0 ? ((data.usableVal/data.polVal)*100).toFixed(1) : 0}%</td>)}</tr>
            <tr><td>Usable Pol $/Rough Ct</td>{comparisonData.map(data => <td key={data.id}>${data.roughCts > 0 ? (data.usableVal/data.roughCts).toFixed(2) : 0}</td>)}</tr>
            <tr><td>Usable Pol Value</td>{comparisonData.map(data => <td key={data.id} style={{fontWeight:700}}>${formatNum(data.usableVal, 0)}</td>)}</tr>
            <tr><td>Non-Usable % (pol cts)</td>{comparisonData.map(data => <td key={data.id}>{data.polCts > 0 ? ((data.nonUsablePol/data.polCts)*100).toFixed(1) : 0}%</td>)}</tr>
            <tr><td>Non-Usable % (pol value)</td>{comparisonData.map(data => <td key={data.id}>{data.polVal > 0 ? ((data.nonUsableVal/data.polVal)*100).toFixed(1) : 0}%</td>)}</tr>
            <tr><td>Non-Usable Pol $/Rough Ct</td>{comparisonData.map(data => <td key={data.id}>${data.roughCts > 0 ? (data.nonUsableVal/data.roughCts).toFixed(2) : 0}</td>)}</tr>
            <tr><td>Non-Usable Pol Value</td>{comparisonData.map(data => <td key={data.id}>${formatNum(data.nonUsableVal, 0)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">FLUORESCENCE COMPARISON (rough cts basis)</div>
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Fluorescence</th>
              {comparisonData.map(data => <th key={data.id}>Lot {data.number}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td>None / Faint (cts)</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.roughCts * ((parseFloat(data.fluo["None"])+parseFloat(data.fluo["Fnt"]))/100), 2)}</td>)}</tr>
            <tr><td>None / Faint (%)</td>{comparisonData.map(data => <td key={data.id}>{formatNum(parseFloat(data.fluo["None"])+parseFloat(data.fluo["Fnt"]), 1)}%</td>)}</tr>
            <tr><td>Med / Strong (cts)</td>{comparisonData.map(data => <td key={data.id}>{formatNum(data.roughCts * (parseFloat(data.fluo["Med/Stg"])/100), 2)}</td>)}</tr>
            <tr><td>Med / Strong (%)</td>{comparisonData.map(data => <td key={data.id}>{formatNum(parseFloat(data.fluo["Med/Stg"]), 1)}%</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="section">
        <div className="section-title">SHAPE & POLISH SIZE COMPARISON</div>
        <table className="comparison-table">
          <thead>
            <tr><th>Article</th><th>Shapes</th><th>Polish Size</th><th>Pol Cts</th><th>Pol Pcs</th></tr>
          </thead>
          <tbody>
            {comparisonData.map(data => (
              <tr key={data.id}>
                <td style={{textAlign:'left'}}>Lot {data.number} {data.name}</td>
                <td>{data.shapes}</td>
                <td>{data.polMM}</td>
                <td>{formatNum(data.polCts, 2)}</td>
                <td>{formatNum(data.polPcs, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .comparison-report {
          background: #ffffff;
          color: #000000;
          padding: 30px 20px;
          font-family: Arial, sans-serif;
          max-width: 1400px;
          margin: 0 auto;
        }
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 1px solid #cccccc;
          padding-bottom: 15px;
        }
        .title-section h1 {
          font-size: 22px;
          font-weight: bold;
          margin: 0;
          color: #000000;
        }
        .title-section p {
          font-size: 11px;
          color: #666666;
          margin: 5px 0 0 0;
        }
        .section {
          page-break-inside: avoid;
          break-inside: avoid;
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 11px;
          font-weight: bold;
          color: #666666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
        }
        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 11px;
        }
        .comparison-table th {
          background: #000000;
          color: #ffffff;
          font-size: 10px;
          font-weight: bold;
          text-align: left;
          padding: 9px 8px;
          text-transform: uppercase;
          border: 1px solid #cccccc;
        }
        .comparison-table td {
          padding: 9px 8px;
          border: 1px solid #e0e0e0;
          text-align: center;
          color: #000000;
        }
        .comparison-table tr:nth-child(even) {
          background-color: #f5f5f5;
        }
        .comparison-table th:first-child, .comparison-table td:first-child {
          text-align: left;
          min-width: 160px;
          font-weight: bold;
        }
        .total-row {
          background-color: #f5f5f5 !important;
          font-weight: bold;
        }
        @media print {
          body { background: #ffffff !important; }
          .comparison-report { padding: 0 !important; width: 100% !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
};

export default ParcelComparisonReport;