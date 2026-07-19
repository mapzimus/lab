window.RADAR_CONFIG = {
  api: "/api/stocks-radar",
  fallback: "/data/stocks-radar.json",
  buildSections(data, { card, fmt }) {
    const pct = (q) => q.changePct == null ? "" : `${q.changePct >= 0 ? "▲" : "▼"} ${Math.abs(q.changePct).toFixed(2)}%`;
    const quoteCard = (q) => card(
      `${q.symbol} — ${q.name}`, q.url,
      q.price != null ? `$${fmt.format(Math.round(q.price * 100) / 100)}` : "",
      [pct(q)], Math.abs(q.changePct ?? 0) >= 10);
    const socialCard = (s) => card(s.title, s.url, "", ["Stocktwits"]);
    return [
      ["trending", "Trending tickers", "What the market is searching for and talking about right now.", (data.trending || []).map(quoteCard)],
      ["gainers", "Biggest movers", "Today's largest swings among the trending set.", (data.gainers || []).map(quoteCard)],
      ["social", "Social buzz", "Tickers trending on Stocktwits.", (data.social || []).map(socialCard)],
    ];
  },
};
