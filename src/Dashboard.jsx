import React, { useState, useMemo, useEffect } from 'react';
import { useUser } from './context/UserContext';
import { api } from './services/api';
import NumericInput from './components/NumericInput';
import {
   COLOUR_LIST,
   CLARITY_LIST,
   SIEVE_RANGES,
   PRICE_LISTS,
   PRICE_SIEVES,
   isHotSize,
   MASTER_SIZE_CHART
} from './constants/diamondData';
import { formatNum } from './utils/calculations';
import AdminPanel from './AdminPanel';
import ParcelSummaryReport from './components/ParcelSummaryReport';
import TenderSummaryReport from './components/TenderSummaryReport';
import ParcelComparisonReport from './components/ParcelComparisonReport';
import TenderComparisonReport from './components/TenderComparisonReport';
import { calculateParcelTotals, getPriceIdxByWeight } from './utils/parcelMath';


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

// Final Valuation Summary
const FinalValuationTable = ({ totals, parcelData, state, onUpdate }) => {
   const perCtPol = parcelData.total_cts > 0 ? (totals.totalValue / parcelData.total_cts) : 0;
   const labourPerCt = parseFloat(state.labour) || 0;
   const finalBidValue = perCtPol - labourPerCt;
   const profitPct = parseFloat(state.profit_margin) || 0;
   const finalProfitBid = finalBidValue - (finalBidValue * profitPct / 100);

   return (
      <div className="card glass verdict-card">
         <div className="card-hdr" style={{ background: '#1e3a8a', color: '#fff' }}>FINAL PURCHASE VERDICT</div>
         <table className="profile-table">
            <tbody>
               <tr><td>Total POL $</td><td className="text-gold">$ {formatNum(totals.totalValue, 2)}</td></tr>
               <tr><td>Rough Cts</td><td>{parcelData.total_cts}</td></tr>
               <tr><td>Per Ct Pol $</td><td>{formatNum(perCtPol, 4)}</td></tr>
               <tr>
                  <td>Labour ($/ct)</td>
                  <td>
                     <NumericInput
                        value={state.labour || 0}
                        onChange={v => onUpdate('labour', v)}
                        style={{ width: '100%', textAlign: 'right', background: 'transparent', border: 'none', color: 'var(--gold)', fontWeight: 700 }}
                     />
                  </td>
               </tr>
               <tr className="verdict-row">
                  <td style={{ fontWeight: 800 }}>FINAL BID VALUE</td>
                  <td className="text-green" style={{ fontSize: 18 }}>$ {formatNum(finalBidValue, 2)}</td>
               </tr>
               <tr>
                  <td>Profit %</td>
                  <td>
                     <NumericInput
                        value={state.profit_margin || 0}
                        onChange={v => onUpdate('profit_margin', v)}
                        style={{ width: '100%', textAlign: 'right', background: 'transparent', border: 'none', color: 'var(--gold)', fontWeight: 700 }}
                     />
                  </td>
               </tr>
               <tr className="verdict-row">
                  <td style={{ fontWeight: 800 }}>FINAL PROFIT BID</td>
                  <td className="text-green" style={{ fontSize: 18 }}>$ {formatNum(finalProfitBid, 2)}</td>
               </tr>
            </tbody>
         </table>
         {totals.hotCts > 0 && (
            <div className="hot-stat-banner">
               🔥 {formatNum(totals.hotCts, 2)} cts in Hot Demand Bands
               <small style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>
                  {formatNum((totals.hotCts / totals.totalCts) * 100, 1)}% of Polished Weight
               </small>
            </div>
         )}
      </div>
   );
};

export default function Dashboard() {
   const { user, logout } = useUser();
   const [view, setView] = useState('home'); // home, parcels, calc, admin
   const [theme, setTheme] = useState('dark');
   const [tenders, setTenders] = useState([]);
   const [activeTender, setActiveTender] = useState(null);
   const [activeParcel, setActiveParcel] = useState(null);
   const [loading, setLoading] = useState(false);
   const [masterConfig, setMasterConfig] = useState(null);
   const [globalPrices, setGlobalPrices] = useState(PRICE_LISTS);
   const [selectedParcels, setSelectedParcels] = useState([]);
   const [selectedTenders, setSelectedTenders] = useState([]);

   const handleTenderSelect = (t, checked) => {
      if (checked) setSelectedTenders([...selectedTenders, t.id]);
      else setSelectedTenders(selectedTenders.filter(id => id !== t.id));
   };

   useEffect(() => {
      document.documentElement.setAttribute('data-theme', theme);
   }, [theme]);

   useEffect(() => {
      const load = async () => {
         try {
            const [tData, cData] = await Promise.all([
               api.getTenders(),
               api.getMyConfig()
            ]);
            setTenders(tData);
            setMasterConfig(cData);
            if (cData?.price_overrides && Object.keys(cData.price_overrides).length > 0) {
               setGlobalPrices(cData.price_overrides);
            }
         } catch (err) {
            console.error("Failed to load initial data", err);
         }
      };
      load();
   }, []);

   const handleUpdateGlobalPrices = async (newPrices) => {
      setGlobalPrices(newPrices);
      try {
         await api.updateMyConfig({ price_overrides: newPrices });
      } catch (err) {
         console.error("Failed to sync global prices", err);
      }
   };

   const selectTender = (t) => {
      setActiveTender(t);
      setView('parcels');
   };

   const selectParcel = (p) => {
      setActiveParcel(p);
      setView('calc');
   };

   const handleCreateTender = async () => {
      const name = prompt("Enter Notebook Name:");
      if (!name) return;
      const date = new Date().toISOString().split('T')[0];
      const newT = await api.createTender({ name, date });
      setTenders([...tenders, { ...newT, parcels: [] }]);
   };

   const handleCreateParcel = async () => {
      const name = prompt("Parcel Name (e.g. BR-101):");
      if (!name) return;
      try {
         const newP = await api.createParcel(activeTender.id, {
            number: `P-${Math.floor(Math.random() * 1000)}`,
            name: name,
            parcel_type: "SW",
            total_cts: 100,
            pcs: 0,
            calc_state: { table: {}, yield: 44, labour: 35, strategy: 'Whole' }
         });
         const updatedTender = { ...activeTender, parcels: [...(activeTender.parcels || []), newP] };
         setActiveTender(updatedTender);
         setTenders(tenders.map(t => t.id === activeTender.id ? updatedTender : t));
      } catch (err) {
         console.error("Failed to create parcel", err);
         alert("❌ Error: Failed to create parcel. " + err.message);
      }
   };

   const handleShare = async (e, tender) => {
      e.stopPropagation();
      const email = prompt("Enter Colleague's Email:");
      if (!email) return;
      const res = await api.shareTender(tender.id, email);
      alert(res.message || res.detail);
   };

   const handleDeleteTender = async (e, id) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this Notebook and all its parcels?")) return;
      try {
         await api.deleteTender(id);
         setTenders(tenders.filter(t => t.id !== id));
         if (activeTender?.id === id) {
            setActiveTender(null);
            setView('home');
         }
      } catch (err) {
         console.error(err);
         alert("Error deleting tender");
      }
   };

   const handleDeleteParcel = async (e, parcelId) => {
      e.stopPropagation();
      if (!confirm("Are you sure you want to delete this parcel?")) return;
      try {
         await api.deleteParcel(parcelId);
         const updatedParcels = activeTender.parcels.filter(p => p.id !== parcelId);
         const updatedTender = { ...activeTender, parcels: updatedParcels };
         setActiveTender(updatedTender);
         setTenders(tenders.map(t => t.id === activeTender.id ? updatedTender : t));
      } catch (err) {
         console.error(err);
         alert("Error deleting parcel");
      }
   };

   return (
      <div className="dashboard-root">
         <header className="hdr">
            <div className="logo" onClick={() => setView('home')}>
               <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l4 6-10 13L2 9z" /></svg>
               <span>EF DIAMOND ERP</span>
            </div>
            <div className="hdr-divider"></div>
            <div className="breadcrumb">
               <span className="link" onClick={() => setView('home')}>Home</span>
               {activeTender && (
                  <>
                     <span className="sep">/</span>
                     <span className="link" onClick={() => setView('parcels')}>{activeTender.name}</span>
                  </>
               )}
               {activeParcel && view === 'calc' && (
                  <>
                     <span className="sep">/</span>
                     <span className="link text-gold">{activeParcel.name}</span>
                  </>
               )}
            </div>

            <button className="theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
               {theme === 'dark' ? '☼' : '☾'}
            </button>
            {user?.role === 'admin' && (
               <button
                  className="theme-btn"
                  style={{ color: 'var(--gold)', border: '1px solid var(--gold)' }}
                  title="Admin Panel"
                  onClick={() => setView('admin')}
               >
                  🛡️
               </button>
            )}
            <button className="theme-btn" style={{ color: '#f87171' }} onClick={logout}>⏻</button>
         </header>

         <main className="body">
            {view === 'home' && (
               <div className="home-hero">
                  <div className="section-hdr">
                     <h2 className="title-glow">Your Purchase Notebooks</h2>
                     <div style={{ display: 'flex', gap: 10 }}>
                        {selectedTenders.length > 1 && (
                           <button className="btn btn-green" onClick={() => setView('tenderCompare')}>🔍 Compare Selected Tenders ({selectedTenders.length})</button>
                        )}
                        <button className="btn btn-primary" onClick={handleCreateTender}>+ New Notebook</button>
                     </div>
                  </div>
                  <div className="grid">
                     {tenders.map(t => (
                        <div key={t.id} className="home-card glass">
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                 <input type="checkbox" checked={selectedTenders.includes(t.id)} onChange={e => handleTenderSelect(t, e.target.checked)} />
                                 <div className="badge badge-blue">TENDER</div>
                              </div>
                              <div style={{ display: 'flex', gap: 5 }}>
                                 <button className="share-btn" title="Share with team" onClick={(e) => handleShare(e, t)}>🤝</button>
                                 <button className="share-btn" style={{ color: '#f87171' }} title="Delete Notebook" onClick={(e) => handleDeleteTender(e, t.id)}>🗑</button>
                              </div>
                           </div>
                           <div onClick={() => selectTender(t)} style={{ cursor: 'pointer' }}>
                              <h3 style={{ marginTop: 10 }}>{t.name}</h3>
                              <div className="card-footer">
                                 <span>{t.parcels?.length || 0} Parcels</span>
                                 <span>{t.date}</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {view === 'parcels' && activeTender && (
               <div className="parcel-list">
                  <div className="section-hdr">
                     <h2>{activeTender.name} <span style={{ opacity: 0.3, fontSize: 14 }}>(ID: {activeTender.id})</span></h2>
                     <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-primary" onClick={handleCreateParcel}>+ New Parcel</button>
                        <button className="btn btn-outline" onClick={() => setView('home')}>← Back</button>
                     </div>
                  </div>
                  <div className="card glass">
                     <table className="ef-table">
                        <thead>
                           <tr>
                              <th><input type="checkbox" onChange={e => { e.target.checked ? setSelectedParcels(activeTender.parcels?.map(p => p.id) || []) : setSelectedParcels([]) }} /> Select</th>
                              <th># No.</th>
                              <th>Parcel Name</th>
                              <th>Type</th>
                              <th>Total Cts</th>
                              <th>Pcs</th>
                              <th>Created</th>
                              <th>Action</th>
                           </tr>
                        </thead>
                        <tbody>
                           {activeTender.parcels?.map(p => (
                              <tr key={p.id}>
                                 <td><input type="checkbox" checked={selectedParcels.includes(p.id)} onChange={e => { e.target.checked ? setSelectedParcels([...selectedParcels, p.id]) : setSelectedParcels(selectedParcels.filter(id => id !== p.id)) }} /></td>
                                 <td>{p.number}</td>
                                 <td className="text-gold">{p.name}</td>
                                 <td><span className="pill">{p.parcel_type}</span></td>
                                 <td>{p.total_cts}</td>
                                 <td>{p.pcs || 0}</td>
                                 <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</td>
                                 <td>
                                    <button className="btn-sm btn-primary" onClick={() => selectParcel(p)}>Open Calc</button>
                                    <button className="btn-sm btn-outline" style={{ borderColor: '#f87171', color: '#f87171', marginLeft: 5 }} onClick={(e) => handleDeleteParcel(e, p.id)}>Delete</button>
                                 </td>
                              </tr>
                           ))}
                           {(!activeTender.parcels || activeTender.parcels.length === 0) && (
                              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No parcels found in this notebook.</td></tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {view === 'calc' && activeParcel && (
               <CalculationView
                  tender={activeTender}
                  parcel={activeParcel}
                  globalPrices={globalPrices}
                  onUpdateGlobalPrices={handleUpdateGlobalPrices}
                  onBack={() => setView('parcels')}
                  onUpdate={(updatedTender) => {
                     setActiveTender(updatedTender);
                     setTenders(tenders.map(t => t.id === updatedTender.id ? updatedTender : t));
                     const updatedParcel = updatedTender.parcels.find(p => p.id === activeParcel.id);
                     if (updatedParcel) setActiveParcel(updatedParcel);
                  }}
               />
            )}
            {view === 'compare' && activeTender && selectedParcels.length > 1 && (
               <ParcelComparisonReport
                  parcels={activeTender.parcels.filter(p => selectedParcels.includes(p.id))}
                  tender={activeTender}
                  prices={globalPrices}
                  onBack={() => setView('parcels')}
               />
            )}
            {view === 'tenderCompare' && selectedTenders.length > 1 && (
               <TenderComparisonReport
                  tenders={tenders.filter(t => selectedTenders.includes(t.id))}
                  onBack={() => setView('home')}
               />
            )}
            {view === 'admin' && (
               <AdminPanel 
                  onBack={() => setView('home')} 
                  onOpenParcel={(tender, parcel) => {
                     setActiveTender(tender);
                     setActiveParcel(parcel);
                     setView('calc');
                  }}
               />
            )}
         </main>
      </div>
   );
}

// Component: Price Master (Benchmark Prices)
const PriceMasterView = ({ prices, onUpdate }) => {
   const [activeShape, setActiveShape] = useState("Round");
   const [activeSieve, setActiveSieve] = useState("r1");
   const fileInputRef = React.useRef(null);

   const uiShapes = ["Round", "Pear/Oval", "Baguette", "Triangles"];
   const sieves = PRICE_SIEVES;

   const handlePriceChange = (col, clr, val) => {
      const next = { ...prices };
      const priceShape = activeShape === "Round" ? "Round" : "Fancy";
      const shapeKey = Object.keys(next).find(k => k.toLowerCase() === priceShape.toLowerCase()) || priceShape;

      if (!next[shapeKey]) next[shapeKey] = {};
      if (!next[shapeKey][activeSieve]) next[shapeKey][activeSieve] = {};
      if (!next[shapeKey][activeSieve][col]) next[shapeKey][activeSieve][col] = {};
      next[shapeKey][activeSieve][col][clr] = val;
      onUpdate(next);
   };

   const handleExcelSync = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm(`Are you sure you want to upload and sync prices from '${file.name}'?`)) {
         e.target.value = '';
         return;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
         const res = await api.syncPricesFromExcel(formData);
         if (res.status === 'success') {
            const newConfig = await api.getMyConfig();
            onUpdate(newConfig?.price_overrides || res.data);
            alert("✅ Prices uploaded and synchronized successfully!");
         } else {
            alert("❌ Error: " + (res.detail || "Unknown error"));
         }
      } catch (err) {
         console.error("Sync failed", err);
         alert("❌ Failed to upload Excel file.");
      } finally { e.target.value = ''; }
   };

   const lookupShape = activeShape === "Round" ? "Round" : "Fancy";
   const shapeKey = Object.keys(prices).find(k => k.toLowerCase() === lookupShape.toLowerCase());
   const currentGrid = shapeKey ? (prices[shapeKey]?.[activeSieve] || {}) : {};

   return (
      <div className="price-master-inner">
         <div className="shape-tabs" style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
            {uiShapes.map(s => (
               <button key={s} className={`btn-sm ${activeShape === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveShape(s)}>{s}</button>
            ))}
         </div>
         <div className="sieve-tabs" style={{ display: 'flex', gap: 5, marginBottom: 20, overflowX: 'auto', paddingBottom: 10 }}>
            {sieves.map(sv => (
               <button key={sv.id} className={`btn-mini ${activeSieve === sv.id ? 'btn-green' : 'btn-outline'}`} onClick={() => setActiveSieve(sv.id)} style={{ fontSize: 10, whiteSpace: 'nowrap', padding: '6px 12px', minWidth: 'fit-content' }}>{sv.label}</button>
            ))}
         </div>
         <div className="card glass">
            <div className="card-hdr" style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>{activeShape.toUpperCase()} — {activeSieve.toUpperCase()} Price Grid</span>
               <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleExcelSync} />
               <button className="btn-mini btn-outline" onClick={() => fileInputRef.current?.click()} style={{ borderColor: '#fbbf24', color: '#fbbf24' }}>🔄 Upload Price Excel</button>
            </div>
            <table className="ef-table-excel">
               <thead>
                  <tr><th>COLOR</th>{CLARITY_LIST.map(c => <th key={c}>{c}</th>)}</tr>
               </thead>
               <tbody>
                  {COLOUR_LIST.map(col => (
                     <tr key={col}>
                        <td style={{ fontWeight: 800, background: 'rgba(255,255,255,0.05)' }}>{col}</td>
                        {CLARITY_LIST.map(clr => (
                           <td key={clr}>
                              <input className="cell-input" style={{ textAlign: 'center', background: 'transparent', border: 'none', color: '#fff', width: '100%' }} value={currentGrid[col]?.[clr] !== undefined ? currentGrid[col][clr] : ""} onChange={e => handlePriceChange(col, clr, e.target.value)} />
                           </td>
                        ))}
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
};

// Component: Tender Profile Header
const TenderProfileHeader = ({ tender, parcel, onParcelUpdate, onTenderUpdate }) => {
   const avgSize = (parcel.total_cts && parcel.pcs) ? formatNum(parcel.total_cts / parcel.pcs, 4) : "0.0000";
   return (
      <div className="tender-profile-wrap">
         <table className="profile-table">
            <tbody>
               <tr><td>Viewing Date</td><td><input type="date" className="cell-input" style={{ color: '#fbbf24', fontWeight: 700 }} value={tender.viewing_date || ''} onChange={e => onTenderUpdate('viewing_date', e.target.value)} /></td></tr>
               <tr><td>Tender Name</td><td><input className="cell-input" style={{ color: '#fff' }} value={tender.name || ''} onChange={e => onTenderUpdate('name', e.target.value)} /></td></tr>
               <tr><td>Parcel Number</td><td><input className="cell-input" style={{ color: '#fff' }} value={parcel.number || ''} onChange={e => onParcelUpdate('number', e.target.value)} /></td></tr>
               <tr><td>Parcel Name</td><td><input className="cell-input" style={{ color: '#fff' }} value={parcel.name || ''} onChange={e => onParcelUpdate('name', e.target.value)} /></td></tr>
               <tr><td>Total Cts</td><td><NumericInput value={parcel.total_cts} onChange={v => onParcelUpdate('total_cts', v)} /></td></tr>
               <tr><td>Pcs</td><td><NumericInput value={parcel.pcs} onChange={v => onParcelUpdate('pcs', v)} /></td></tr>
               <tr><td>Average Size</td><td>{avgSize}</td></tr>
               <tr><td>Last Sold Price</td><td><NumericInput value={parcel.last_sold_price} onChange={v => onParcelUpdate('last_sold_price', v)} /></td></tr>
               <tr><td>Profit Margin %</td><td><NumericInput value={parcel.profit_margin || 0} onChange={v => onParcelUpdate('profit_margin', v)} /></td></tr>
               <tr className="bid-row"><td>Bid Price Per Ct</td><td><NumericInput value={parcel.bid_price_per_ct} onChange={v => onParcelUpdate('bid_price_per_ct', v)} /></td></tr>
            </tbody>
         </table>
      </div>
   );
};

// Component: Rough Assortment Input
const AssortmentTable = ({ range, state, onValueChange, onSampleChange, onUpdateConfig, onClarityMultiplierChange }) => {
   const target = state.sizeProfile?.[range] || { cts: 0, avg: 0 };
   const targetCts = parseFloat(target.cts) || 0;
   const targetPcs = target.avg > 0 ? Math.round(targetCts / target.avg) : 0;
   const targetAvg = parseFloat(target.avg) || 0;
   const sample = state.sampleConfig?.[range] || { pcs: 0, cts: 0 };
   const samplePcs = parseFloat(sample.pcs) || 0;
   const sampleCts = parseFloat(sample.cts) || 0;
   const sampleAvg = samplePcs > 0 ? sampleCts / samplePcs : 0;
   const scaleFactorCts = (targetCts > 0 && sampleCts > 0) ? (targetCts / sampleCts) : 1;
   const scaleFactorPcs = (targetPcs > 0 && samplePcs > 0) ? (targetPcs / samplePcs) : 1;
   const rangeCfg = state.rangeConfig?.[range] || {};
   const selectedShapes = rangeCfg.selectedShapes || ["Round"];
   const availableShapes = ["Round", "Pear/Oval", "Baguette", "Triangles"];
   const clarityMultipliers = rangeCfg.clarityMultipliers || {};

   const toggleShape = (shape) => {
      let next = [...selectedShapes];
      if (next.includes(shape)) { if (next.length > 1) next = next.filter(s => s !== shape); }
      else { next.push(shape); }
      onUpdateConfig(range, 'selectedShapes', next);
   };

   return (
      <div className="card glass category-card" style={{ marginBottom: 24 }}>
         <div className="card-hdr" style={{ background: '#16a34a', color: '#fff', borderBottom: '2px solid #15803d' }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>Rough Assortment: {range} | Target: {targetCts} cts / {targetPcs} pcs | Sample: <input className="cell-input" style={{ width: 50, borderBottom: '1px solid #fff', color: '#fff', background: 'transparent' }} value={sample.pcs || ""} onChange={e => onSampleChange(range, 'pcs', e.target.value)} /> | <input className="cell-input" style={{ width: 50, borderBottom: '1px solid #fff', color: '#fff', background: 'transparent' }} value={sample.cts || ""} onChange={e => onSampleChange(range, 'cts', e.target.value)} /> | Sample Avg: {formatNum(sampleAvg, 3)}</span>
         </div>
         <div className="shape-selector-bar" style={{ padding: '8px 15px', background: 'rgba(255,255,255,0.05)', display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>POLISHED SHAPES:</span>
            {availableShapes.map(s => (
               <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={selectedShapes.includes(s)} onChange={() => toggleShape(s)} /> {s}</label>
            ))}
         </div>
         <div className="overflow-x">
            <table className="ef-table-excel">
               <thead>
                  <tr>
                     <th rowSpan="2">Assortment</th><th rowSpan="2">Shape</th>
                     {CLARITY_LIST.map(c => (
                        <th key={c} colSpan="4" style={{ fontSize: 9 }}>
                           {c} <input className="cell-input" style={{ width: 45, color: 'var(--gold)' }} value={clarityMultipliers[c] || ""} onChange={e => onClarityMultiplierChange(range, c, e.target.value)} placeholder="1.0" />
                        </th>
                     ))}
                     <th colSpan="2">Sample Total</th><th colSpan="2">Whole Total</th>
                  </tr>
                  <tr>
                     {CLARITY_LIST.map(c => <React.Fragment key={c}><th>S-P</th><th>S-C</th><th>W-P</th><th>W-C</th></React.Fragment>)}
                     <th>PCS</th><th>CTS</th><th>PCS</th><th>CTS</th>
                  </tr>
               </thead>
               <tbody>
                  {COLOUR_LIST.map(colour => (
                     <React.Fragment key={colour}>
                        {selectedShapes.map((shape, sIdx) => {
                           let sP = 0; let sC = 0; let wP_row = 0; let wC_row = 0;
                           return (
                              <tr key={`${colour}-${shape}`}>
                                 {sIdx === 0 && <td rowSpan={selectedShapes.length}>{colour}</td>}
                                 <td>{shape}</td>
                                 {CLARITY_LIST.map(clarity => {
                                    const p = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.pcs) || 0;
                                    const c = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.cts) || 0;
                                    const cMult = parseFloat(clarityMultipliers[clarity]) || 1;
                                    const wP = Math.round(p * scaleFactorPcs * cMult);
                                    const wC = c * scaleFactorCts * cMult;
                                    sP += p; sC += c; wP_row += wP; wC_row += wC;
                                    return (
                                       <React.Fragment key={clarity}>
                                          <td><input className="cell-input" style={{ width: 45 }} value={state.table?.[range]?.[colour]?.[shape]?.[clarity]?.pcs || ""} onChange={e => onValueChange(range, colour, clarity, 'pcs', e.target.value, shape)} /></td>
                                          <td><input className="cell-input" style={{ width: 45 }} value={state.table?.[range]?.[colour]?.[shape]?.[clarity]?.cts || ""} onChange={e => onValueChange(range, colour, clarity, 'cts', e.target.value, shape)} /></td>
                                          <td style={{ color: 'var(--gold)' }}>{wP || ""}</td><td style={{ color: 'var(--gold)' }}>{formatNum(wC, 3)}</td>
                                       </React.Fragment>
                                    );
                                 })}
                                 <td className="row-total">{sP}</td><td className="row-total">{formatNum(sC, 3)}</td>
                                 <td className="row-total" style={{ color: 'var(--gold)' }}>{wP_row}</td><td className="row-total" style={{ color: 'var(--gold)' }}>{formatNum(wC_row, 3)}</td>
                              </tr>
                           );
                        })}
                     </React.Fragment>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
};

// Component: Polish Calculation
const PolishTable = ({ range, state, prices, onUpdateConfig, onGlobalUpdate, sizeChart }) => {
   const rangeCfg = state.rangeConfig?.[range] || { roundYield: 44, roundMultiplier: 1, fancyYield: 40, fancyMultiplier: 1.5 };
   const roundYield = parseFloat(rangeCfg.roundYield) || 44;
   const roundMultiplier = parseFloat(rangeCfg.roundMultiplier) || 1;
   const fancyYield = parseFloat(rangeCfg.fancyYield) || 40;
   const fancyMultiplier = parseFloat(rangeCfg.fancyMultiplier) || 1.5;
   const selectedShapes = rangeCfg.selectedShapes || ["Round"];
   const clarityMultipliers = rangeCfg.clarityMultipliers || {};
   const target = state.sizeProfile?.[range] || { cts: 0, avg: 0 };
   const scaleFactorCts = (target.cts > 0 && state.sampleConfig?.[range]?.cts > 0) ? (target.cts / state.sampleConfig[range].cts) : 1;
   const scaleFactorPcs = (Math.round(target.cts / target.avg) > 0 && state.sampleConfig?.[range]?.pcs > 0) ? (Math.round(target.cts / target.avg) / state.sampleConfig[range].pcs) : 1;

   const calcGroupAvgSize = (category, clarities) => {
      let polC = 0; let polP = 0;
      const shapes = category === "Round" ? ["Round"] : selectedShapes.filter(s => s !== "Round");
      for (const sh of shapes) {
         for (const col of COLOUR_LIST) {
            for (const clr of clarities) {
               const roughC = parseFloat(state.table?.[range]?.[col]?.[sh]?.[clr]?.cts) || 0;
               const roughP = parseFloat(state.table?.[range]?.[col]?.[sh]?.[clr]?.pcs) || 0;
               const cM = parseFloat(clarityMultipliers[clr]) || 1;
               const yld = sh === "Round" ? (parseFloat(rangeCfg.roundYieldByClarity?.[clr]) || roundYield) : (parseFloat(rangeCfg.fancyYieldByClarity?.[clr]) || fancyYield);
               const mult = sh === "Round" ? (parseFloat(rangeCfg.roundMultiplierByClarity?.[clr]) || roundMultiplier) : (parseFloat(rangeCfg.fancyMultiplierByClarity?.[clr]) || fancyMultiplier);
               polP += Math.round((roughP * scaleFactorPcs * cM) * mult);
               polC += (roughC * scaleFactorCts * cM) * (yld / 100);
            }
         }
      }
      return polP > 0 ? polC / polP : 0;
   };

   const rhAvg = calcGroupAvgSize('Round', ['VVS', 'VS1', 'VS2']);
   const rlAvg = calcGroupAvgSize('Round', ['SI1', 'SI2', 'I1', 'I2']);
   const polMM = getMMByWeight((rhAvg + rlAvg) / 2, sizeChart);

   return (
      <div className="card glass category-card" style={{ marginBottom: 24 }}>
         <div className="card-hdr" style={{ background: '#16a34a', color: '#fff' }}>Polish Calculation: {range} | MM: {polMM}</div>
         <div className="overflow-x">
            <table className="ef-table-excel">
               <thead>
                  <tr>
                     <th rowSpan="2">Assortment</th><th rowSpan="2">Shape</th>
                     {CLARITY_LIST.map(c => <th key={c} colSpan="4">{c}</th>)}
                     <th colSpan="3">Total</th>
                  </tr>
                  <tr>
                     {CLARITY_LIST.map(c => <React.Fragment key={c}><th>PCS</th><th>CTS</th><th>$/CT</th><th>VAL</th></React.Fragment>)}
                     <th>PCS</th><th>CTS</th><th>VAL</th>
                  </tr>
               </thead>
               <tbody>
                  {COLOUR_LIST.map(colour => (
                     <React.Fragment key={colour}>
                        {selectedShapes.map((shape, sIdx) => {
                           let rP = 0; let rC = 0; let rV = 0;
                           return (
                              <tr key={`${colour}-${shape}`}>
                                 {sIdx === 0 && <td rowSpan={selectedShapes.length}>{colour}</td>}
                                 <td>{shape}</td>
                                 {CLARITY_LIST.map((clarity, cIdx) => {
                                    const roughP = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.pcs) || 0;
                                    const roughC = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.cts) || 0;
                                    const cMult = parseFloat(clarityMultipliers[clarity]) || 1;
                                    const isRound = shape === "Round";
                                    const isHigh = ['VVS', 'VS1', 'VS2'].includes(clarity);
                                    const avg = isRound ? (isHigh ? rhAvg : rlAvg) : calcGroupAvgSize('Fancy', [clarity]);
                                    const yld = isRound ? (parseFloat(rangeCfg.roundYieldByClarity?.[clarity]) || roundYield) : (parseFloat(rangeCfg.fancyYieldByClarity?.[clarity]) || fancyYield);
                                    const mult = isRound ? (parseFloat(rangeCfg.roundMultiplierByClarity?.[clarity]) || roundMultiplier) : (parseFloat(rangeCfg.fancyMultiplierByClarity?.[clarity]) || fancyMultiplier);
                                    const polP = Math.round((roughP * scaleFactorPcs * cMult) * mult);
                                    const polC = (roughC * scaleFactorCts * cMult) * (yld / 100);
                                    const price = prices?.[isRound ? "Round" : "Fancy"]?.[getPriceIdxByWeight(avg)]?.[colour]?.[clarity] || 0;
                                    const val = polC * price;
                                    rP += polP; rC += polC; rV += val;
                                    return (
                                       <React.Fragment key={clarity}>
                                          <td>{polP || ""}</td><td>{formatNum(polC, 3)}</td><td>{formatNum(price, 0)}</td><td className="text-gold">{formatNum(val, 0)}</td>
                                       </React.Fragment>
                                    );
                                 })}
                                 <td className="row-total">{rP}</td><td className="row-total">{formatNum(rC, 3)}</td><td className="row-total text-green">$ {formatNum(rV, 0)}</td>
                              </tr>
                           );
                        })}
                     </React.Fragment>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
   );
};

// Component: Size Chart View
const SizeChartView = ({ chart, onUpdate }) => {
   const handleChange = (id, field, val) => onUpdate(chart.map(r => r.id === id ? { ...r, [field]: val } : r));
   return (
      <div className="card glass" style={{ marginTop: 24 }}>
         <div className="card-hdr">Master Size Chart</div>
         <table className="ef-table-excel">
            <thead><tr><th>Ratio</th><th>Sieve</th><th>Weight</th><th>DIA (mm)</th></tr></thead>
            <tbody>
               {chart.map(row => (
                  <tr key={row.id}>
                     <td><input className="cell-input" value={row.ratio} onChange={e => handleChange(row.id, 'ratio', e.target.value)} /></td>
                     <td><input className="cell-input" value={row.sieve} onChange={e => handleChange(row.id, 'sieve', e.target.value)} /></td>
                     <td><input className="cell-input" value={row.weight} onChange={e => handleChange(row.id, 'weight', e.target.value)} /></td>
                     <td><input className="cell-input" value={row.mm} onChange={e => handleChange(row.id, 'mm', e.target.value)} /></td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
};

// Component: Size Profile Table
const SizeProfileTable = ({ state, onAddRange, onDeleteRange, onUpdateRange, onUpdateGlobal, totals }) => {
   const rangeSummaries = (state.ranges || []).map(r => {
      const data = state.sizeProfile?.[r] || { cts: 0, avg: 0 };
      return { name: r, cts: parseFloat(data.cts) || 0, avg: parseFloat(data.avg) || 0, pcs: (parseFloat(data.avg) > 0 ? Math.round(parseFloat(data.cts) / parseFloat(data.avg)) : 0) };
   });
   const totalRoughCts = rangeSummaries.reduce((s, r) => s + r.cts, 0);

   return (
      <div className="card glass" style={{ marginTop: 24 }}>
         <div className="card-hdr" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Size Profile</span>
            <button className="btn-sm btn-primary" onClick={() => { const n = prompt("Sieve Range:"); if (n) onAddRange(n); }}>+ Add</button>
         </div>
         <table className="ef-table-excel">
            <thead><tr><th>SIZE</th><th>CTS</th><th>AVG</th><th>PCS</th><th></th></tr></thead>
            <tbody>
               {rangeSummaries.map(r => (
                  <tr key={r.name}>
                     <td>{r.name}</td>
                     <td><input className="cell-input" value={state.sizeProfile?.[r.name]?.cts || ""} onChange={e => onUpdateRange(r.name, 'cts', e.target.value)} /></td>
                     <td><input className="cell-input" value={state.sizeProfile?.[r.name]?.avg || ""} onChange={e => onUpdateRange(r.name, 'avg', e.target.value)} /></td>
                     <td>{r.pcs}</td>
                     <td><button className="btn-del-mini" onClick={() => onDeleteRange(r.name)}>×</button></td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
};

// Component: Fluorescence Profile
const FluoProfileTable = ({ totalWeight, totalPcs, fluoState, onUpdate }) => (
   <div className="card glass" style={{ marginTop: 24 }}>
      <div className="card-hdr">Fluorescence Profile</div>
      <table className="ef-table-excel">
         <thead><tr><th>FLUO</th><th>CTS</th><th>PCS</th><th>%</th></tr></thead>
         <tbody>
            {["None", "Fnt", "Med/Stg"].map(cat => (
               <tr key={cat}>
                  <td>{cat}</td>
                  <td>{formatNum(totalWeight * ((parseFloat(fluoState[cat]) || 0) / 100), 2)}</td>
                  <td>{Math.round(totalPcs * ((parseFloat(fluoState[cat]) || 0) / 100))}</td>
                  <td><input className="cell-input" value={fluoState[cat] || ""} onChange={e => onUpdate(cat, e.target.value)} /></td>
               </tr>
            ))}
         </tbody>
      </table>
   </div>
);

function CalculationView({ tender, parcel, onBack, onUpdate, globalPrices, onUpdateGlobalPrices }) {
   const [activeTab, setActiveTab] = useState('parcel_input');
   const [state, setState] = useState({
      table: {}, rangeConfig: {}, strategy: 'Whole', activeShape: 'Round', sizeProfile: {}, sampleConfig: {},
      fluo: { "None": 95, "Fnt": 0, "Med/Stg": 5 }, extrapolate: true, totalRoughWeight: 100, sampleWeight: 10,
      ranges: [], sizeChart: MASTER_SIZE_CHART, usableColourMax: 'H', usableClarityMin: 'VS1',
      ...parcel.calc_state,
      prices: parcel.calc_state?.prices || globalPrices
   });

   const [parcelData, setParcelData] = useState(parcel);
   const [tenderData, setTenderData] = useState(tender);
   const [saving, setSaving] = useState(false);
   const [media, setMedia] = useState(parcel.media || []);
   const [uploadingMedia, setUploadingMedia] = useState(false);

   const sieveTotals = useMemo(() => {
      let cts = 0; let pcs = 0;
      (state.ranges || []).forEach(r => {
         const c = parseFloat(state.sizeProfile?.[r]?.cts) || 0;
         const a = parseFloat(state.sizeProfile?.[r]?.avg) || 0;
         cts += c; pcs += (a > 0 ? Math.round(c / a) : 0);
      });
      return { cts, pcs };
   }, [state.ranges, state.sizeProfile]);

   const totals = useMemo(() => calculateParcelTotals(state, parcelData, state.prices, COLOUR_LIST, CLARITY_LIST, isHotSize, state.usableColourMax, state.usableClarityMin), [state, parcelData]);

   const handleFileUpload = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      setUploadingMedia(true);
      try {
         const res = await api.uploadFile(parcelData.id, file);
         if (res?.id) setMedia(prev => [...prev, res]);
      } catch (err) { alert("Upload failed"); } finally { setUploadingMedia(false); }
   };

   const handleSave = async () => {
      setSaving(true);
      try {
         const [sP, sT] = await Promise.all([
            api.updateParcel(parcel.id, { ...parcelData, calc_state: state }),
            api.updateTender(tender.id, tenderData)
         ]);
         onUpdate({ ...sT, parcels: (sT.parcels || []).map(p => p.id === sP.id ? sP : p) });
         alert("✅ Saved!");
      } catch (err) { alert("Save failed"); } finally { setSaving(false); }
   };

   return (
      <div className="calc-container">
         <div className="calc-hdr">
            <div className="calc-info"><h1>{parcelData.name}</h1><p className="text-gold">{tenderData.name} | {parcelData.number}</p></div>
            <div className="calc-tabs">
               {['parcel_input', 'assortment', 'polish', 'prices', 'summary', 'size_chart'].map(t => (
                  <button key={t} className={`tab-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t.replace('_', ' ')}</button>
               ))}
            </div>
            <div className="calc-actions"><button className="btn btn-green" onClick={handleSave}>{saving ? '...' : 'Save'}</button><button className="btn btn-outline" onClick={onBack}>Close</button></div>
         </div>
         <div className="calc-grid">
            <div className="calc-sidebar">
               <FinalValuationTable totals={totals} parcelData={parcelData} state={state} onUpdate={(f, v) => setState({ ...state, [f]: v })} />
               <div className="card glass">
                  <div className="card-hdr">Media</div>
                  <div className="card-body">
                     <input type="file" onChange={handleFileUpload} />
                     <div className="media-grid">{media.map(m => <div key={m.id} className="media-item"><img src={`/${m.file_path}`} alt="diamond" /></div>)}</div>
                  </div>
               </div>
            </div>
            <div className="calc-content" style={{ flex: 1 }}>
               {activeTab === 'parcel_input' && (
                  <div className="parcel-input-view">
                     <TenderProfileHeader tender={tenderData} parcel={parcelData} onParcelUpdate={(f, v) => setParcelData({ ...parcelData, [f]: v })} onTenderUpdate={(f, v) => setTenderData({ ...tenderData, [f]: v })} />
                     <SizeProfileTable state={state} totals={totals} onAddRange={n => setState({ ...state, ranges: [...state.ranges, n] })} onDeleteRange={r => setState({ ...state, ranges: state.ranges.filter(x => x !== r) })} onUpdateRange={(r, f, v) => setState({ ...state, sizeProfile: { ...state.sizeProfile, [r]: { ...state.sizeProfile[r], [f]: v } } })} />
                     <FluoProfileTable totalWeight={sieveTotals.cts} totalPcs={sieveTotals.pcs} fluoState={state.fluo || {}} onUpdate={(c, v) => setState({ ...state, fluo: { ...state.fluo, [c]: v } })} />
                  </div>
               )}
               {activeTab === 'assortment' && <div className="category-stack">{state.ranges.map(r => <AssortmentTable key={r} range={r} state={state} onValueChange={(r, col, clr, f, v, sh) => { const nt = { ...state.table }; if (!nt[r]) nt[r] = {}; if (!nt[r][col]) nt[r][col] = {}; if (!nt[r][col][sh]) nt[r][col][sh] = {}; if (!nt[r][col][sh][clr]) nt[r][col][sh][clr] = {}; nt[r][col][sh][clr][f] = v; setState({ ...state, table: nt }); }} onSampleChange={(r, f, v) => { const n = { ...state.sampleConfig }; if (!n[r]) n[r] = {}; n[r][f] = v; setState({ ...state, sampleConfig: n }); }} onUpdateConfig={(r, f, v) => { const n = { ...state.rangeConfig }; if (!n[r]) n[r] = {}; n[r][f] = v; setState({ ...state, rangeConfig: n }); }} onClarityMultiplierChange={(r, c, v) => { const n = { ...state.rangeConfig }; if (!n[r]) n[r] = {}; if (!n[r].clarityMultipliers) n[r].clarityMultipliers = {}; n[r].clarityMultipliers[c] = v; setState({ ...state, rangeConfig: n }); }} />)}</div>}
               {activeTab === 'polish' && <div className="category-stack">{state.ranges.map(r => <PolishTable key={r} range={r} state={state} prices={state.prices} sizeChart={state.sizeChart} onUpdateConfig={(r, f, v) => { const n = { ...state.rangeConfig }; if (!n[r]) n[r] = {}; n[r][f] = v; setState({ ...state, rangeConfig: n }); }} />)}</div>}
               {activeTab === 'prices' && <PriceMasterView prices={state.prices} onUpdate={np => setState({ ...state, prices: np })} />}
               {activeTab === 'summary' && (
                  <div className="summary-report-view">
                     <button className="btn btn-gold" onClick={() => {
                        const el = document.querySelector('.summary-report-container');
                        import('html2pdf.js').then(h => h.default().from(el).save());
                     }}>Download PDF</button>
                     <ParcelSummaryReport parcel={parcelData} tender={tenderData} state={state} prices={state.prices} totals={totals} onUpdate={(k, v) => setState(s => ({ ...s, [k]: v }))} />
                  </div>
               )}
               {activeTab === 'size_chart' && <SizeChartView chart={state.sizeChart} onUpdate={nc => setState({ ...state, sizeChart: nc })} />}
            </div>
         </div>
      </div>
   );
}
