# Stock Compass

A plain-language stock research app for everyday and diaspora investors. You pick what you want from your money, and Stock Compass ranks well-known stocks from Africa, North America, Europe and Asia by how well they fit. Each stock gets clear verdicts, strengths, risks and a cost calculator in your own currency. It never tells you to buy or sell. It gives you the information to decide.

Built with Claude (Anthropic) in October 2026.

## Why it exists

Most stock apps are built for people investing in their own country, and they assume you already speak finance. Stock Compass is built for people like me: living in Canada, investing in Nigerian and global companies, often through family back home, and wanting answers in plain English and in my own currency.

## Features

- **Goal-based ranking.** Choose "Steady income", "Grow my money", "Play it safe" or "A bit of everything", and the list re-ranks by match score.
- **Plain-language verdicts.** Each stock is rated on dividend income, profitability, growth, price versus earnings, and risk, with a one-sentence summary and a short explanation per measure.
- **Strengths, risks and a checklist.** These are generated from the numbers, plus notes specific to each company, and end with the questions to answer before investing.
- **"What would it cost me?" calculator.** Converts share prices into CAD, NGN, USD, GBP, EUR and more, and estimates yearly dividend income.
- **Side-by-side comparison** of up to three stocks, highlighting the best value in each row.
- **Live prices** from Alpha Vantage (when connected), with dividend yield and P/E adjusted to the live price. Non-US stocks use their US listings, converted back to the home-market price.
- **Shared family portfolio.** Holdings, status (planned, applied, holding, sold), who contributed what, and totals in your chosen currency, synced live between family members.
- **Shared watchlist** and **add-your-own stock** form for companies not in the list.
- **AI write-ups.** A "deeper analysis" button asks Claude for a neutral brief on any company.
- Works on phones, and in light and dark mode.

## How the scoring works

Each stock gets five scores out of 100:

| Measure | Based on |
|---|---|
| Dividend income | Dividend yield, reduced if the company pays out more than it earns |
| Profitability | Net profit margin |
| Growth | Revenue growth over the latest year |
| Price vs earnings | P/E ratio (lower scores as cheaper) |
| Risk level | Debt-to-equity, price volatility (beta), and an emerging-market adjustment |

Your chosen goal weights these five into a single match score. The formula is deliberately simple and transparent. It is a starting point for research, not a prediction.

## Running it

It's a single, self-contained `index.html` file with no build step.

- **Inside Claude:** all features work, including live prices, the shared portfolio and AI write-ups.
- **On its own** (opened locally or on GitHub Pages): the explorer, scoring, comparison, calculator and watchlist all work with built-in reference data. Live prices, the shared portfolio and AI write-ups need the Claude runtime and are hidden or show a notice.

## Data and limitations

- Fundamentals (margins, growth, debt, payout) are approximate reference values as of mid-2026, compiled from public results. Nigerian figures come from H1 2026 results and Q3 2026 prices.
- Live prices depend on Alpha Vantage's free tier, which allows about 25 requests a day. Prices are cached and shared to stretch that limit.
- Nigerian Exchange (NGX) stocks have no live feed and use reference or user-entered prices.
- Exchange rates are approximate.

**Not financial advice.** Always confirm current figures with an official source before investing.

## Roadmap

- Live NGX, Nairobi and Johannesburg data
- Returns shown in your home currency after exchange-rate moves
- IPO and public offer tracker (e.g. the 2026 Dangote Refinery IPO)
- Step-by-step "how to buy" guides for investors abroad
