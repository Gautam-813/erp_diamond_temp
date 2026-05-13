import { formatNum } from './calculations';

export const getPriceIdxByWeight = (w) => {
   if (w >= 0.002 && w < 0.005) return "r1";
   if (w >= 0.005 && w < 0.008) return "r2";
   if (w >= 0.008 && w < 0.018) return "r3";
   if (w >= 0.018 && w < 0.021) return "r3";
   if (w >= 0.021 && w < 0.030) return "r4";
   if (w >= 0.030 && w < 0.040) return "r5";
   if (w >= 0.040 && w < 0.045) return "r6";
   if (w >= 0.045 && w < 0.052) return "r7";
   if (w >= 0.052 && w < 0.059) return "r8";
   if (w >= 0.059 && w < 0.070) return "r9";
   if (w >= 0.070 && w < 0.079) return "r10";
   if (w >= 0.079 && w < 0.095) return "r11";
   if (w >= 0.095 && w < 0.100) return "r11";
   if (w >= 0.100 && w < 0.126) return "r12";
   if (w >= 0.126 && w < 0.160) return "r13";
   if (w >= 0.160 && w < 0.180) return "r14";
   if (w >= 0.180 && w < 0.190) return "r14";
   if (w >= 0.190 && w < 0.220) return "r15";
   if (w >= 0.220 && w < 0.230) return "r15";
   if (w >= 0.230 && w < 0.290) return "r16";
   if (w >= 0.290 && w < 0.300) return "r16";
   if (w >= 0.300 && w < 0.400) return "r17";
   if (w >= 0.400 && w < 0.500) return "r18";
   if (w >= 0.500 && w < 0.700) return "r19";
   if (w >= 0.700 && w < 0.900) return "r20";
   if (w >= 0.900 && w < 1.000) return "r21";
   return "r22"; // 1.00 - 1.49+
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
      nonUsablePcs,
      shapeClarityCategoryProfile: {} // Added for detailed breakdown
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

               const usePrevCfg = isRound ? (rCfg.roundUsePrevPrice || {}) : (rCfg.fancyUsePrevPrice || {});
               const usePrev = usePrevCfg[clr];
               const clrIdx = CLARITY_LIST.indexOf(clr);
               const priceClarity = (usePrev && clrIdx > 0) ? CLARITY_LIST[clrIdx - 1] : clr;

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

               // Shape x Clarity x Category breakdown population
               const scp = usableData.shapeClarityCategoryProfile;
               if (!scp[lookupShape]) scp[lookupShape] = {};
               if (!scp[lookupShape][r]) scp[lookupShape][r] = {};
               if (!scp[lookupShape][r][clr]) scp[lookupShape][r][clr] = { cts: 0, pcs: 0 };
               scp[lookupShape][r][clr].cts += polC;
               scp[lookupShape][r][clr].pcs += polP;
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
