(() => {
  "use strict";

  const TWEET_APIS = [
    "https://api.fxtwitter.com",
    "https://api.vxtwitter.com",
  ];
  const STORAGE_KEY_VAULT = "memo-clipper-vault";
  const STORAGE_KEY_FOLDER = "memo-clipper-folder";

  const $ = (sel) => document.querySelector(sel);
  const urlInput = $("#url-input");
  const pasteBtn = $("#paste-btn");
  const fetchBtn = $("#fetch-btn");
  const previewSection = $("#preview-section");
  const preview = $("#preview");
  const markdownOutput = $("#markdown-output");
  const saveBtn = $("#save-btn");
  const copyBtn = $("#copy-btn");
  const errorSection = $("#error-section");
  const errorMessage = $("#error-message");
  const loadingSection = $("#loading-section");
  const vaultInput = $("#vault-input");
  const folderInput = $("#folder-input");

  let currentData = null;

  // Load saved settings
  vaultInput.value = localStorage.getItem(STORAGE_KEY_VAULT) || "";
  folderInput.value = localStorage.getItem(STORAGE_KEY_FOLDER) || "Clippings/X";

  // Save settings on change
  vaultInput.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEY_VAULT, vaultInput.value);
  });
  folderInput.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEY_FOLDER, folderInput.value);
  });

  // Handle shared URL via Web Share Target API
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get("url") || params.get("text") || "";
  if (sharedUrl) {
    const extracted = extractXUrl(sharedUrl);
    if (extracted) {
      urlInput.value = extracted;
      // Clean URL without reloading
      history.replaceState(null, "", window.location.pathname);
      // Auto-fetch
      setTimeout(() => fetchTweet(), 100);
    }
  }

  // Validate URL on input
  urlInput.addEventListener("input", () => {
    fetchBtn.disabled = !isValidXUrl(urlInput.value.trim());
    hideError();
  });

  // Paste button
  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text;
      urlInput.dispatchEvent(new Event("input"));
    } catch {
      // Fallback: focus input for manual paste
      urlInput.focus();
    }
  });

  // Fetch button
  fetchBtn.addEventListener("click", () => fetchTweet());

  // Enter key to fetch
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !fetchBtn.disabled) {
      fetchTweet();
    }
  });

  // Save to Obsidian
  saveBtn.addEventListener("click", () => saveToObsidian());

  // Copy markdown
  copyBtn.addEventListener("click", () => copyMarkdown());

  function extractXUrl(text) {
    const match = text.match(
      /https?:\/\/(?:twitter\.com|x\.com|mobile\.twitter\.com)\/\w+\/status\/\d+/
    );
    return match ? match[0] : null;
  }

  function isValidXUrl(url) {
    return /^https?:\/\/(?:twitter\.com|x\.com|mobile\.twitter\.com)\/\w+\/status\/\d+/.test(
      url
    );
  }

  function parseTweetId(url) {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function parseScreenName(url) {
    const match = url.match(
      /(?:twitter\.com|x\.com|mobile\.twitter\.com)\/(\w+)\/status/
    );
    return match ? match[1] : null;
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorSection.classList.remove("hidden");
  }

  function hideError() {
    errorSection.classList.add("hidden");
  }

  function showLoading() {
    loadingSection.classList.remove("hidden");
    previewSection.classList.add("hidden");
    hideError();
  }

  function hideLoading() {
    loadingSection.classList.add("hidden");
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  async function fetchTweet() {
    const url = urlInput.value.trim();
    if (!isValidXUrl(url)) return;

    const screenName = parseScreenName(url);
    const tweetId = parseTweetId(url);
    if (!screenName || !tweetId) {
      showError("URLを解析できませんでした");
      return;
    }

    showLoading();

    try {
      currentData = await fetchFromFxTwitter(screenName, tweetId, url)
                 || await fetchFromSyndication(tweetId, url);

      if (!currentData || !currentData.text) {
        throw new Error("ツイートのテキストを取得できませんでした");
      }

      renderPreview();
      hideLoading();
      previewSection.classList.remove("hidden");
    } catch (err) {
      hideLoading();
      showError(`取得に失敗しました: ${err.message}`);
    }
  }

  async function fetchFromFxTwitter(screenName, tweetId, originalUrl) {
    for (const api of TWEET_APIS) {
      try {
        const resp = await fetch(`${api}/${screenName}/status/${tweetId}`);
        if (!resp.ok) continue;

        const data = await resp.json();
        console.log(`API response (${api}):`, JSON.stringify(data, null, 2));

        const tweet = data.tweet || data.data || data;
        if (!tweet) continue;

        // Find text from multiple possible fields
        let tweetText = "";
        for (const field of ["raw_text", "full_text", "text", "content"]) {
          const val = tweet[field];
          if (val && typeof val === "string" && val.trim()) {
            tweetText = val;
            break;
          }
        }

        // Note tweets: check article field
        if (!tweetText && tweet.article) {
          const a = tweet.article;
          if (typeof a === "string") {
            tweetText = a;
          } else if (a && typeof a === "object") {
            // article might have nested text fields
            for (const f of ["text", "content", "body", "raw_text"]) {
              if (a[f] && typeof a[f] === "string" && a[f].trim()) {
                tweetText = a[f];
                break;
              }
            }
            // article might itself contain HTML or markdown content
            if (!tweetText && a.html) {
              tweetText = a.html.replace(/<[^>]+>/g, "").trim();
            }
          }
        }

        // Deep search: recursively find any string field with substantial text
        if (!tweetText) {
          tweetText = findLongestString(tweet, 3) || "";
        }

        // Ensure tweetText is always a string
        if (typeof tweetText !== "string") {
          tweetText = JSON.stringify(tweetText);
        }

        if (!tweetText) continue;

        return {
          text: tweetText,
          author: tweet.author?.name || tweet.user?.name || screenName,
          handle: tweet.author?.screen_name || tweet.user?.screen_name || screenName,
          date: tweet.created_at || tweet.date || "",
          likes: tweet.likes ?? tweet.favorite_count ?? 0,
          retweets: tweet.retweets ?? tweet.retweet_count ?? 0,
          url: tweet.url || originalUrl,
          media: tweet.media?.all || tweet.media?.photos || tweet.media || [],
        };
      } catch (e) {
        console.warn(`${api} failed:`, e.message);
      }
    }
    return null;
  }

  async function fetchFromSyndication(tweetId, originalUrl) {
    try {
      const resp = await fetch(
        `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`
      );
      if (!resp.ok) return null;

      const data = await resp.json();
      console.log("Syndication API response:", JSON.stringify(data, null, 2));

      let tweetText = "";
      for (const f of ["text", "full_text", "raw_text"]) {
        if (data[f] && typeof data[f] === "string" && data[f].trim()) {
          tweetText = data[f];
          break;
        }
      }
      if (!tweetText) return null;

      return {
        text: tweetText,
        author: data.user?.name || "",
        handle: data.user?.screen_name || "",
        date: data.created_at || "",
        likes: data.favorite_count ?? 0,
        retweets: data.retweet_count ?? 0,
        url: originalUrl,
        media: data.mediaDetails || data.photos || [],
      };
    } catch (e) {
      console.warn("Syndication API failed:", e.message);
      return null;
    }
  }

  function findLongestString(obj, maxDepth) {
    if (maxDepth <= 0 || !obj || typeof obj !== "object") return "";
    if (Array.isArray(obj)) return "";
    let longest = "";
    const skip = new Set(["url", "id", "lang", "source", "color", "provider", "media"]);
    for (const [key, val] of Object.entries(obj)) {
      if (skip.has(key)) continue;
      if (typeof val === "string" && val.length > longest.length && val.length > 20) {
        longest = val;
      } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        const nested = findLongestString(val, maxDepth - 1);
        if (typeof nested === "string" && nested.length > longest.length) {
          longest = nested;
        }
      }
    }
    return longest;
  }

  function renderPreview() {
    if (!currentData) return;

    preview.innerHTML = `
      <div class="author">${escapeHtml(currentData.author)}</div>
      <div class="handle">@${escapeHtml(currentData.handle)}</div>
      <div class="text">${escapeHtml(currentData.text)}</div>
      <div class="meta">
        <span>❤️ ${currentData.likes}</span>
        <span>🔁 ${currentData.retweets}</span>
        <span>${formatDate(currentData.date)}</span>
      </div>
    `;

    markdownOutput.value = generateMarkdown();
  }

  function generateMarkdown() {
    if (!currentData) return "";

    const d = currentData;
    const date = formatDate(d.date);
    const isoDate = d.date ? new Date(d.date).toISOString().split("T")[0] : "";

    let md = `---
source: x
author: "${d.author}"
handle: "@${d.handle}"
url: "${d.url}"
date: ${isoDate}
clipped: ${new Date().toISOString().split("T")[0]}
tags:
  - clipping/x
---

# ${d.author} (@${d.handle})

${d.text}

---

> [!info] メタ情報
> - 投稿日: ${date}
> - ❤️ ${d.likes} | 🔁 ${d.retweets}
> - [元の投稿を見る](${d.url})
`;

    if (d.media && d.media.length > 0) {
      md += "\n## メディア\n\n";
      for (const m of d.media) {
        if (m.type === "photo") {
          md += `![image](${m.url})\n\n`;
        } else if (m.type === "video" || m.type === "gif") {
          const thumb = m.thumbnail_url || "";
          md += `[![video](${thumb})](${d.url})\n\n`;
        }
      }
    }

    return md;
  }

  function saveToObsidian() {
    if (!currentData) return;

    const vault = vaultInput.value.trim();
    const folder = folderInput.value.trim();
    const md = markdownOutput.value;

    const fileName = `${currentData.handle} - ${sanitizeFileName(currentData.text.slice(0, 50))}`;
    const fullPath = folder ? `${folder}/${fileName}` : fileName;

    const params = new URLSearchParams();
    if (vault) params.set("vault", vault);
    params.set("file", fullPath);
    params.set("content", md);
    params.set("overwrite", "true");

    const uri = `obsidian://new?${params.toString()}`;
    window.location.href = uri;

    toast("Obsidian を開いています...");
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdownOutput.value);
      toast("コピーしました");
    } catch {
      // Fallback
      markdownOutput.select();
      document.execCommand("copy");
      toast("コピーしました");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeFileName(str) {
    return str
      .replace(/[\\/:*?"<>|#\[\]]/g, "")
      .replace(/\n/g, " ")
      .trim();
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  // Register Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
