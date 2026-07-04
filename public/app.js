const fields = {
  price: document.getElementById("price"),
  customerDeposit: document.getElementById("customerDeposit"),
  partExchange: document.getElementById("partExchange"),
  skodaContribution: document.getElementById("skodaContribution"),
  dealerContribution: document.getElementById("dealerContribution"),
  otherContribution: document.getElementById("otherContribution"),
  apr: document.getElementById("apr"),
  term: document.getElementById("term"),
  balloon: document.getElementById("balloon"),
  regNumber: document.getElementById("regNumber"),
  vehicleMake: document.getElementById("vehicleMake"),
  vehicleModel: document.getElementById("vehicleModel"),
  vehicleYear: document.getElementById("vehicleYear"),
  vehicleFuel: document.getElementById("vehicleFuel"),
  vehicleColour: document.getElementById("vehicleColour"),
  vehiclePower: document.getElementById("vehiclePower"),
  firstRegistered: document.getElementById("firstRegistered"),
  currentMileage: document.getElementById("currentMileage"),
  annualMileage: document.getElementById("annualMileage"),
  vehicleType: document.getElementById("vehicleType"),
  marketConfidence: document.getElementById("marketConfidence"),
  targetMargin: document.getElementById("targetMargin"),
  retailGuide: document.getElementById("retailGuide"),
  buyingGuide: document.getElementById("buyingGuide"),
  customerName: document.getElementById("customerName"),
  vehicleName: document.getElementById("vehicleName"),
  notes: document.getElementById("notes"),
};

let planType = "pcp";
let offers = [];
let valuation = null;

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function n(input) {
  return Number(input.value) || 0;
}

function floorMoney(value, nearest = 100) {
  return Math.floor((Number(value) || 0) / nearest) * nearest;
}

function monthlyPayment() {
  const price = n(fields.price);
  const support = n(fields.skodaContribution) + n(fields.dealerContribution) + n(fields.otherContribution);
  const amountFinanced = Math.max(0, price - n(fields.customerDeposit) - n(fields.partExchange) - support);
  const term = Math.max(1, n(fields.term));
  const monthlyRate = n(fields.apr) / 100 / 12;
  const balloon = planType === "pcp" ? Math.max(0, n(fields.balloon)) : 0;

  if (monthlyRate === 0) {
    return { amountFinanced, support, payment: Math.max(0, (amountFinanced - balloon) / term) };
  }

  const discountedBalloon = balloon / Math.pow(1 + monthlyRate, term);
  const principalForPayments = Math.max(0, amountFinanced - discountedBalloon);
  const payment = principalForPayments * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -term)));
  return { amountFinanced, support, payment };
}

function monthsBetween(start, end) {
  return Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
}

function annualDepreciationRate(ageYearsNow) {
  if (ageYearsNow <= 1) return 0.18;
  if (ageYearsNow <= 3) return 0.16;
  if (ageYearsNow <= 6) return 0.145;
  if (ageYearsNow <= 9) return 0.125;
  return 0.10;
}

function vehicleText() {
  return [
    fields.vehicleMake.value,
    fields.vehicleModel.value,
    fields.vehicleName.value,
    fields.vehicleFuel.value,
  ].join(" ").toLowerCase();
}

function vehicleResidualAdjustment() {
  const text = vehicleText();
  let adjustment = 0;

  if (/\b(x1|x3|x5|q3|q5|karoq|kodiaq|kamiq|tiguan|touareg|sportage|suv|4x4)\b/.test(text)) adjustment += 0.03;
  if (/\b(m sport|sportline|vrs|rs|xdrive|quattro|4motion|edition|laurin|klement)\b/.test(text)) adjustment += 0.015;
  if (/\b(citigo|fabia|scala|supermini)\b/.test(text)) adjustment -= 0.015;
  if (fields.vehicleType.value === "ev" || /\belectric\b/.test(text)) adjustment -= 0.06;
  if (fields.vehicleType.value === "performance") adjustment += 0.025;

  return adjustment;
}

function residualRate(ageYearsNow, ageYearsAtEnd, mileageAtEnd, annualMileage, termYears) {
  const depreciation = annualDepreciationRate(ageYearsNow);
  let rate = Math.pow(1 - depreciation, termYears);

  const expectedMileageAtEnd = Math.max(30000, ageYearsAtEnd * 10000);
  rate -= Math.max(0, mileageAtEnd - expectedMileageAtEnd) / 10000 * 0.012;
  rate += Math.max(0, 10000 - annualMileage) / 10000 * 0.025;
  rate -= Math.max(0, annualMileage - 10000) / 10000 * 0.025;

  if (ageYearsAtEnd > 8) rate -= 0.02;
  if (ageYearsAtEnd > 10) rate -= 0.03;

  rate += vehicleResidualAdjustment();

  if (fields.marketConfidence.value === "strong") rate += 0.05;
  if (fields.marketConfidence.value === "weak") rate -= 0.06;

  const lenderBuffer = ageYearsNow <= 1 ? 0.86 : ageYearsNow <= 3 ? 0.72 : 0.62;
  return Math.min(0.62, Math.max(0.16, rate * lenderBuffer));
}

function estimateBalloon() {
  const price = n(fields.price);
  const term = Math.max(1, n(fields.term));
  const currentMileage = n(fields.currentMileage);
  const annualMileage = n(fields.annualMileage);
  const projectedMileage = currentMileage + (annualMileage * term / 12);

  let ageMonthsNow = 0;
  if (fields.firstRegistered.value) {
    const [year, month] = fields.firstRegistered.value.split("-").map(Number);
    ageMonthsNow = monthsBetween(new Date(year, month - 1, 1), new Date());
  }
  const ageYearsNow = ageMonthsNow / 12;
  const ageYearsAtEnd = (ageMonthsNow + term) / 12;
  const termYears = term / 12;
  const rate = residualRate(ageYearsNow, ageYearsAtEnd, projectedMileage, annualMileage, termYears);

  const guide = Math.round((price * rate) / 50) * 50;
  return {
    ageYearsNow,
    ageYearsAtEnd,
    projectedMileage,
    rate,
    guide: Math.max(0, guide),
  };
}

function updateSummary() {
  const result = monthlyPayment();
  const ofp = estimateBalloon();
  document.getElementById("amountFinanced").textContent = currency.format(result.amountFinanced);
  document.getElementById("monthlyPayment").textContent = currency.format(result.payment);
  document.getElementById("supportTotal").textContent = currency.format(result.support);
  document.getElementById("endAge").textContent = `${ofp.ageYearsAtEnd.toFixed(1)} yrs`;
  document.getElementById("endMileage").textContent = `${Math.round(ofp.projectedMileage).toLocaleString("en-GB")} miles`;
  document.getElementById("estimatedBalloon").textContent = currency.format(ofp.guide);
  document.getElementById("residualPercent").textContent = `${(ofp.rate * 100).toFixed(1)}%`;

  const customer = fields.customerName.value.trim() || "Customer";
  const vehicle = fields.vehicleName.value.trim() || "Vehicle";
  const lines = [
    `${customer} - ${vehicle}`,
    `${planType.toUpperCase()} example: ${currency.format(result.payment)} per month over ${n(fields.term)} months at ${n(fields.apr).toFixed(1)}% APR.`,
    `Vehicle price: ${currency.format(n(fields.price))}`,
    `Customer deposit: ${currency.format(n(fields.customerDeposit))}`,
    `Part-ex equity: ${currency.format(n(fields.partExchange))}`,
    `Skoda contribution: ${currency.format(n(fields.skodaContribution))}`,
    `Dealer contribution: ${currency.format(n(fields.dealerContribution))}`,
    `Other contribution/grant: ${currency.format(n(fields.otherContribution))}`,
    planType === "pcp" ? `Optional final payment: ${currency.format(n(fields.balloon))}` : null,
    planType === "pcp" ? `OFP guide: ${currency.format(ofp.guide)} (${(ofp.rate * 100).toFixed(1)}% of price) based on ${Math.round(ofp.projectedMileage).toLocaleString("en-GB")} miles and ${ofp.ageYearsAtEnd.toFixed(1)} years old at end of term.` : null,
    fields.regNumber.value.trim() ? `Reg used for reference: ${fields.regNumber.value.trim().toUpperCase()}` : null,
    fields.vehicleMake.value.trim() || fields.vehicleModel.value.trim() || fields.vehicleYear.value.trim()
      ? `Vehicle lookup: ${[
          fields.vehicleYear.value.trim(),
          fields.vehicleMake.value.trim(),
          fields.vehicleModel.value.trim(),
          fields.vehicleFuel.value.trim(),
          fields.vehicleColour.value.trim(),
          fields.vehiclePower.value.trim(),
        ].filter(Boolean).join(" ")}`
      : null,
    valuation?.retailGuide ? `Top 5 retail guide: ${currency.format(valuation.retailGuide)}. Market retail guide: ${currency.format(valuation.marketRetailGuide)} (${currency.format(valuation.retailLow)}-${currency.format(valuation.retailHigh)}), based on ${valuation.usedComparableCount} Auto Trader comparables.` : null,
    valuation?.buyingGuide ? `Buy-in guide: ${currency.format(valuation.buyingGuide)} after ${currency.format(valuation.targetMargin)} margin, prep/risk allowance and stock-age risk. Avg current advert age: ${valuation.averageAdvertisedDays || "-"} days.` : null,
    fields.notes.value.trim() ? `Notes: ${fields.notes.value.trim()}` : null,
  ].filter(Boolean);

  document.getElementById("summary").value = lines.join("\n");
}

function updateBuyInFromMargin() {
  if (!valuation?.retailGuide) return;
  const targetMargin = n(fields.targetMargin);
  valuation.targetMargin = targetMargin;
  valuation.buyingGuide = floorMoney(
    valuation.retailGuide * (valuation.tradeMultiplier || 1) -
      targetMargin -
      (valuation.prepRiskBuffer || 0) -
      (valuation.stockingRiskBuffer || 0)
  );
  fields.buyingGuide.value = currency.format(valuation.buyingGuide);
  updateBuyInBreakdown();
  updateSummary();
}

function updateBuyInBreakdown() {
  const node = document.getElementById("buyInDeductions");
  if (!valuation?.retailGuide) {
    node.textContent = "-";
    return;
  }
  const riskAdjustment = Math.round(valuation.retailGuide * (1 - (valuation.tradeMultiplier || 1)));
  const total =
    riskAdjustment +
    (Number(valuation.targetMargin) || 0) +
    (Number(valuation.prepRiskBuffer) || 0) +
    (Number(valuation.stockingRiskBuffer) || 0);
  node.textContent = currency.format(total);
}

function setPlan(nextPlan) {
  planType = nextPlan;
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.plan === nextPlan);
  });
  document.querySelectorAll(".pcp-only").forEach((node) => {
    node.style.display = nextPlan === "pcp" ? "grid" : "none";
  });
  updateSummary();
}

function offerMatches(offer, query) {
  if (!query) return true;
  return `${offer.category} ${offer.model} ${offer.title} ${offer.note}`.toLowerCase().includes(query.toLowerCase());
}

function renderOffers() {
  const query = document.getElementById("offerSearch").value.trim();
  const list = document.getElementById("offerList");
  const filtered = offers.filter((offer) => offerMatches(offer, query));
  list.innerHTML = "";

  for (const offer of filtered) {
    const card = document.createElement("article");
    card.className = "offer-card";
    const contribution = Number(offer.contribution) || 0;
    card.innerHTML = `
      <h3>${offer.model}</h3>
      <div class="meta">${offer.category} &middot; ${offer.title}</div>
      <div class="offer-values">
        ${offer.apr !== null && offer.apr !== undefined ? `<span class="pill">${Number(offer.apr).toFixed(1)}% APR</span>` : ""}
        ${contribution ? `<span class="pill">${currency.format(contribution)} contribution</span>` : `<span class="pill">Official link</span>`}
        ${offer.monthly ? `<span class="pill">${currency.format(offer.monthly)} / month</span>` : ""}
        ${offer.customerDeposit ? `<span class="pill">${currency.format(offer.customerDeposit)} deposit</span>` : ""}
      </div>
      <p>${offer.note}</p>
      <div class="offer-actions">
        <button type="button" data-apply="${offers.indexOf(offer)}">Apply</button>
        <a href="${offer.url}" target="_blank" rel="noreferrer">Open official</a>
      </div>
    `;
    list.appendChild(card);
  }

  list.querySelectorAll("[data-apply]").forEach((button) => {
    button.addEventListener("click", () => applyOffer(offers[Number(button.dataset.apply)]));
  });
}

function applyOffer(offer) {
  if (offer.apr !== null && offer.apr !== undefined) fields.apr.value = offer.apr;
  if (Number(offer.price)) fields.price.value = Number(offer.price);
  if (Number(offer.customerDeposit)) fields.customerDeposit.value = Number(offer.customerDeposit);
  if (Number(offer.term)) fields.term.value = Number(offer.term);
  if (Number(offer.balloon)) fields.balloon.value = Number(offer.balloon);
  if (Number(offer.contribution)) {
    if (offer.title.toLowerCase().includes("grant")) {
      fields.otherContribution.value = Number(fields.otherContribution.value || 0) + Number(offer.contribution);
    } else {
      fields.skodaContribution.value = Number(offer.contribution);
    }
  }
  if (!fields.vehicleName.value.trim()) fields.vehicleName.value = offer.model;
  updateSummary();
}

async function refreshOffers() {
  const meta = document.getElementById("offerMeta");
  meta.textContent = "Refreshing official Skoda pages...";
  try {
    const response = await fetch("/api/offers", { cache: "no-store" });
    const data = await response.json();
    offers = data.offers || [];
    const stamp = new Date(data.fetchedAt).toLocaleString("en-GB");
    meta.textContent = `Refreshed ${stamp}. Pulls from D. M. Keith Skoda offer pages; open the offer page before quoting final figures.`;
    renderOffers();
  } catch (error) {
    meta.textContent = `Could not refresh offers: ${error.message}`;
  }
}

async function lookupReg() {
  const status = document.getElementById("regLookupStatus");
  const reg = fields.regNumber.value.trim().toUpperCase();
  if (!reg) {
    status.textContent = "Enter a reg first";
    return;
  }

  status.textContent = "Looking up...";
  try {
    const response = await fetch(`/api/lookup-reg?reg=${encodeURIComponent(reg)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      status.textContent = data.message || "Lookup failed";
      return;
    }

    const vehicle = data.vehicle;
    fields.vehicleMake.value = vehicle.make || "";
    fields.vehicleModel.value = vehicle.model || "";
    fields.vehicleYear.value = vehicle.yearOfManufacture || "";
    fields.vehicleFuel.value = vehicle.fuelType || "";
    fields.vehicleColour.value = vehicle.colour || "";
    fields.vehiclePower.value = vehicle.power || "";
    if (vehicle.monthOfFirstRegistration) fields.firstRegistered.value = vehicle.monthOfFirstRegistration;

    const nameParts = [vehicle.make, vehicle.model].filter(Boolean);
    if (nameParts.length && (!fields.vehicleName.value.trim() || fields.vehicleName.dataset.regFilled === "true")) {
      fields.vehicleName.value = nameParts.join(" ");
      fields.vehicleName.dataset.regFilled = "true";
    }

    if (/electric/i.test(vehicle.fuelType || "")) fields.vehicleType.value = "ev";
    status.textContent = vehicle.model
      ? `Vehicle filled${vehicle.modelSource ? `, model from ${vehicle.modelSource}` : ""}`
      : "Vehicle filled, but model not found. Enter model manually.";
    updateSummary();
    refreshValuation({ quiet: true });
  } catch (error) {
    status.textContent = `Lookup failed: ${error.message}`;
  }
}

function setValuationEmpty(message = "") {
  valuation = null;
  fields.retailGuide.value = "";
  fields.buyingGuide.value = "";
  document.getElementById("retailRange").textContent = "-";
  document.getElementById("marketRetailGuide").textContent = "-";
  document.getElementById("comparableCount").textContent = "-";
  document.getElementById("averageDaysAdvertised").textContent = "-";
  document.getElementById("valuationConfidence").textContent = "-";
  document.getElementById("specMatchStatus").textContent = "-";
  document.getElementById("buyInDeductions").textContent = "-";
  document.getElementById("valuationComps").innerHTML = "";
  document.getElementById("valuationSearchLink").href = "#";
  document.getElementById("valuationStatus").textContent = message;
  updateSummary();
}

function renderValuation(data) {
  valuation = data;
  fields.retailGuide.value = currency.format(data.retailGuide);
  fields.buyingGuide.value = currency.format(data.buyingGuide);
  document.getElementById("retailRange").textContent = `${currency.format(data.retailLow)} - ${currency.format(data.retailHigh)}`;
  document.getElementById("marketRetailGuide").textContent = currency.format(data.marketRetailGuide);
  document.getElementById("comparableCount").textContent = `${data.usedComparableCount}/${data.comparableCount}`;
  document.getElementById("averageDaysAdvertised").textContent = data.averageAdvertisedDays ? `${data.averageAdvertisedDays} days` : "-";
  document.getElementById("valuationConfidence").textContent = data.confidence;
  const requiredSpec = data.specMatch?.required || [];
  const preferredSpec = data.specMatch?.preferred || [];
  document.getElementById("specMatchStatus").textContent = requiredSpec.length
    ? `${data.specMatch.matchedComparableCount} exact ${requiredSpec.join(", ")}${data.specMatch.preferredSpecUsed ? `, ${data.specMatch.preferredMatchedComparableCount} trim` : ""}`
    : data.specMatch?.preferredSpecUsed
      ? `${data.specMatch.preferredMatchedComparableCount} exact ${preferredSpec.join(", ")}`
      : preferredSpec.length
        ? `${preferredSpec.join(", ")} scored`
      : "Base model";
  document.getElementById("valuationSearchLink").href = data.searchUrl || "#";
  document.getElementById("valuationStatus").textContent = `${data.broadened ? "Broadened UK search" : "UK search"} updated ${new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  updateBuyInBreakdown();

  const comps = document.getElementById("valuationComps");
  comps.innerHTML = "";
  for (const item of data.comparables || []) {
    const card = document.createElement("article");
    card.className = "valuation-comp";
    card.innerHTML = `
      <h3>${item.title} - ${currency.format(item.price)}</h3>
      <p>${item.subtitle}</p>
      <p>${item.year || ""} &middot; ${item.mileage ? item.mileage.toLocaleString("en-GB") + " miles" : "Mileage n/a"} &middot; ${item.daysLive ?? "-"} days advertised &middot; ${item.priceIndicator || "No price marker"}${item.approved ? " &middot; Approved" : ""}</p>
      <p>Adjusted to this car: <strong>${currency.format(item.adjustedPrice)}</strong> &middot; <a href="${item.url}" target="_blank" rel="noreferrer">Open advert</a></p>
    `;
    comps.appendChild(card);
  }
  updateSummary();
}

async function refreshValuation(options = {}) {
  const status = document.getElementById("valuationStatus");
  const make = fields.vehicleMake.value.trim();
  const model = fields.vehicleModel.value.trim() || fields.vehicleName.value.trim();
  const year = fields.vehicleYear.value.trim();

  if (!make || !model || !year) {
    if (!options.quiet) setValuationEmpty("Need make, model and year first");
    return;
  }

  status.textContent = "Checking Auto Trader...";
  const params = new URLSearchParams({
    make,
    model,
    year,
    mileage: String(n(fields.currentMileage)),
    margin: String(n(fields.targetMargin)),
    fuel: fields.vehicleFuel.value.trim(),
    vehicleType: fields.vehicleType.value,
    vehicleName: fields.vehicleName.value.trim(),
  });

  try {
    const response = await fetch(`/api/market-valuation?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setValuationEmpty(data.message || "Could not value from market cars");
      if (data.searchUrl) document.getElementById("valuationSearchLink").href = data.searchUrl;
      return;
    }
    renderValuation(data);
  } catch (error) {
    setValuationEmpty(`Valuation failed: ${error.message}`);
  }
}

document.querySelectorAll("input, textarea").forEach((input) => input.addEventListener("input", updateSummary));
document.querySelectorAll("select").forEach((select) => select.addEventListener("change", updateSummary));
fields.vehicleName.addEventListener("input", () => {
  fields.vehicleName.dataset.regFilled = "";
});
document.querySelectorAll(".segment").forEach((button) => button.addEventListener("click", () => setPlan(button.dataset.plan)));
document.getElementById("offerSearch").addEventListener("input", renderOffers);
document.getElementById("refreshOffers").addEventListener("click", refreshOffers);
document.getElementById("resetCalc").addEventListener("click", () => {
  fields.price.value = 30000;
  fields.customerDeposit.value = 3000;
  fields.partExchange.value = 0;
  fields.skodaContribution.value = 0;
  fields.dealerContribution.value = 0;
  fields.otherContribution.value = 0;
  fields.apr.value = 5.9;
  fields.term.value = 48;
  fields.balloon.value = 12000;
  fields.regNumber.value = "";
  fields.vehicleMake.value = "";
  fields.vehicleModel.value = "";
  fields.vehicleYear.value = "";
  fields.vehicleFuel.value = "";
  fields.vehicleColour.value = "";
  fields.vehiclePower.value = "";
  fields.firstRegistered.value = "";
  fields.currentMileage.value = 20000;
  fields.annualMileage.value = 10000;
  fields.vehicleType.value = "ice";
  fields.marketConfidence.value = "normal";
  fields.targetMargin.value = 2000;
  fields.customerName.value = "";
  fields.vehicleName.value = "";
  fields.vehicleName.dataset.regFilled = "";
  fields.notes.value = "";
  document.getElementById("regLookupStatus").textContent = "";
  setValuationEmpty("");
  setPlan("pcp");
});
document.getElementById("copySummary").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("summary").value);
  document.getElementById("copyStatus").textContent = "Copied";
  setTimeout(() => (document.getElementById("copyStatus").textContent = ""), 1800);
});
document.getElementById("applyEstimatedBalloon").addEventListener("click", () => {
  fields.balloon.value = estimateBalloon().guide;
  setPlan("pcp");
});
document.getElementById("lookupReg").addEventListener("click", lookupReg);
document.getElementById("refreshValuation").addEventListener("click", () => refreshValuation());
fields.targetMargin.addEventListener("input", updateBuyInFromMargin);
fields.targetMargin.addEventListener("change", updateBuyInFromMargin);
document.getElementById("applyRetailGuide").addEventListener("click", () => {
  if (!valuation?.retailGuide) return;
  fields.price.value = valuation.retailGuide;
  updateSummary();
});
fields.regNumber.addEventListener("keydown", (event) => {
  if (event.key === "Enter") lookupReg();
});

setPlan("pcp");
refreshOffers();
