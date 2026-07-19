window.RADAR_CONFIG = {
  api: "/api/soccer-radar",
  fallback: "/data/soccer-radar.json",
  buildSections(data, { card }) {
    const scoreCard = (s) => card(s.score || s.title, s.url, "", [s.league, s.status]);
    const newsCard = (n) => card(n.title, n.url, n.desc || "", []);
    return [
      ["scores", "Scores", "Today's matches across the tracked leagues.", (data.scores || []).map(scoreCard)],
      ["transfers", "Transfer talk", "Signings, bids, fees, and gossip pulled from the day's coverage.", (data.transfers || []).map(newsCard)],
      ["news", "News", "The rest of the day's football coverage.", (data.news || []).map(newsCard)],
    ];
  },
};
