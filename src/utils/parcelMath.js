import { formatNum } from './calculations';

export const getPriceIdxByWeight = (w) => {
   if (w < 0.005) return "r1";  // Next (r2) starts at 0.005
   if (w < 0.009) return "r2";  // Next (r3) starts at 0.009
   if (w < 0.022) return "r3";  // Next (r4) starts at 0.022
   if (w < 0.052) return "r4";  // Next (r5) starts at 0.052
   if (w < 0.078) return "r5";  // Next (r6) starts at 0.078
   if (w < 0.116) return "r6";  // Next (r7) starts at 0.116
   if (w < 0.159) return "r7";  // Next (r8) starts at 0.159
   if (w < 0.190) return "r8";  // Next (r9) starts at 0.190
   if (w < 0.230) return "r9";  // Next (r10) starts at 0.230
   if (w < 0.300) return "r10"; // Next (r11) starts at 0.300
   if (w < 0.400) return "r11"; // Next (r12) starts at 0.400
   if (w < 0.500) return "r12"; // Next (r13) starts at 0.500
   if (w < 0.700) return "r13"; // Next (r14) starts at 0.700
   if (w < 0.900) return "r14"; // Next (r15) starts at 0.900
   if (w < 1.000) return "r15"; // Next (r16) starts at 1.000
   return "r16"; // 1.00 - 1.49+
};

export const calculateParcelTotals = (state, parcel, globalPrices, COLOUR_LIST, CLARITY_LIST, isHotSize, usableColourMax = 'H', usableClarityMin = 'VS1') => {
   if (!state || !state.table) return null;

   let totalPolCts = 0;
   let totalPolPcs = 0;
   let totalValue = 0;
   let hotCts = 0;
   
   const rangeWise = {};
   const colorProfile = {};
   const clarityProfile = {};
   COLOUR_LIST.forEach(c => colorProfile[c] = 0);
   CLARITY_LIST.forEach(c => clarityProfile[c] = 0);

   // Dynamic usable data structures based on thresholds
   const usableColours = COLOUR_LIST.slice(0, COLOUR_LIST.indexOf(usableColourMax) + 1);
   const usableClarities = CLARITY_LIST.slice(0, CLARITY_LIST.indexOf(usableClarityMin) + 1);
   
   const usablePcs = {};
   const nonUsablePcs = {};
   
   // Initialize usablePcs for all colours that could be usable
   usableColours.forEach(col => {
      usablePcs[col] = {};
      usableClarities.forEach(clr => {
         usablePcs[col][clr] = 0;
      });
   });
   
   // Initialize nonUsablePcs for all colours that could be non-usable
   COLOUR_LIST.filter(c => !usableColours.includes(c)).forEach(col => {
      nonUsablePcs[col] = {};
      CLARITY_LIST.forEach(clr => {
         nonUsablePcs[col][clr] = 0;
      });
   });

   const usableData = {
      usableRough: 0, usablePol: 0, usableVal: 0,
      nonUsableRough: 0, nonUsablePol: 0, nonUsableVal: 0,
      usablePcs,
      nonUsablePcs
   };

   const clarityGroups = {
      high: ['VVS', 'VS1', 'VS2'],
      low: ['SI1', 'SI2', 'I1', 'I2']
   };

   (state.ranges || []).forEach(r => {
      const target = state.sizeProfile?.[r] || { cts: 0, avg: 0 };
      const targetCts = parseFloat(target.cts) || 0;
      const sample = state.sampleConfig?.[r] || { cts: 0, pcs: 0 };
      const rangeScaleFactor = (targetCts > 0 && sample.cts > 0) ? (targetCts / sample.cts) : 1;

      const rCfg = state.rangeConfig?.[r] || {};
      const selectedShapes = rCfg.selectedShapes || ["Round"];

      const roundYield = parseFloat(rCfg.roundYield) || 44;
      const roundMultiplier = parseFloat(rCfg.roundMultiplier) || 1;
      const fancyYield = parseFloat(rCfg.fancyYield) || 40;
      const fancyMultiplier = parseFloat(rCfg.fancyMultiplier) || 1.5;

      const clarityMultipliers = rCfg.clarityMultipliers || {};
      const roundYieldByClarity = rCfg.roundYieldByClarity || {};
      const fancyYieldByClarity = rCfg.fancyYieldByClarity || {};
      const roundMultiplierByClarity = rCfg.roundMultiplierByClarity || {};
      const fancyMultiplierByClarity = rCfg.fancyMultiplierByClarity || {};

      rangeWise[r] = { pcs: 0, cts: 0, val: 0, roughCts: targetCts };

      // Helper for pIdx within this range
      const getGroupAvgSize = (category, clarities) => {
         let totalPolC = 0;
         let totalPolP = 0;
         const isRoundCategory = category.toLowerCase() === "round";
         
         (state.ranges || []).forEach(range => {
            if (range !== r) return;
            COLOUR_LIST.forEach(colour => {
               const shapesInTable = Object.keys(state.table?.[range]?.[colour] || {});
               const shapesToScan = isRoundCategory 
                  ? shapesInTable.filter(s => s.toLowerCase() === "round")
                  : shapesInTable.filter(s => s.toLowerCase() !== "round");

               shapesToScan.forEach(shape => {
                  clarities.forEach(clarity => {
                     const sCts = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.cts) || 0;
                     const sPcs = parseFloat(state.table?.[range]?.[colour]?.[shape]?.[clarity]?.pcs) || 0;
                     if (sCts > 0 && sPcs > 0) {
                        const isRound = shape.toLowerCase() === "round";
                        const cMult = parseFloat(clarityMultipliers[clarity]) || 1;
                        const yld = isRound ? (parseFloat(roundYieldByClarity[clarity]) || roundYield) : (parseFloat(fancyYieldByClarity[clarity]) || fancyYield);
                        const mult = isRound ? (parseFloat(roundMultiplierByClarity[clarity]) || roundMultiplier) : (parseFloat(fancyMultiplierByClarity[clarity]) || fancyMultiplier);

                        const polP = Math.round((sPcs * rangeScaleFactor * cMult) * mult);
                        const polC = (sCts * rangeScaleFactor * cMult) * (yld / 100);
                        totalPolC += polC;
                        totalPolP += polP;
                     }
                  });
               });
            });
         });
         return totalPolP > 0 ? totalPolC / totalPolP : 0;
      };

      const avgs = {
         "Round": { high: getGroupAvgSize("Round", clarityGroups.high), low: getGroupAvgSize("Round", clarityGroups.low) },
         "Fancy": { high: getGroupAvgSize("Fancy", clarityGroups.high), low: getGroupAvgSize("Fancy", clarityGroups.low) }
      };

      COLOUR_LIST.forEach(col => {
         // IMPORTANT: Scan all shapes present in the data, not just selected ones
         const shapesInData = new Set();
         (state.ranges || []).forEach(range => {
            if (range !== r) return;
            Object.keys(state.table?.[range]?.[col] || {}).forEach(s => shapesInData.add(s));
         });

         shapesInData.forEach(shape => {
            CLARITY_LIST.forEach(clr => {
               const sPcs = parseFloat(state.table?.[r]?.[col]?.[shape]?.[clr]?.pcs) || 0;
               const sCts = parseFloat(state.table?.[r]?.[col]?.[shape]?.[clr]?.cts) || 0;
               if (sCts === 0 && sPcs === 0) return;

               const cMult = parseFloat(clarityMultipliers[clr]) || 1;
               const isRound = shape.toLowerCase() === "round";
               const lookupShape = isRound ? "Round" : "Fancy";

               const yld = isRound ? (parseFloat(roundYieldByClarity[clr]) || roundYield) : (parseFloat(fancyYieldByClarity[clr]) || fancyYield);
               const mult = isRound ? (parseFloat(roundMultiplierByClarity[clr]) || roundMultiplier) : (parseFloat(fancyMultiplierByClarity[clr]) || fancyMultiplier);
               
               const roughC = sCts * rangeScaleFactor * cMult;
               const polC = parseFloat(formatNum(roughC * (yld / 100), 2).replace(/,/g, ''));
               const polP = Math.round((sPcs * rangeScaleFactor * cMult) * mult);

               const isHigh = clarityGroups.high.includes(clr);
               const grpAvg = isHigh ? avgs[lookupShape].high : avgs[lookupShape].low;
               const pIdx = getPriceIdxByWeight(grpAvg);

               // Use Previous Category Price logic (consistent with PolishTable)
               const usePrevCfg = isRound ? (rCfg.roundUsePrevPrice || {}) : (rCfg.fancyUsePrevPrice || {});
               const usePrev = usePrevCfg[clr];
               const clrIdx = CLARITY_LIST.indexOf(clr);
               const priceClarity = (usePrev && clrIdx > 0) ? CLARITY_LIST[clrIdx - 1] : clr;

               // Case-insensitive shape lookup in globalPrices
               const priceShapeKey = Object.keys(globalPrices || {}).find(k => k.toLowerCase() === lookupShape.toLowerCase()) || lookupShape;
               const price = globalPrices?.[priceShapeKey]?.[pIdx]?.[col]?.[priceClarity] || 0;
               const val = polC * price;

               totalPolCts += polC;
               totalPolPcs += polP;
               totalValue += val;
               
               rangeWise[r].cts += polC;
               rangeWise[r].pcs += polP;
               rangeWise[r].val += val;

               colorProfile[col] += polC;
               clarityProfile[clr] += polC;

               if (isHotSize && isHotSize(col, clr)) hotCts += polC;

               // Usable vs Non-Usable logic
               const usableColours = COLOUR_LIST.slice(0, COLOUR_LIST.indexOf(usableColourMax) + 1);
               const usableClarities = CLARITY_LIST.slice(0, CLARITY_LIST.indexOf(usableClarityMin) + 1);
               
               const isUsable = usableColours.includes(col) && usableClarities.includes(clr);
               
               if (isUsable) {
                  usableData.usableRough += roughC;
                  usableData.usablePol += polC;
                  usableData.usableVal += val;
                  if (!usableData.usablePcs[col]) usableData.usablePcs[col] = {};
                  usableData.usablePcs[col][clr] = (usableData.usablePcs[col][clr] || 0) + polP;
               } else {
                  usableData.nonUsableRough += roughC;
                  usableData.nonUsablePol += polC;
                  usableData.nonUsableVal += val;
                  if (!usableData.nonUsablePcs[col]) usableData.nonUsablePcs[col] = {};
                  usableData.nonUsablePcs[col][clr] = (usableData.nonUsablePcs[col][clr] || 0) + polP;
               }
            });
         });
      });
   });

   return { 
      totalCts: totalPolCts, 
      totalPcs: totalPolPcs,
      totalValue, 
      hotCts,
      rangeWise,
      colorProfile,
      clarityProfile,
      usableData
   };
};
