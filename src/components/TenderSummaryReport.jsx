import React from 'react';
import { formatNum } from '../utils/calculations';
import { getPriceIdxFromRange } from '../utils/priceUtils';
import { COLOUR_LIST, CLARITY_LIST, SIEVE_RANGES } from '../constants/diamondData';

const TenderSummaryReport = ({ tender, parcels, prices }) => {
  if (!parcels || parcels.length === 0) return <div className="p-20 text-center">No parcels in this notebook to summarize.</div>;

  const handleDownloadPDF = () => {
    const element = document.querySelector('.tender-summary-container');
    const opt = {
      margin: 0.2,
      filename: `tender_summary_${tender.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };

    import('html2pdf.js').then(html2pdf => {
      html2pdf.default().set(opt).from(element).save();
    });
  };

  // --- CALCULATION LOGIC (Aggregated) ---
  let grandTotalRough = 0;
  let grandTotalRoughPcs = 0;
  let grandTotalPol = 0;
  let grandTotalVal = 0;
  let grandTotalBid = 0;

  const parcelSummaries = parcels.map(p => {
    const state = p.calc_state;
    if (!state || !state.table) {
      return { name: p.name, number: p.number, rough: p.total_cts, pol: 0, val: 0, bid: 0 };
    }

    let pRough = 0;
    let pPol = 0;
    let pVal = 0;

    const ranges = state.ranges || [];
    ranges.forEach(r => {
      const target = state.sizeProfile?.[r] || { cts: 0 };
      const rangeCfg = state.rangeConfig?.[r] || { yield: 44, roundYieldByClarity: {}, fancyYieldByClarity: {} };
      const defaultYield = parseFloat(rangeCfg.yield) || 44;
      const roundYieldByClarity = rangeCfg.roundYieldByClarity || {};
      const fancyYieldByClarity = rangeCfg.fancyYieldByClarity || {};

      pRough += parseFloat(target.cts) || 0;

        // Calculate sample rough cts to find scale factor
        let sampleRough = 0;
        for (const col of COLOUR_LIST) {
          const colData = state.table && state.table[r] && state.table[r][col] ? state.table[r][col] : {};
          for (const shape of Object.keys(colData)) {
            for (const clr of CLARITY_LIST) {
              sampleRough += parseFloat(colData[shape]?.[clr]?.cts) || 0;
            }
          }
        }

      const scaleFactor = (target.cts > 0 && sampleRough > 0) ? (target.cts / sampleRough) : 1;

        for (const col of COLOUR_LIST) {
          const colData = state.table && state.table[r] && state.table[r][col] ? state.table[r][col] : {};
          for (const shape of Object.keys(colData)) {
            const isRound = shape === "Round";
            for (const clr of CLARITY_LIST) {
              const sC = parseFloat(colData[shape]?.[clr]?.cts) || 0;
              const yieldPct = isRound 
                ? (parseFloat(roundYieldByClarity[clr]) || defaultYield)
                : (parseFloat(fancyYieldByClarity[clr]) || defaultYield);
              const polC = (sC * scaleFactor) * (yieldPct / 100);
              const priceIdx = getPriceIdxFromRange(r);
              const priceShape = shape === "Round" ? "Round" : "Fancy";
              const price = prices?.[priceShape]?.[priceIdx]?.[col]?.[clr] || 0;

              pPol += polC;
              pVal += (polC * price);
            }
          }
        }
    });
    
    if (pRough <= 0 && p.total_cts > 0) pRough = p.total_cts;

    const labour = parseFloat(state.labour) || 0;
    const perCtPol = pVal / pRough;
    const bid = (perCtPol - labour) * pRough;

    let pRoughPcs = 0;
    ranges.forEach(r => {
      const data = state.sizeProfile?.[r] || {};
      const cts = parseFloat(data.cts) || 0;
      const avg = parseFloat(data.avg) || 0;
      pRoughPcs += avg > 0 ? Math.round(cts / avg) : 0;
    });
    if (pRoughPcs <= 0 && p.pcs > 0) pRoughPcs = p.pcs;

    grandTotalRough += pRough;
    grandTotalRoughPcs += pRoughPcs;
    grandTotalPol += pPol;
    grandTotalVal += pVal;
    grandTotalBid += bid;

    return {
      id: p.id, name: p.name, number: p.number, rough: pRough,
      pol: pPol, yield: pRough > 0 ? (pPol / pRough) * 100 : 0,
      val: pVal, avgPolPrice: pPol > 0 ? pVal / pPol : 0, bid: bid
    };
  });

  return (
    <div className="tender-summary-container">
      <div className="tender-header">
        <div className="title-section">
          <h1>TENDER SUMMARY REPORT</h1>
          <p>{tender.name.toUpperCase()} | VIEWING DATE: {tender.viewing_date || 'N/A'}</p>
        </div>
        <div className="report-actions">
           <button className="btn btn-gold" onClick={handleDownloadPDF}>📄 Download PDF</button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">GRAND TOTALS OVERVIEW</div>
        <div className="grand-stats-grid">
          <div className="stat-box">
            <label>Total Rough</label>
            <div className="val">{formatNum(grandTotalRough, 2)} cts / {formatNum(grandTotalRoughPcs, 0)} pcs</div>
          </div>
          <div className="stat-box">
            <label>Total Polish</label>
            <div className="val">{formatNum(grandTotalPol, 2)} cts</div>
          </div>
          <div className="stat-box highlighted">
            <label>Total Bid Value</label>
            <div className="val">${formatNum(grandTotalBid, 0)}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">PARCEL-BY-PARCEL ANALYSIS</div>
        <table className="tender-table">
          <thead>
            <tr>
              <th>Lot No.</th>
              <th>Description</th>
              <th>Rough Cts</th>
              <th>Pol Cts</th>
              <th>Yield</th>
              <th>Avg Pol $/ct</th>
              <th>Pol Value</th>
              <th>Final Bid</th>
            </tr>
          </thead>
          <tbody>
            {parcelSummaries.map(ps => (
              <tr key={ps.id}>
                <td style={{fontWeight:800}}>{ps.number}</td>
                <td>{ps.name}</td>
                <td>{formatNum(ps.rough, 2)}</td>
                <td>{formatNum(ps.pol, 2)}</td>
                <td>{formatNum(ps.yield, 1)}%</td>
                <td>${formatNum(ps.avgPolPrice, 0)}</td>
                <td style={{fontWeight:700}}>${formatNum(ps.val, 0)}</td>
                <td style={{fontWeight:800}}>${formatNum(ps.bid, 0)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2}>GRAND TOTAL</td>
              <td>{formatNum(grandTotalRough, 2)}</td>
              <td>{formatNum(grandTotalPol, 2)}</td>
              <td>{grandTotalRough > 0 ? ((grandTotalPol / grandTotalRough) * 100).toFixed(1) : 0}%</td>
              <td>${grandTotalPol > 0 ? (grandTotalVal / grandTotalPol).toFixed(0) : 0}</td>
              <td style={{fontWeight:700}}>${formatNum(grandTotalVal, 0)}</td>
              <td style={{fontWeight:800, fontSize:14}}>${formatNum(grandTotalBid, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="tender-footer">
        <p>Report Generated on {new Date().toLocaleDateString()} | EF Diamond ERP System</p>
      </div>

      <style jsx>{`
        .tender-summary-container {
          background: #ffffff;
          color: #000000;
          padding: 30px 20px;
          font-family: Arial, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
        }
        .tender-header {
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
          font-weight: bold;
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
        .grand-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: #cccccc;
          border: 1px solid #cccccc;
          margin-bottom: 20px;
        }
        .stat-box {
          background: #ffffff;
          padding: 15px;
          text-align: center;
        }
        .stat-box label {
          display: block;
          font-size: 9px;
          font-weight: bold;
          text-transform: uppercase;
          color: #666666;
          margin-bottom: 5px;
        }
        .stat-box .val {
          font-size: 16px;
          font-weight: bold;
          color: #000000;
        }
        .stat-box.highlighted {
          background: #000000;
        }
        .stat-box.highlighted .val, .stat-box.highlighted label {
          color: #ffffff;
        }
        .tender-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 11px;
        }
        .tender-table th {
          background: #000000;
          color: #ffffff;
          font-size: 10px;
          font-weight: bold;
          text-align: left;
          padding: 9px 8px;
          text-transform: uppercase;
          border: 1px solid #cccccc;
        }
        .tender-table th:first-child, .tender-table td:first-child {
          background: #f5f5f5;
          color: #000000;
          font-weight: bold;
        }
        .tender-table td {
          padding: 9px 8px;
          border: 1px solid #e0e0e0;
          color: #000000;
        }
        .tender-table tr:nth-child(even) {
          background-color: #f5f5f5;
        }
        .total-row {
          background-color: #f5f5f5 !important;
          font-weight: bold;
        }
        .tender-footer {
          text-align: center;
          font-size: 10px;
          color: #666666;
          border-top: 1px solid #cccccc;
          padding-top: 15px;
        }
        @media print {
          body { background: #ffffff !important; }
          .tender-summary-container { padding: 0 !important; width: 100% !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
};

export default TenderSummaryReport;
