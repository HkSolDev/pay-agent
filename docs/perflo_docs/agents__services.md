> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# The service marketplace

> A catalog of verified pay-per-call services your agent can buy from within your budget: search, data, media, email, and more.

export const marketplaceSize = "hundreds of verified pay-per-call services, with new ones added weekly";

Your agent isn't limited to moving your own money. With your permission, it can buy the exact tools it needs to finish a job (pull fresh data, run a web search, generate an image, send an email, place a phone call) and pay for each one the moment it's used.

The marketplace holds {marketplaceSize}. Every purchase is priced per request, often just a few cents, comes straight out of the budget you set, and lands in your activity feed like any other payment, so you always see what your agent bought and what it cost.

## How services get listed

* **Every service is probe-verified before listing.** Perflo tests that it works and charges what it says before your agent can ever pay it.
* **Every price is quoted before payment.** A service states its exact price per request; your agent pays that or nothing. There are no subscriptions to manage, and no API keys or cards on file with dozens of vendors.
* **Your agent can delegate the choice.** Describe a task in plain language and Perflo picks the best vendor for it, with automatic failover if one fails.

Underneath is an open standard called x402 that lets a service charge a small fee per request. Your agent handles it for you. How budgets, caps, and the kill switch govern all of this is covered in [Agent spending and budgets](/agents/spending-and-budgets).

## Who's behind the catalog

Services come from established providers including Apify (whose listing alone opens up more than 20,000 ready-made data and automation tools), fal.ai, Google AI, Browserbase, AgentMail, SEC EDGAR, Questflow, Parallel, and the Stable service family.

## What's in the catalog

The groups below show the kind of thing your agent can buy, with named examples. **This list is illustrative, not exhaustive.** The live catalog your agent searches from inside your AI app is always current and always larger.

<AccordionGroup>
  <Accordion title="Social media and creators">
    The largest category: profiles, posts, comments, transcripts, followers, trends, and ad libraries across TikTok, Instagram, X (Twitter), YouTube, LinkedIn, Facebook, Reddit, Threads, Bluesky, Twitch, Spotify, Pinterest, Snapchat, and more. Examples: *TikTok: Search by Hashtag*, *Instagram: Profile*, *X: User Tweets*, *YouTube: Transcript*, *LinkedIn: Company Posts*, *Reddit: Subreddit Posts*, *Facebook: Ad Library Search*, *Spotify: Podcast Episodes*, *GitHub: Trending Repositories*.
  </Accordion>

  <Accordion title="Search, news, and research">
    Web search and content retrieval: *Exa Search* (neural web search), *Serper News*, *Firecrawl Search*, *Otto AI: Filtered News*, *Google Trends*, *EDGAR Full-Text Search* (SEC filings), *Wikipedia*, plus academic sources like *RePEc Economics Papers* and *Hugging Face Papers*.
  </Accordion>

  <Accordion title="AI models and media generation">
    Image and media generation paid per output: *FLUX.1 schnell* and *FLUX.2 Klein* (via fal), *Gemini Image Generation*, *Hugging Face Image AI*, *Questflow* (OpenAI image models), *Lightning AI Image Generator*, and multi-provider studios.
  </Accordion>

  <Accordion title="Email, communication, and outreach">
    *AgentMail* (a real inbox your agent can send and receive from), email sending relays, and validators like *Hunter Email Verifier* and *Minerva Validate Emails* that check an address is real before your agent sends to it.
  </Accordion>

  <Accordion title="Web data and automation">
    Reading and automating the web: *Firecrawl Scrape* and *Cloudflare Crawl* (clean page content from a URL), *Website Content Crawler*, *Browserbase* (a cloud browser session for automation), *Website Screenshot Generator*, and *Puppeteer*/*Playwright* scrapers.
  </Accordion>

  <Accordion title="People and company data">
    Enrichment and lookup: *PDL People Enrich*, *FullEnrich People Search*, *CompanyEnrich* (full company profile from a domain), *Crunchbase Companies* (funding and firmographics), *SimilarWeb Website Analytics*, and LinkedIn profile enrichment tools.
  </Accordion>

  <Accordion title="Jobs, real estate, and travel">
    *LinkedIn Jobs Search*, *Indeed Jobs Search*, *Coresignal Job Search*; *Zillow*, *Airbnb*, and *Idealista* listings; *Flights Search*, *Tripadvisor*, and *Booking* reviews; plus Google Maps place details, nearby search, and reviews.
  </Accordion>

  <Accordion title="Commerce, marketing, and everything else">
    *Amazon Product Search* and reviews, *Facebook Marketplace*, ad libraries across Meta, Google, TikTok, and LinkedIn, SEO tools like *Ahrefs* and *Similarweb* scrapers, sports odds and stats, games catalogs, and long-tail tools down to meme-template search.
  </Accordion>
</AccordionGroup>

## The rules never change

Four guarantees apply to every agent connected to Perflo, with no exceptions:

* **Agents never hold your keys.** An agent gets a permission slip, never the account itself.
* **Hard caps are checked before money moves.** Every spend is tested against your limits first. A request over the cap is refused, not queued.
* **Agents can't raise their own limits.** Any request from an agent to change its permissions is refused automatically. Only you, in the app, can change limits.
* **The kill switch always works.** One tap in the app instantly cuts off every agent's access.

<Note>
  Marketplace services are operated by third parties. Perflo verifies that a service works and charges its quoted price, not the accuracy of the data it returns. Spending on services runs inside the budget and guardrails you set; see [Guardrails](/concepts/guardrails).
</Note>
