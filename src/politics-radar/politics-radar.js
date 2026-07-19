window.RADAR_CONFIG = {
  api: "/api/politics-radar",
  fallback: "/data/politics-radar.json",
  buildSections(data, { card }) {
    return (data.feeds || []).map((feed) => [
      "news", feed.label, "",
      feed.items.map((i) => card(i.title, i.url, i.desc || "", [feed.label])),
    ]);
  },
};
