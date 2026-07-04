# Skoda Finance Helper

A small local web app for desk finance examples, D. M. Keith Skoda offer references, vehicle lookup, OFP guidance, and retailer-only market valuation.

## Features

- PCP and HP payment calculator
- Editable APR, term, deposit, part-ex equity and contributions
- D. M. Keith Skoda offer feed for new and used finance reference figures
- Reg lookup for make, model, year, first registration, fuel, colour and power
- OFP guide using age, mileage, fuel type and market confidence
- UK national Auto Trader retailer-ad valuation
- Private Auto Trader adverts are excluded when seller type is labelled
- Spec-aware valuation for battery/version, drivetrain, performance and trim markers
- Target margin input with instant buy-in guide updates

## Run Locally

Requires Node.js 18 or newer.

```bash
npm start
```

Then open:

```text
http://localhost:4177
```

To use a different port:

```bash
PORT=3000 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=3000
npm start
```

The start script uses Node's `--use-system-ca` option so Windows machines can use the system certificate store for public HTTPS sites such as Auto Trader, DVLA and CarCheck.

## Check

```bash
npm run check
```

## Environment

Copy `.env.example` to `.env` if you want local environment settings.

```text
DVLA_API_KEY=
PORT=4177
```

`DVLA_API_KEY` is optional. If it is not set, the app uses the public DVLA vehicle enquiry website flow and a public CarCheck fallback for model/power enrichment.

## Valuation Notes

The valuation is a guide only. It uses live public advertised data, not CAP/HPI/Glass's dealer book values.

Current valuation logic:

- Searches UK national Auto Trader retailer adverts
- Excludes private sales when Auto Trader labels seller type
- Uses exact hard-spec matching where possible, such as `vRS`, `4WD`, `xDrive`, `85`, `60`, `85x`
- Uses trim matching where enough comparable cars exist, such as `Sportline`, `SEL`, `M Sport`, `Edition`, `Suite`
- Adjusts comparable prices for mileage and age
- Applies EV/performance/prep/stocking-risk deductions to the buy-in guide
- Uses the target margin to calculate the buy-in guide

Always verify final values against your dealer valuation tools before quoting or bidding.

## Project Structure

```text
server.js          Node HTTP server and public data fetchers
public/index.html App UI
public/app.js     Calculator and valuation UI logic
public/styles.css Styling
.env.example      Optional environment settings
```

## GitHub

This project has no third-party npm dependencies. You can push the folder directly to GitHub.
