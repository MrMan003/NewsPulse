import os
import sys
import hashlib
import sqlite3
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import feedparser
import requests
from bs4 import BeautifulSoup
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# System logging configuration setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# Complete public RSS endpoint map[cite: 1]
RSS_FEEDS = {
    "BBC News": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "The Guardian": "https://www.theguardian.com/world/rss",
    "Reuters": "https://www.reutersagency.com/feed/?best-topics=political-general-news&post_type=best",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml"
}

# Environment variable mappings or native fallbacks[cite: 2]
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "news_pulse.db"))
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.25"))
MIN_CLUSTER_SIZE     = int(os.getenv("MIN_CLUSTER_SIZE", "1"))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            summary      TEXT,
            body         TEXT,
            url          TEXT UNIQUE NOT NULL,
            source       TEXT NOT NULL,
            published_at TEXT NOT NULL,
            cluster_id   TEXT,
            fetched_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clusters (
            id           TEXT PRIMARY KEY,
            label        TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL
        );
    """)
    conn.commit()

def parse_date(entry) -> str:
    """Normalize inconsistent feed publish dates securely into consistent internal schema[cite: 1]."""
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                dt = datetime(*val[:6], tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
    return datetime.now(timezone.utc).isoformat()

def extract_text(entry) -> str:
    """Extract descriptive text safely while stripping layout artifacts[cite: 1]."""
    for field in ("content", "summary_detail", "description"):
        val = getattr(entry, field, None)
        if val:
            if isinstance(val, list) and val:
                raw = val[0].get("value", "")
            elif isinstance(val, dict):
                raw = val.get("value", "")
            else:
                raw = str(val)
            text = BeautifulSoup(raw, "html.parser").get_text(" ", strip=True)
            if len(text) > 40:
                return text
    return getattr(entry, "summary", "") or ""

def fetch_full_body(url: str) -> Optional[str]:
    """Fetch live web page content and strip boilerplate text gracefully[cite: 1]."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=7)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()

        for selector in ["article", "[role='main']", "main", ".article-body", ".story-body", ".entry-content", "#content"]:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(" ", strip=True)
                if len(text) > 200:
                    return text[:8000]

        paras = " ".join(p.get_text(" ", strip=True) for p in soup.find_all("p"))
        return paras[:8000] if len(paras) > 200 else None
    except Exception as e:
        log.debug("Body fetch failed for %s: %s", url, e)
        return None

def article_id(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()[:16]

def ingest_feeds(conn: sqlite3.Connection) -> list[dict]:
    """Loop through live news streams, parse updates, and handle deduplication efficiently[cite: 1]."""
    existing_urls: set[str] = {row[0] for row in conn.execute("SELECT url FROM articles")}
    new_articles: list[dict] = []

    # Using .items() correctly fixes the iteration type matching bug
    for name, url in RSS_FEEDS.items():
        print(f"\nFetching {name}...", flush=True)
        try:
            parsed = feedparser.parse(url)
        except Exception as e:
            log.warning("Failed to parse %s: %s", name, e)
            continue

        for entry in parsed.entries:
            url_link = getattr(entry, "link", None)
            if not url_link or url_link in existing_urls:
                continue

            title   = getattr(entry, "title", "").strip()
            summary = extract_text(entry)
            pub     = parse_date(entry)
            aid     = article_id(url_link)

            print(f"  Extracting body: {title[:50]}...", flush=True)
            body = fetch_full_body(url_link)
            time.sleep(0.3) # Respectful delay limit parameters for network scraping sequences

            article = {
                "id":           aid,
                "title":        title,
                "summary":      summary,
                "body":         body,
                "url":          url_link,
                "source":       name,
                "cluster_id":   None,
                "fetched_at":   datetime.now(timezone.utc).isoformat(),
            }

            try:
                conn.execute("""
                    INSERT OR IGNORE INTO articles
                    (id, title, summary, body, url, source, published_at, cluster_id, fetched_at)
                    VALUES (:id,:title,:summary,:body,:url,:source,:pub,:cluster_id,:fetched_at)
                """, {**article, "pub": pub})
                existing_urls.add(url_link)
                new_articles.append(article)
            except Exception as e:
                log.warning("DB insert failed: %s", e)

    conn.commit()
    print(f"Ingested {len(new_articles)} new articles.", flush=True)
    return new_articles

def build_corpus(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT id, title, summary, body, source, published_at FROM articles").fetchall()
    return [dict(r) for r in rows]

def make_doc(article: dict) -> str:
    """Weights title heavier than descriptions/body parameters to optimize cluster accuracy."""
    title   = (article.get("title") or "") * 3
    summary = article.get("summary") or ""
    body    = (article.get("body") or "")[:500]
    return f"{title} {summary} {body}"

def cluster_articles(articles: list[dict]):
    """Compute mathematical TF-IDF weights and group stories via narrative similarity[cite: 1]."""
    if not articles:
        return {}, None, None, []

    docs = [make_doc(a) for a in articles]
    ids  = [a["id"] for a in articles]

    vectorizer = TfidfVectorizer(stop_words="english", max_df=0.85, min_df=1, ngram_range=(1, 2), sublinear_tf=True)
    try:
        tfidf_matrix = vectorizer.fit_transform(docs)
    except ValueError as e:
        log.warning("TF-IDF vectorizer generation failed: %s", e)
        return {}, None, None, []

    sim_matrix = cosine_similarity(tfidf_matrix)
    parent = list(range(len(ids)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        pa, pb = find(a), find(b)
        if pa != pb:
            parent[pa] = pb

    # Union-Find cluster association loop[cite: 1]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if sim_matrix[i][j] >= SIMILARITY_THRESHOLD:
                union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(len(ids)):
        root = find(i)
        groups.setdefault(root, []).append(i)

    clusters: dict[str, list[str]] = {}
    for root, members in groups.items():
        if len(members) < MIN_CLUSTER_SIZE:
            continue
        cid = hashlib.sha1(",".join(sorted(ids[m] for m in members)).encode()).hexdigest()[:12]
        clusters[cid] = [ids[m] for m in members]

    return clusters, tfidf_matrix, vectorizer, ids

def save_clusters(conn: sqlite3.Connection, cluster_map: dict[str, list[str]], tfidf_matrix, vectorizer, all_ids: list[str]) -> None:
    """Generate high-relevance topic labels and persist associations cleanly[cite: 1]."""
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE articles SET cluster_id = NULL")
    
    terms = vectorizer.get_feature_names_out()
    id_to_idx = {aid: idx for idx, aid in enumerate(all_ids)}

    for cid, article_ids in cluster_map.items():
        try:
            member_indices = [id_to_idx[aid] for aid in article_ids]
            cluster_vectors = tfidf_matrix[member_indices]
            mean_scores = np.asarray(cluster_vectors.mean(axis=0)).flatten()
            top_idx = mean_scores.argsort()[::-1][:3]
            label = " · ".join(str(terms[i]).title() for i in top_idx)
        except Exception:
            label = "General News"

        conn.execute("""
            INSERT INTO clusters (id, label, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET label=excluded.label, updated_at=excluded.updated_at
        """, (cid, label, now, now))

        for aid in article_ids:
            conn.execute("UPDATE articles SET cluster_id = ? WHERE id = ?", (cid, aid))

    conn.commit()
    print(f"Grouped data into {len(cluster_map)} intelligent topic clusters.", flush=True)

if __name__ == "__main__":
    print("--- Starting News Pulse Pipeline ---", flush=True)
    conn = get_db()
    init_db(conn)

    # Ingest news feeds
    ingest_feeds(conn)

    # Refresh structural groups
    all_articles = build_corpus(conn)
    print(f"\nRunning clustering algorithms on {len(all_articles)} total articles...", flush=True)

    cluster_map, tfidf_matrix, vectorizer, all_ids = cluster_articles(all_articles)
    if cluster_map:
        save_clusters(conn, cluster_map, tfidf_matrix, vectorizer, all_ids)

    print(f"--- Pipeline Run Complete ---", flush=True)
    conn.close()