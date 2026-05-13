export const getPriceIdxFromRange = (rangeStr) => {
  if (!rangeStr) return "r1";
  const match = rangeStr.match(/^([\d.]+)/);
  if (!match) return "r1";
  const weight = parseFloat(match[1]);
  return getPriceIdxByWeight(weight);
};

export const getPriceIdxByWeight = (w) => {
  if (!w || w <= 0) return "r1";
  
  if (w < 0.005) return "r1";
  if (w < 0.008) return "r2";
  if (w < 0.021) return "r3";
  if (w < 0.030) return "r4";
  if (w < 0.040) return "r5";
  if (w < 0.045) return "r6";
  if (w < 0.052) return "r7";
  if (w < 0.059) return "r8";
  if (w < 0.070) return "r9";
  if (w < 0.079) return "r10";
  if (w < 0.100) return "r11";
  if (w < 0.126) return "r12";
  if (w < 0.160) return "r13";
  if (w < 0.190) return "r14";
  if (w < 0.230) return "r15";
  if (w < 0.300) return "r16";
  if (w < 0.400) return "r17";
  if (w < 0.500) return "r18";
  if (w < 0.700) return "r19";
  if (w < 0.900) return "r20";
  if (w < 1.000) return "r21";
  return "r22";
};