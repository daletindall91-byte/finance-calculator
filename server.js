import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const port = Number(process.env.PORT || 4177);
const dmKeithBase = "https://www.dmkeith.com";
const nationalPostcode = "B11AA";

await loadEnvFile();

async function loadEnvFile() {
  try {
    const content = await readFile(join(root, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...parts] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = parts.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional.
  }
}

const fallbackOffers = [
  offer("New Skoda Electric", "Elroq", "Skoda Elroq Special Offer", 5.9, 1000, 399, "https://www.dmkeith.com/skoda/offers/skoda/skoda-elroq-special-offer/"),
  offer("New Skoda Electric", "Enyaq", "Skoda Enyaq Special Offer", 5.9, 3750, 429, "https://www.dmkeith.com/skoda/offers/skoda/skoda-enyaq-special-offer/"),
  offer("New Skoda Electric", "Enyaq Coupe", "Skoda Enyaq Coupe Special Offer", 5.9, 1000, 559, "https://www.dmkeith.com/skoda/offers/skoda/skoda-enyaq-coupe-special-offer/"),
];

function offer(category, model, title, apr, contribution, monthly, url) {
  return {
    sourceType: "dmkeith-indexed",
    category,
    model,
    title,
    apr,
    contribution,
    monthly,
    customerDeposit: 0,
    price: 0,
    retailPrice: 0,
    saving: 0,
    term: null,
    balloon: 0,
    mileage: null,
    totalPayable: 0,
    note: "D. M. Keith indexed offer reference. Open the official page and verify before quoting final figures.",
    url,
  };
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&pound;|&#163;/g, "GBP")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textFromHtml(html = "") {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyToNumber(value) {
  return Number(String(value || "").replace(/[^\d.]/g, "")) || 0;
}

function numberFrom(value) {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  return { response, html: await response.text() };
}

function parseAttributes(attributeText) {
  const attrs = {};
  for (const match of attributeText.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = decodeHtml(match[2]);
  return attrs;
}

function pickListValue(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = decodeHtml(html).match(new RegExp(`<li>\\s*${escaped}\\s*<span>\\s*([^<]+)`, "i"));
  return match?.[1]?.trim() || "";
}

function parseOfferDetail(card, html) {
  const text = textFromHtml(html);
  const title = card.title || "D. M. Keith Skoda offer";
  const model = title.replace(/^Skoda\s+/i, "").replace(/\s+Special Offer$/i, "");
  const offerText = card["offer-text"] || "Pulled from the current D. M. Keith Skoda offer page. Check full page before quoting.";
  return {
    sourceType: "dmkeith-live",
    category: "New Skoda",
    model,
    title,
    apr: numberFrom(text.match(/Representative APR\s+([\d.]+)%/i)?.[1]) ?? numberFrom(offerText.match(/([\d.]+)%\s+APR/i)?.[1]),
    contribution: moneyToNumber(pickListValue(html, "Finance Deposit Contribution")) || moneyToNumber(pickListValue(html, "Deposit Contribution")),
    monthly: moneyToNumber(pickListValue(html, "Monthly Payments")) || moneyToNumber(offerText.match(/GBP[\d,.]+/)?.[0]),
    customerDeposit: moneyToNumber(pickListValue(html, "Deposit")),
    price: moneyToNumber(pickListValue(html, "D. M. Keith Price")) || moneyToNumber(pickListValue(html, "Retail Price")),
    retailPrice: moneyToNumber(pickListValue(html, "Retail Price")),
    saving: moneyToNumber(pickListValue(html, "Savings")),
    term: numberFrom(pickListValue(html, "Duration of Agreement")),
    balloon: moneyToNumber(pickListValue(html, "Guaranteed Future Value")),
    mileage: numberFrom(pickListValue(html, "Selected Annual Mileage")),
    totalPayable: moneyToNumber(pickListValue(html, "Total Amount Payable")),
    note: offerText,
    url: new URL(card["offer-url"] || "/skoda/offers/", dmKeithBase).toString(),
  };
}

async function fetchOffers() {
  const offers = [...fallbackOffers];
  const diagnostics = [];
  try {
    const { response, html } = await fetchHtml("https://www.dmkeith.com/skoda/offers/?brand=Skoda&filter=New+Cars");
    diagnostics.push({ title: "D. M. Keith new Skoda offers", status: response.status, url: response.url });
    const cards = [...html.matchAll(/<bsk-offer-card\b([\s\S]*?)>\s*<\/bsk-offer-card>/gi)]
      .map((match) => parseAttributes(match[1]))
      .filter((card) => String(card["data-test"] || "").includes("Skoda") && card["offer-url"]?.startsWith("/skoda/"));
    for (const card of cards) {
      try {
        const detail = await fetchHtml(new URL(card["offer-url"], dmKeithBase).toString());
        offers.push(parseOfferDetail(card, detail.html));
      } catch (error) {
        diagnostics.push({ title: card.title || card["offer-url"], error: error.message });
      }
    }
  } catch (error) {
    diagnostics.push({ title: "D. M. Keith new Skoda offers", error: error.message });
  }

  offers.push({
    sourceType: "dmkeith-live",
    category: "Used Skoda",
    model: "Used Skoda PCP representative example",
    title: "D. M. Keith used Skoda finance example",
    apr: null,
    contribution: 0,
    monthly: 0,
    customerDeposit: 0,
    price: 0,
    retailPrice: 0,
    saving: 0,
    term: 48,
    balloon: 0,
    mileage: null,
    totalPayable: 0,
    note: "Open the used Skoda stock page for the live representative example and quote the exact vehicle finance.",
    url: "https://www.dmkeith.com/skoda/search/",
  });

  return { fetchedAt: new Date().toISOString(), diagnostics, offers };
}

async function lookupReg(registrationNumber) {
  const reg = String(registrationNumber || "").replace(/\s+/g, "").toUpperCase();
  if (!reg) return { ok: false, message: "Enter a registration number first." };

  const apiKey = process.env.DVLA_API_KEY || process.env.VEHICLE_ENQUIRY_API_KEY;
  if (apiKey) {
    const response = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ registrationNumber: reg }),
    });
    if (response.ok) {
      const vehicle = await response.json();
      return { ok: true, source: "DVLA vehicle enquiry API", vehicle: normaliseVehicle(reg, vehicle) };
    }
  }

  return lookupRegFromDvlaPublicSite(reg);
}

function normaliseVehicle(reg, vehicle) {
  return {
    registrationNumber: reg,
    make: vehicle.make || "",
    model: vehicle.model || "",
    yearOfManufacture: vehicle.yearOfManufacture || "",
    monthOfFirstRegistration: vehicle.monthOfFirstRegistration || "",
    firstRegistrationText: vehicle.firstRegistrationText || "",
    fuelType: vehicle.fuelType || "",
    colour: vehicle.colour || "",
    motStatus: vehicle.motStatus || "",
    taxStatus: vehicle.taxStatus || "",
    engineCapacity: vehicle.engineCapacity || "",
    co2Emissions: vehicle.co2Emissions || "",
    power: vehicle.power || "",
    modelSource: vehicle.modelSource || "",
  };
}

function setCookieHeader(response) {
  return (response.headers.get("set-cookie") || "").split(/,(?=[^;]+=)/).map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}

function extractToken(html, actionPath) {
  const escaped = actionPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`action="${escaped}[^"]*"[\\s\\S]*?name="authenticity_token" value="([^"]+)"`, "i"))?.[1];
}

function extractRows(html) {
  const rows = {};
  const decoded = decodeHtml(html);
  for (const match of decoded.matchAll(/<div class="govuk-summary-list__row">([\s\S]*?)(?=<div class="govuk-summary-list__row">|<\/dl>)/gi)) {
    const key = match[1].match(/<dt[^>]*>([\s\S]*?)<\/dt>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const value = match[1].match(/<dd[^>]*>([\s\S]*?)<\/dd>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (key && value) rows[key] = value;
  }
  return rows;
}

function firstRegistrationMonth(value) {
  const match = String(value || "").match(/([A-Za-z]+)\s+(\d{4})/);
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(String(match?.[1] || "").toLowerCase()) + 1;
  return month ? `${match[2]}-${String(month).padStart(2, "0")}` : "";
}

function carCheckMakeSlug(make) {
  return String(make || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value || "").toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bXdrive\b/g, "xDrive").replace(/\bDsg\b/g, "DSG").replace(/\bTsi\b/g, "TSI").replace(/\bTdi\b/g, "TDI");
}

async function lookupRegFromCarCheck(reg, make) {
  const makeSlug = carCheckMakeSlug(make);
  if (!makeSlug) return {};
  const response = await fetch(`https://www.carcheck.co.uk/${makeSlug}/${reg}`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!response.ok) return {};
  const text = textFromHtml(await response.text());
  const info = text.match(/General information\s+([\s\S]*?)(?:\s+Engine & fuel consumption|\s+Tax & MOT|\s+CarCheck\.co\.uk|$)/i)?.[1] || text;
  const model = info.match(/\bModel\s+([\s\S]*?)\s+(?:Colour|Year of manufacture|Top speed|Gearbox)\b/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
  return {
    model: model ? titleCase(model) : "",
    fuelType: text.match(/\bFuel type\s+([A-Za-z ]+?)\s+(?:Consumption|CO2|Emissions)\b/i)?.[1]?.trim().toUpperCase() || "",
    power: text.match(/\bPower\s+([\d,.]+\s*BHP)\b/i)?.[1]?.replace(/\s+/g, " ").trim().toUpperCase() || "",
    modelSource: model ? "CarCheck" : "",
  };
}

async function lookupRegFromDvlaPublicSite(reg) {
  const base = "https://vehicleenquiry.service.gov.uk";
  const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
  const startResponse = await fetch(`${base}/`, { headers });
  const startHtml = await startResponse.text();
  let cookies = setCookieHeader(startResponse);
  const vrnToken = extractToken(startHtml, "/vehicle-enquiry/save");
  if (!vrnToken) return { ok: false, message: "Could not start the DVLA public lookup form." };

  const vrnResponse = await fetch(`${base}/vehicle-enquiry/save?locale=en`, {
    method: "POST",
    redirect: "manual",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded", cookie: cookies, referer: `${base}/` },
    body: new URLSearchParams({ authenticity_token: vrnToken, "wizard_vehicle_enquiry_capture_vrn[vrn]": reg }),
  });
  cookies = [cookies, setCookieHeader(vrnResponse)].filter(Boolean).join("; ");
  const confirmUrl = vrnResponse.headers.get("location");
  if (!confirmUrl) return { ok: false, message: "DVLA public lookup did not return a vehicle confirmation page." };

  const confirmResponse = await fetch(new URL(confirmUrl, base), { headers: { ...headers, cookie: cookies, referer: `${base}/` } });
  const confirmHtml = await confirmResponse.text();
  const confirmToken = extractToken(confirmHtml, "/vehicle-enquiry/save");
  if (!confirmToken) return { ok: false, message: "DVLA could not find that registration, or the lookup flow changed." };

  const confirmPost = await fetch(`${base}/vehicle-enquiry/save?locale=en`, {
    method: "POST",
    redirect: "manual",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded", cookie: cookies, referer: `${base}/ConfirmVehicle?locale=en` },
    body: new URLSearchParams({ authenticity_token: confirmToken, "wizard_vehicle_enquiry_capture_confirm_vehicle[confirmed]": "Yes" }),
  });
  cookies = [cookies, setCookieHeader(confirmPost)].filter(Boolean).join("; ");
  const resultUrl = confirmPost.headers.get("location");
  if (!resultUrl) return { ok: false, message: "DVLA public lookup did not return the vehicle details page." };

  const resultResponse = await fetch(new URL(resultUrl, base), { headers: { ...headers, cookie: cookies, referer: `${base}/ConfirmVehicle?locale=en` } });
  const rows = extractRows(await resultResponse.text());
  const firstReg = rows["Date of first registration"] || "";
  const vehicle = normaliseVehicle(reg, {
    make: rows["Vehicle make"],
    yearOfManufacture: rows["Year of manufacture"],
    monthOfFirstRegistration: firstRegistrationMonth(firstReg),
    firstRegistrationText: firstReg,
    fuelType: rows["Fuel type"],
    colour: rows["Vehicle colour"],
    taxStatus: rows["Vehicle status"],
    engineCapacity: rows["Cylinder capacity"],
  });
  try {
    const enrichment = await lookupRegFromCarCheck(reg, vehicle.make);
    Object.assign(vehicle, Object.fromEntries(Object.entries(enrichment).filter(([, value]) => value)));
  } catch {
    // Useful enrichment only. DVLA result is still returned.
  }
  return { ok: true, source: vehicle.modelSource ? "DVLA public vehicle enquiry + CarCheck model fallback" : "DVLA public vehicle enquiry", vehicle };
}

function normaliseText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function modelForAutoTrader(model, make = "") {
  const text = normaliseText(model);
  const brand = normaliseText(make);
  const groups = {
    skoda: [["Fabia", /\bfabia\b/], ["Scala", /\bscala\b/], ["Octavia", /\boctavia\b/], ["Superb", /\bsuperb\b/], ["Kamiq", /\bkamiq\b/], ["Karoq", /\bkaroq\b/], ["Kodiaq", /\bkodiaq\b/], ["Enyaq", /\benyaq\b/], ["Elroq", /\belroq\b/]],
    bmw: [["1 Series", /\b(1 series|m135|m140|118i|120i|128ti)\b/], ["2 Series", /\b2 series\b/], ["3 Series", /\b3 series\b/], ["5 Series", /\b5 series\b/], ["X1", /\bx1\b/], ["X2", /\bx2\b/], ["X3", /\bx3\b/], ["X5", /\bx5\b/]],
    audi: [["A1", /\ba1\b/], ["A3", /\ba3\b/], ["A4", /\ba4\b/], ["Q2", /\bq2\b/], ["Q3", /\bq3\b/], ["Q5", /\bq5\b/]],
    volkswagen: [["Golf", /\bgolf\b/], ["Polo", /\bpolo\b/], ["Tiguan", /\btiguan\b/], ["T-Roc", /\bt roc|t-roc\b/], ["ID.3", /\bid ?3\b/], ["ID.4", /\bid ?4\b/]],
  };
  for (const [label, pattern] of groups[brand] || []) if (pattern.test(text)) return label;
  return String(model || "").replace(/\b(estate|hatch|saloon|sportline|m sport|xdrive|quattro|dsg|auto|manual|tsi|tdi|mht|se|sel|edition|vrs|rs)\b.*$/i, "").trim().split(/\s+/).slice(0, 2).join(" ");
}

function marketSearchUrl({ make, model, year, mileage }) {
  const params = new URLSearchParams({ make, model, postcode: nationalPostcode, radius: "1500", "year-from": String(Math.max(1990, year - 1)), "year-to": String(year + 1), "maximum-mileage": String(Math.max(50000, mileage + 30000)) });
  return `https://www.autotrader.co.uk/car-search?${params}`;
}

const atQuery = `query SearchResultsListingsGridQuery($filters: [FilterInput!]!, $channel: Channel!, $page: Int, $sortBy: SearchResultsSort, $listingType: [ListingType!], $searchId: String!, $featureFlags: [FeatureFlag]) { searchResults(input: { facets: [], filters: $filters, channel: $channel, page: $page, sortBy: $sortBy, listingType: $listingType, searchId: $searchId, featureFlags: $featureFlags }) { listings { ... on SearchListing { type advertId title subTitle price fpaLink sellerType trackingContext { advertContext { year price } advertCardFeatures { priceIndicator isManufacturedApproved isFranchiseApproved } } badges { type displayText } } } page { results { count } } } }`;

async function fetchAutoTraderPage({ make, model, year, mileage, page, yearSpread = 1, mileageBuffer = 30000 }) {
  const filters = [
    { filter: "make", selected: [make] },
    model ? { filter: "model", selected: [model] } : null,
    { filter: "min_year_manufactured", selected: [String(Math.max(1990, year - yearSpread))] },
    { filter: "max_year_manufactured", selected: [String(year + yearSpread)] },
    { filter: "max_mileage", selected: [String(Math.max(60000, mileage + mileageBuffer))] },
    { filter: "price_search_type", selected: ["total"] },
    { filter: "postcode", selected: [nationalPostcode] },
  ].filter(Boolean);
  const response = await fetch("https://www.autotrader.co.uk/at-gateway?opname=SearchResultsListingsGridQuery", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "x-sauron-app-name": "sauron-search-results-app", "x-sauron-app-version": "3982" },
    body: JSON.stringify({ operationName: "SearchResultsListingsGridQuery", query: atQuery, variables: { filters, channel: "cars", page, sortBy: "relevance", listingType: ["NATURAL_LISTING"], searchId: randomUUID(), featureFlags: [] } }),
  });
  const data = await response.json();
  return data.data?.searchResults || { listings: [], page: { results: { count: 0 } } };
}

function badge(badges = [], type) {
  return badges.find((item) => item.type === type)?.displayText || "";
}

function daysLive(advertId) {
  const match = String(advertId || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return Math.max(0, Math.floor((new Date() - new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) / 86400000));
}

function parseListing(listing) {
  if (listing.type !== "NATURAL_LISTING") return null;
  if (/private/i.test(String(listing.sellerType || ""))) return null;
  const price = listing.trackingContext?.advertContext?.price || moneyToNumber(listing.price);
  const year = Number(listing.trackingContext?.advertContext?.year) || Number(badge(listing.badges, "REGISTERED_YEAR").match(/\d{4}/)?.[0]);
  if (!price || !year) return null;
  const features = listing.trackingContext?.advertCardFeatures || {};
  return {
    advertId: listing.advertId,
    title: listing.title || "Advert",
    subtitle: listing.subTitle || "",
    price,
    mileage: moneyToNumber(badge(listing.badges, "MILEAGE")),
    year,
    priceIndicator: features.priceIndicator || "",
    approved: Boolean(features.isManufacturedApproved || features.isFranchiseApproved),
    daysLive: daysLive(listing.advertId),
    url: new URL(listing.fpaLink || `/car-details/${listing.advertId}`, "https://www.autotrader.co.uk").toString(),
  };
}

function specProfile(value, make) {
  const text = normaliseText(value);
  const brand = normaliseText(make);
  const required = [];
  const preferred = [];
  const excluded = [];
  const add = (list, token) => { if (!list.includes(token)) list.push(token); };
  if (brand === "skoda" && /\b(enyaq|elroq)\b/.test(text)) for (const token of ["50", "60", "80", "85", "85x"]) if (specPattern(token).test(text)) add(required, token);
  for (const token of ["vrs", "rs", "4x4", "xdrive", "quattro", "4motion"]) if (specPattern(token).test(text)) add(required, token);
  for (const token of ["m sport", "sportline", "sel", "edition", "se technology", "laurin", "klement", "xline", "monte carlo", "suite", "loft", "lounge", "ecosuite"]) if (specPattern(token).test(text)) add(preferred, token);
  if (/\bcoupe\b/.test(text)) add(required, "coupe");
  if (!/\bcoupe\b/.test(text) && /\b(enyaq|elroq)\b/.test(text)) add(excluded, "coupe");
  return { required, preferred, excluded };
}

function specPattern(token) {
  if (token === "85x") return /\b85\s*x\b/i;
  if (token === "4x4") return /\b4\s*x\s*4\b|\b4\s*wd\b|\bawd\b|\b80\s*x\b|\b85\s*x\b/i;
  if (token === "vrs") return /\bv\s*rs\b|\bvrs\b/i;
  if (token === "sel") return /\bsel\b|\bse\s*l\b/i;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function listingText(listing) {
  return normaliseText(`${listing.title} ${listing.subtitle}`);
}

function matches(listing, profile) {
  const text = listingText(listing);
  return profile.required.every((token) => specPattern(token).test(text)) && !profile.excluded.some((token) => specPattern(token).test(text));
}

function preferredCount(listing, profile) {
  const text = listingText(listing);
  return profile.preferred.filter((token) => specPattern(token).test(text)).length;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function roundMoney(value, nearest = 100) {
  return Math.round((Number(value) || 0) / nearest) * nearest;
}

function floorMoney(value, nearest = 100) {
  return Math.floor((Number(value) || 0) / nearest) * nearest;
}

async function marketValuation(params) {
  const make = String(params.make || "").trim().toUpperCase();
  const model = modelForAutoTrader(params.model, make);
  const rawModel = String(params.model || "");
  const year = Number(params.year) || new Date().getFullYear();
  const mileage = Number(params.mileage) || 0;
  const targetMargin = Math.max(0, Number(params.margin) || 2000);
  const profile = specProfile(`${rawModel} ${params.vehicleName || ""} ${params.fuel || ""} ${params.vehicleType || ""}`, make);
  const searchUrl = marketSearchUrl({ make, model, year, mileage });
  if (!make || !model) return { ok: false, message: "Need make and model first.", searchUrl };

  const attempts = [{ model, yearSpread: 1, mileageBuffer: 30000 }, { model, yearSpread: 2, mileageBuffer: 60000 }, { model: "", yearSpread: 1, mileageBuffer: 30000 }];
  let comparables = [];
  let broadened = false;
  for (const attempt of attempts) {
    const seen = new Set();
    const listings = [];
    for (const page of [1, 2, 3, 4, 5]) {
      const result = await fetchAutoTraderPage({ make, year, mileage, page, ...attempt });
      for (const item of result.listings || []) {
        const parsed = parseListing(item);
        if (parsed && !seen.has(parsed.advertId)) {
          seen.add(parsed.advertId);
          listings.push(parsed);
        }
      }
    }
    if (listings.length) {
      comparables = listings;
      broadened = attempt.model !== model || attempt.yearSpread > 1;
      break;
    }
  }

  if (!comparables.length) return { ok: false, message: "Auto Trader did not return enough retailer cars for a UK market valuation.", searchUrl };

  let specMatched = comparables.filter((item) => matches(item, profile));
  if (profile.required.length && !specMatched.length) return { ok: false, message: `Auto Trader did not return exact UK matches for ${profile.required.join(", ")} spec, so I have not valued it against different versions.`, searchUrl };
  if (!specMatched.length) specMatched = comparables;

  const preferredFull = profile.preferred.length ? specMatched.filter((item) => preferredCount(item, profile) === profile.preferred.length) : [];
  const usedPreferred = preferredFull.length >= 3;
  const pool = usedPreferred ? preferredFull : specMatched;
  const sameAge = pool.filter((item) => Math.abs(item.year - year) <= 1);
  const agePool = sameAge.length >= 3 ? sameAge : pool;

  const adjusted = agePool.map((item) => {
    const mileageAdjustment = Math.max(-3500, Math.min(3500, (item.mileage - mileage) * 0.045));
    const yearAdjustment = (year - item.year) * 1100;
    const adjustedPrice = item.price + mileageAdjustment + yearAdjustment;
    const score = Math.max(0.2, 1 - Math.abs(item.year - year) * 0.12 - Math.abs((item.mileage || mileage) - mileage) / 80000 + (item.approved ? 0.04 : 0) + (preferredCount(item, profile) * 0.03));
    return { ...item, adjustedPrice, mileageAdjustment, yearAdjustment, score, preferredSpecMatches: preferredCount(item, profile), requiredSpecMatch: matches(item, profile) };
  }).sort((a, b) => a.adjustedPrice - b.adjustedPrice);

  if (adjusted.length < 3) return { ok: false, message: "Auto Trader did not return enough similar retailer cars for a market valuation.", searchUrl };

  const topFive = adjusted.slice(0, 5);
  const prices = topFive.map((item) => item.adjustedPrice);
  const retailLow = roundMoney(percentile(prices, 0.15));
  const retailHigh = roundMoney(percentile(prices, 0.85));
  const marketRetailGuide = roundMoney(average(prices));
  const retailGuide = roundMoney(Math.min(marketRetailGuide, average(topFive.slice(0, Math.min(3, topFive.length)).map((item) => item.adjustedPrice))));
  const evRisk = /electric|enyaq|elroq|ev/i.test(`${params.fuel || ""} ${params.vehicleType || ""} ${rawModel}`) ? 0.9 : 0.95;
  const performanceRisk = /vrs|rs|m sport|xdrive|4x4|quattro/i.test(`${rawModel} ${params.vehicleName || ""}`) ? -300 : 0;
  const prepRiskBuffer = 700;
  const stockAge = average(topFive.map((item) => item.daysLive || 0));
  const stockingRiskBuffer = stockAge > 55 ? 700 : stockAge > 35 ? 400 : 150;
  const buyingGuide = floorMoney(retailGuide * evRisk - targetMargin - prepRiskBuffer - stockingRiskBuffer + performanceRisk);

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    searchUrl,
    broadened,
    comparableCount: comparables.length,
    usedComparableCount: topFive.length,
    retailLow,
    retailHigh,
    marketRetailGuide,
    retailGuide,
    buyingGuide,
    targetMargin,
    tradeMultiplier: evRisk,
    prepRiskBuffer,
    stockingRiskBuffer,
    averageAdvertisedDays: Math.round(stockAge),
    confidence: topFive.length >= 5 && !broadened ? "Good" : "Fair",
    specMatch: { required: profile.required, preferred: profile.preferred, matchedComparableCount: specMatched.length, preferredSpecUsed: usedPreferred, preferredMatchedComparableCount: preferredFull.length },
    comparables: topFive.map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
      price: item.price,
      adjustedPrice: roundMoney(item.adjustedPrice),
      mileageAdjustment: roundMoney(item.mileageAdjustment),
      yearAdjustment: roundMoney(item.yearAdjustment),
      mileage: item.mileage,
      year: item.year,
      daysLive: item.daysLive,
      priceIndicator: item.priceIndicator,
      approved: item.approved,
      requiredSpecMatch: item.requiredSpecMatch,
      preferredSpecMatches: item.preferredSpecMatches,
      score: Number(item.score.toFixed(2)),
      url: item.url,
    })),
  };
}

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/offers") return json(res, 200, await fetchOffers());
    if (url.pathname === "/api/lookup-reg") {
      const data = await lookupReg(url.searchParams.get("reg"));
      return json(res, data.ok ? 200 : 400, data);
    }
    if (url.pathname === "/api/market-valuation") {
      const data = await marketValuation(Object.fromEntries(url.searchParams));
      return json(res, data.ok ? 200 : 400, data);
    }
    const path = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
    const filePath = normalize(join(root, path));
    if (!filePath.startsWith(join(root, "public"))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error.code === "ENOENT" ? "Not found" : error.stack);
  }
});

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

server.listen(port, () => {
  console.log(`Skoda finance helper running at http://localhost:${port}`);
});
