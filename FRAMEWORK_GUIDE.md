# AMAZONWEBMOBILEPLAYWRIGHTFRAMEWORK Guide

This document explains the purpose of each folder and important file in the AMAZONWEBMOBILEPLAYWRIGHTFRAMEWORK project.

## Core Flow

```text
Requirement
Feature file
Step definition
Page object
Playwright/Appium driver factory
Execution
Reports, logs, screenshots, AI analysis, Vector DB knowledge
```

## Feature Files

- `home.feature`: Amazon home page, logo, search box, cart link, footer links, and product search.
- `search_results.feature`: Amazon search results, product cards, sort dropdown, and opening the first product.
- `product_details.feature`: Amazon product title, price/rating checks, and add-to-cart flow when available.
- `cart.feature`: Amazon cart page, empty-cart state, and proceed-to-buy button when cart has items.

## Step Definitions

- `common.steps.js`: Shared navigation, search, product opening, cart opening, and generic page assertions.
- `home.steps.js`: Amazon home page validations.
- `searchResults.steps.js`: Amazon search result validations.
- `product.steps.js`: Amazon product details validations.
- `cart.steps.js`: Amazon cart validations.
- `unified.steps.js`: Cross-platform sample steps for future web/mobile reuse.

## Page Objects

- `AmazonHomePage.js`: Home page locators and search/footer/cart actions.
- `AmazonSearchResultsPage.js`: Search results locators and first-product action.
- `AmazonProductDetailsPage.js`: Product title, price, rating, add-to-cart, and cart navigation.
- `AmazonCartPage.js`: Cart title, empty-cart state, cart items, and checkout button.
- `HomePage.js`, `ProductDetailsPage.js`, and `CartPage.js`: Compatibility wrappers that point to Amazon page objects.
- `BasePage.js`: Backward-compatible base page export.

## Configuration

- `.env.example`, `.env.qa`, `.env.stage`, `.env.prod`: Environment-level values.
- `config/env.config.js`: Central runtime config.
- `playwright.config.js`: Playwright defaults.
- `test-data/products.json`: Amazon product search data.

## Reports And AI

- `reports/`: Cucumber JSON/HTML, screenshots, videos, and traces.
- `ai/`: AI agents, prompts, workflows, MCP config, memory, and Vector DB services.
- `ai/vector-db/`: ChromaDB/local fallback ingestion and retrieval services.

## Common Commands

```bash
npm test
npm run test:smoke
npm run test:regression
npm run test:web
npm run report
npm run vector:ingest
npm run ai:analyze-failures
```
