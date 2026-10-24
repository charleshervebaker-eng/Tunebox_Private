"""Tunebox backend: ytmusicapi for search/discovery. Playback happens in the
browser through YouTube's official IFrame Player API (no audio extraction)."""
import os
import re

import requests
from flask import Flask, jsonify, request, send_from_directory
from ytmusicapi import YTMusic

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)
yt = YTMusic()  # unauthenticated: search, browse, radio


def slim(item):
    thumbs = item.get("thumbnails") or item.get("thumbnail") or []
    album = item.get("album")
    first = next((a for a in (item.get("artists") or []) if a.get("id")), None)
    return {
        "artistId": first["id"] if first else None,
        "videoId": item.get("videoId"),
        "title": item.get("title"),
        "artists": ", ".join(
            a["name"] for a in (item.get("artists") or []) if a.get("name")
        ),
        "album": album.get("name") if isinstance(album, dict) else None,
        "duration": item.get("duration") or item.get("length"),
        "thumb": thumbs[-1]["url"] if thumbs else None,
    }


def tracks_only(items):
    return [slim(i) for i in items if i.get("videoId")]


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/search")
def search():
    q = (request.args.get("q") or "").strip()
    kind = request.args.get("filter", "songs")
    if kind not in ("songs", "videos"):
        kind = "songs"
    if not q:
        return jsonify([])
    try:
        return jsonify(tracks_only(yt.search(q, filter=kind, limit=25)))
    except Exception as e:  # network, parsing changes, etc.
        return jsonify({"error": str(e)}), 502


# ------------------------------------------------- artists and albums
def best_thumb(thumbs):
    return thumbs[-1]["url"] if thumbs else None


def album_cards(items):
    out, seen = [], set()
    for a in items or []:
        bid = a.get("browseId")
        if not bid or bid in seen:
            continue
        seen.add(bid)
        out.append({
            "id": bid,
            "title": a.get("title"),
            "year": a.get("year"),
            "thumb": best_thumb(a.get("thumbnails")),
        })
    return out


def full_releases(channel_id, section):
    """Every album/single, not just the few shown on the artist page."""
    section = section or {}
    items = section.get("results") or []
    if section.get("params") and section.get("browseId"):
        try:
            items = yt.get_artist_albums(
                section["browseId"], section["params"], limit=None
            ) or items
        except Exception:
            pass  # fall back to the short list
    return album_cards(items)


@app.get("/api/artists")
def artists():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    try:
        res = yt.search(q, filter="artists", limit=5)
        return jsonify([
            {
                "id": r["browseId"],
                "name": r.get("artist") or r.get("title"),
                "thumb": best_thumb(r.get("thumbnails")),
                "subs": r.get("subscribers"),
            }
            for r in res if r.get("browseId")
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/artist")
def artist():
    cid = (request.args.get("id") or "").strip()
    if not cid:
        return jsonify({"error": "missing id"}), 400
    try:
        a = yt.get_artist(cid)
        songs_sec = a.get("songs") or {}
        songs = songs_sec.get("results") or []
        if songs_sec.get("browseId"):  # the artist's full song list
            try:
                songs = yt.get_playlist(songs_sec["browseId"], limit=100).get("tracks") or songs
            except Exception:
                pass
        return jsonify({
            "name": a.get("name"),
            "thumb": best_thumb(a.get("thumbnails")),
            "subs": a.get("subscribers"),
            "songs": tracks_only(songs),
            "albums": full_releases(cid, a.get("albums")),
            "singles": full_releases(cid, a.get("singles")),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/album")
def album():
    bid = (request.args.get("id") or "").strip()
    if not bid:
        return jsonify({"error": "missing id"}), 400
    try:
        a = yt.get_album(bid)
        thumb = best_thumb(a.get("thumbnails"))
        names = [x for x in (a.get("artists") or []) if x.get("name")]
        tracks = tracks_only(a.get("tracks") or [])
        for t in tracks:  # album tracks come without their own cover
            t["thumb"] = t["thumb"] or thumb
            t["album"] = t["album"] or a.get("title")
            t["artistId"] = t["artistId"] or (names[0].get("id") if names else None)
        return jsonify({
            "title": a.get("title"),
            "year": a.get("year"),
            "thumb": thumb,
            "artists": ", ".join(x["name"] for x in names),
            "artistId": next((x["id"] for x in names if x.get("id")), None),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ---------------------------------------------------------------- lyrics
LRC_STAMP = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")
LRCLIB = "https://lrclib.net/api"
LRCLIB_HEADERS = {"User-Agent": "Tunebox/1.0 (personal music player)"}
_lyrics_cache = {}


def parse_lrc(text):
    """'[01:02.50] words' -> [{'t': 62.5, 'text': 'words'}], sorted by time.
    A stamp with no words marks an instrumental break."""
    lines = []
    for raw in (text or "").splitlines():
        stamps = LRC_STAMP.findall(raw)
        if not stamps:
            continue
        body = LRC_STAMP.sub("", raw).strip()
        for m, s in stamps:
            lines.append({"t": round(int(m) * 60 + float(s), 2), "text": body})
    lines.sort(key=lambda l: l["t"])
    return lines


def clean_query(title):
    t = re.sub(r"\s*[\(\[][^\)\]]*\b(feat|ft|with|official|lyrics?|audio|video)\b[^\)\]]*[\)\]]", "", title or "", flags=re.I)
    return re.sub(r"\s{2,}", " ", t).strip()


def ytm_lyrics(video_id):
    """Lyrics from YouTube Music itself. Timestamps are milliseconds."""
    try:
        browse_id = yt.get_watch_playlist(videoId=video_id).get("lyrics")
        if not browse_id:
            return None
        ly = yt.get_lyrics(browse_id, timestamps=True)
        if not ly:
            return None
        if ly.get("hasTimestamps"):
            lines = [{"t": l.start_time / 1000.0, "e": l.end_time / 1000.0, "text": l.text} for l in ly["lyrics"]]
            return {"synced": True, "lines": lines, "plain": None, "source": ly.get("source") or "YouTube Music"}
        return {"synced": False, "lines": [], "plain": ly.get("lyrics"), "source": ly.get("source") or "YouTube Music"}
    except Exception:
        return None


def lrclib_lyrics(title, artist, dur):
    """Lyrics from LRCLIB (free, no key). Prefers time-synced results close to the song length."""
    try:
        cands = []
        if dur:
            r = requests.get(f"{LRCLIB}/get", params={"track_name": title, "artist_name": artist, "duration": int(dur)},
                             headers=LRCLIB_HEADERS, timeout=6)
            if r.ok:
                cands.append(r.json())
        if not any(c.get("syncedLyrics") for c in cands):
            r = requests.get(f"{LRCLIB}/search", params={"track_name": title, "artist_name": artist},
                             headers=LRCLIB_HEADERS, timeout=6)
            if r.ok:
                cands += r.json()
        cands = [c for c in cands if isinstance(c, dict) and not c.get("instrumental")]
        if dur:
            near = [c for c in cands if abs((c.get("duration") or 0) - dur) <= 6]
            cands = near or cands
        for c in cands:
            if c.get("syncedLyrics"):
                lines = parse_lrc(c["syncedLyrics"])
                if lines:
                    return {"synced": True, "lines": lines, "plain": None, "source": "LRCLIB"}
        for c in cands:
            if c.get("plainLyrics"):
                return {"synced": False, "lines": [], "plain": c["plainLyrics"], "source": "LRCLIB"}
    except Exception:
        return None
    return None


@app.get("/api/lyrics")
def lyrics():
    vid = (request.args.get("videoId") or "").strip()
    title = clean_query(request.args.get("title"))
    artist = (request.args.get("artists") or "").split(",")[0].strip()
    try:
        dur = float(request.args.get("dur") or 0)
    except ValueError:
        dur = 0
    key = f"{vid or title + '|' + artist}|{int(dur)}"
    if key in _lyrics_cache:
        return jsonify(_lyrics_cache[key])
    a = ytm_lyrics(vid) if vid else None
    if a and a["synced"]:
        best = a
    else:
        b = lrclib_lyrics(title, artist, dur) if title else None
        if b and b["synced"]:
            best = b
        else:
            best = a or b or {"synced": False, "lines": [], "plain": None, "source": None}
            if best.get("plain") is None and b and b.get("plain"):
                best = b
    _lyrics_cache[key] = best
    return jsonify(best)


@app.get("/api/alt")
def alt():
    """A playable video version of a song whose audio-only upload can't be embedded."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"error": "missing q"}), 400
    try:
        items = tracks_only(yt.search(q, filter="videos", limit=5))
        return jsonify(items[0] if items else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/suggest")
def suggest():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    try:
        return jsonify(yt.get_search_suggestions(q)[:8])
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/radio")
def radio():
    vid = (request.args.get("videoId") or "").strip()
    if not vid:
        return jsonify([])
    try:
        data = yt.get_watch_playlist(videoId=vid, radio=True, limit=25)
        return jsonify(tracks_only(data.get("tracks", [])))
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/recommend")
def recommend():
    """Personalised mix: related songs for a few seeds (recent plays and favorites),
    interleaved so every seed gets a say, with the seeds themselves removed."""
    seeds = [s for s in (request.args.get("seeds") or "").split(",") if s.strip()][:4]
    if not seeds:
        return jsonify([])
    lists, errors = [], 0
    for sid in seeds:
        try:
            data = yt.get_watch_playlist(videoId=sid, radio=True, limit=20)
            lists.append(tracks_only(data.get("tracks", [])))
        except Exception:
            errors += 1
    if not lists:
        return jsonify({"error": "could not load recommendations"}), 502
    skip, seen, out = set(seeds), set(), []
    for i in range(max(len(l) for l in lists)):
        for l in lists:
            if i < len(l):
                t = l[i]
                key = ((t["title"] or "").lower(), (t["artists"] or "").lower())
                if t["videoId"] in skip or key in seen:
                    continue
                seen.add(key)
                out.append(t)
    return jsonify(out[:40])


@app.get("/api/charts")
def charts():
    country = (request.args.get("country") or "ZZ").upper()[:2]
    try:
        data = yt.get_charts(country)
        videos = (data.get("videos") or {}).get("items") or []
        return jsonify(tracks_only(videos))
    except Exception as e:
        return jsonify({"error": str(e)}), 502


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=False)
