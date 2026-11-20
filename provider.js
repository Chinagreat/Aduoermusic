/**
 * Aduoer Music 刮削源 - LRCLIB 完整版
 */
const BASE_URL = "https://lrclib.net";

const HEADERS = {
  "User-Agent": "AduoerMusic/1.0 (https://aduoer.app)",
  "Lrclib-Client": "AduoerMusic",
  "Accept": "application/json"
};

function buildQuery(params) {
  return Object.keys(params)
    .filter(k => params[k] != null && params[k] !== "")
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
}

async function request(path, params = {}) {
  const url = BASE_URL + path + (Object.keys(params).length ? "?" + buildQuery(params) : "");
  const res = await fetch(url, { method: "GET", headers: HEADERS });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`LRCLIB ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

function normalizeDuration(msOrSec) {
  if (msOrSec == null) return null;
  return msOrSec > 1000 ? Math.round(msOrSec / 1000) : Math.round(msOrSec);
}

async function search(info) {
  const title = (info.title || info.trackName || "").trim();
  const artist = (info.artist || info.artistName || "").trim();
  const album = (info.album || info.albumName || "").trim();
  const duration = normalizeDuration(info.duration);

  if (!title && !artist) return [];

  let results = await request("/api/search", {
    track_name: title || undefined,
    artist_name: artist || undefined,
    album_name: album || undefined
  });

  if (!results || results.length < 3) {
    const q = [title, artist].filter(Boolean).join(" ");
    const fuzzy = await request("/api/search", { q });
    if (fuzzy && fuzzy.length) {
      results = results ? results.concat(fuzzy) : fuzzy;
    }
  }

  if (!Array.isArray(results)) return [];

  const seen = new Set();
  const list = [];
  for (const item of results) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);

    let score = 0;
    if (duration && item.duration) {
      const diff = Math.abs(item.duration - duration);
      if (diff <= 2) score += 100;
      else if (diff <= 5) score += 60;
      else if (diff <= 10) score += 30;
      else score -= 20;
    }
    if (title && item.trackName && item.trackName.toLowerCase() === title.toLowerCase()) score += 40;
    if (artist && item.artistName && item.artistName.toLowerCase().includes(artist.toLowerCase())) score += 30;
    if (item.syncedLyrics) score += 20;
    if (item.plainLyrics) score += 5;

    list.push({
      id: String(item.id),
      title: item.trackName || title,
      artist: item.artistName || artist,
      album: item.albumName || album,
      duration: item.duration ? item.duration * 1000 : null,
      hasSynced: !!item.syncedLyrics,
      hasPlain: !!item.plainLyrics,
      instrumental: !!item.instrumental,
      score,
      source: "lrclib"
    });
  }

  list.sort((a, b) => b.score - a.score);
  return list.slice(0, 20);
}

async function getLyricsById(id) {
  const data = await request(`/api/get/${id}`);
  if (!data) return null;
  return {
    lrc: data.syncedLyrics || null,
    plain: data.plainLyrics || null,
    instrumental: !!data.instrumental,
    title: data.trackName,
    artist: data.artistName,
    album: data.albumName,
    duration: data.duration ? data.duration * 1000 : null
  };
}

async function getLyrics(info) {
  const duration = normalizeDuration(info.duration);
  if (info.title && info.artist) {
    try {
      const exact = await request("/api/get", {
        track_name: info.title,
        artist_name: info.artist,
        album_name: info.album || undefined,
        duration: duration || undefined
      });
      if (exact && (exact.syncedLyrics || exact.plainLyrics)) {
        return {
          lrc: exact.syncedLyrics || null,
          plain: exact.plainLyrics || null,
          instrumental: !!exact.instrumental,
          source: "lrclib-exact"
        };
      }
    } catch (e) {}
  }

  const candidates = await search(info);
  if (!candidates.length) return null;

  const best = candidates[0];
  const detail = await getLyricsById(best.id);
  if (!detail) return null;

  return {
    lrc: detail.lrc,
    plain: detail.plain,
    instrumental: detail.instrumental,
    source: "lrclib-search",
    matched: {
      title: detail.title,
      artist: detail.artist,
      album: detail.album,
      duration: detail.duration
    }
  };
}

async function getCover(info) {
  return null;
}

async function getArtist(info) {
  return {
    name: info.artist || info.name || ""
  };
}

const provider = {
  name: "LRCLIB",
  version: "1.0.0",
  author: "custom",
  description: "完整 LRCLIB 歌词刮削源",
  capabilities: ["lyrics", "search"],
  search,
  getLyrics,
  getLyricsById,
  getCover,
  getArtist
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = provider;
}
if (typeof globalThis !== "undefined") {
  globalThis.provider = provider;
  globalThis.AduoerProvider = provider;
}

export default provider;