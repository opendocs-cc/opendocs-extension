// Demo chat pages for the store screenshots: neutral content in the style of
// each chat app (no logos), with the page structure the extension reads, so
// the real extension can run on them. Writes store/studio/out/*.html.
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Icons from "@phosphor-icons/react";

const icon = (name, size = 18, weight = "regular") => renderToStaticMarkup(createElement(Icons[`${name}Icon`], { size, weight }));
const out = new URL("./out/", import.meta.url);
mkdirSync(out, { recursive: true });

const page = (title, css, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>
*{box-sizing:border-box} body{margin:0;-webkit-font-smoothing:antialiased} button{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
${css}</style></head><body>${body}</body></html>`;

// ---- ChatGPT style (its September 2026 layout) ---------------------------
const gptRow = `<div class="turn-action-controls">${["Copy", "ThumbsUp", "ThumbsDown", "SpeakerHigh", "Export", "ArrowsClockwise", "DotsThree"]
  .map((n, i) => `<span><button aria-label="${["Copy", "Good response", "Bad response", "Read aloud", "Share", "Try again", "More actions"][i]}">${icon(n, 18)}</button></span>`)
  .join("")}</div>`;
writeFileSync(
  new URL("chatgpt.html", out),
  page(
    "Pilot pricing for a 40-seat studio | ChatGPT",
    `body{background:#212121;color:#ececec;font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;height:100vh;overflow:hidden;display:grid;grid-template-columns:56px 1fr}
.rail{background:#171717;display:flex;flex-direction:column;align-items:center;gap:22px;padding-top:18px;color:#b4b4b4}.rail .me{margin-top:auto;margin-bottom:18px;width:30px;height:30px;border-radius:50%;background:#3a6ea5;color:#fff;font-size:12px;display:grid;place-items:center}
.main{position:relative;overflow:hidden}.top{display:flex;justify-content:flex-end;gap:20px;padding:14px 22px;color:#ddd;font-size:15px}.top span{display:inline-flex;gap:6px;align-items:center}
.thread{width:740px;margin:0 auto;padding-bottom:160px}.bubble{margin-left:auto;width:fit-content;max-width:72%;background:#303030;border-radius:22px;padding:10px 18px;margin-bottom:26px}
h2{font-size:22px;margin:4px 0 10px}p{margin:0 0 14px}ul{margin:0 0 14px;padding-left:22px}li{margin:4px 0}table{border-collapse:collapse;width:100%;margin:6px 0 16px;font-size:15px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #3a3a3a}th{color:#c9c9c9;font-weight:600}
.turn-action-controls{display:flex;gap:2px;align-items:center;color:#b4b4b4;margin:-4px 0 0 -6px}.turn-action-controls button{width:32px;height:32px;border-radius:8px}.turn-action-controls button:hover{background:#2f2f2f}
.composer{position:absolute;left:50%;transform:translateX(-50%);bottom:34px;width:760px;background:#303030;border-radius:28px;padding:14px 18px;display:flex;align-items:center;gap:14px;color:#9b9b9b}.composer .grow{flex:1}.composer .go{width:36px;height:36px;border-radius:50%;background:#ececec;color:#111;display:grid;place-items:center}
.fine{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:12px;color:#9b9b9b}`,
    `<nav class="rail">${icon("NotePencil", 22)}${icon("MagnifyingGlass", 22)}${icon("ClockCounterClockwise", 22)}${icon("SquaresFour", 22)}<div class="me">HS</div></nav>
<div class="main"><div class="top"><span>${icon("DotsThree", 20)}</span><span>${icon("Export", 18)} Share</span></div>
<div class="thread" data-chatgpt-conversation-selection-target="true">
  <div data-turn-id-container><div data-turn-key="t1"><div data-chatgpt-search-message-ids="msg-q1"><div class="bg-user-message bubble">We're pricing a pilot for a 40-person design studio. What should we charge?</div></div></div></div>
  <div data-turn-id-container><div data-turn-key="t2"><div data-chatgpt-search-message-ids="msg-a1"><div class="markdown">
    <h2>Pilot pricing for a 40-seat studio</h2>
    <p>Start small, prove value in six weeks, then convert at a lower annual rate.</p>
    <table><thead><tr><th>Option</th><th>Seats</th><th>Price</th><th>Per month</th></tr></thead><tbody>
      <tr><td>Starter pilot</td><td>10</td><td>$18 per seat</td><td>$180</td></tr>
      <tr><td>Team pilot</td><td>40</td><td>$15 per seat</td><td>$600</td></tr>
      <tr><td>Annual rollout</td><td>40</td><td>$12 per seat</td><td>$480</td></tr></tbody></table>
    <ul><li><strong>Recommend the team pilot.</strong> Everyone uses it, so you learn what sticks.</li><li>Credit the pilot fee toward the first year if they sign within 30 days.</li></ul>
  </div></div>${gptRow}</div></div>
</div>
<div class="composer">${icon("Plus", 20)}<span class="grow">Ask anything</span>${icon("Microphone", 20)}<span class="go">${icon("Waveform", 18)}</span></div>
<div class="fine">ChatGPT can make mistakes. Check important info.</div></div>`,
  ),
);

// ---- Claude style -------------------------------------------------------
const claudeRow = `<div role="group" aria-label="Message actions" class="actions">${["Copy", "SpeakerHigh", "ThumbsUp", "ThumbsDown", "ArrowsClockwise"]
  .map((n, i) => `<span><button aria-label="${["Copy", "Read aloud", "Give positive feedback", "Give negative feedback", "Retry"][i]}">${icon(n, 16)}</button></span>`)
  .join("")}</div>`;
writeFileSync(
  new URL("claude.html", out),
  page(
    "Mutual NDA for the Halvard pilot - Claude",
    `body{background:#262624;color:#f5f4ef;font:16.5px/1.7 ui-serif,Georgia,"Times New Roman",serif;height:100vh;overflow:hidden;display:grid;grid-template-columns:260px 1fr}
.side{background:#1f1e1d;border-right:1px solid #33322f;padding:18px 14px;font:14.5px/1.4 ui-sans-serif,system-ui,sans-serif;color:#d6d4cd}.brand{font:600 22px/1 ui-serif,Georgia,serif;margin:4px 8px 22px;color:#f5f4ef}
.nav div{display:flex;gap:10px;align-items:center;padding:8px;border-radius:8px}.recents{margin-top:22px;color:#8f8d86;font-size:12.5px;padding:0 8px 6px}.recent{padding:8px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.recent.on{background:#33322f;color:#f5f4ef}
.main{position:relative;overflow:hidden}.top{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;font:15px ui-sans-serif,system-ui,sans-serif;color:#e8e6df}
.thread{width:720px;margin:6px auto 0;padding-bottom:170px}.user{background:#141413;border-radius:14px;padding:12px 16px;margin:0 0 22px auto;width:fit-content;max-width:80%;font:15px/1.55 ui-sans-serif,system-ui,sans-serif}
h3{font-size:19px;margin:0 0 8px}p{margin:0 0 12px}ol{margin:0 0 12px;padding-left:22px}li{margin:3px 0}
.actions{display:flex;gap:2px;align-items:center;color:#a8a69f;margin:4px 0 26px -6px}.actions button{width:30px;height:30px;border-radius:7px}
.composer{position:absolute;left:50%;transform:translateX(-50%);bottom:30px;width:740px;background:#30302e;border:1px solid #3d3c39;border-radius:18px;padding:16px 18px 12px;font:15px ui-sans-serif,system-ui,sans-serif;color:#9a988f}
.composer .tools{display:flex;gap:14px;margin-top:16px;align-items:center}.composer .model{margin-left:auto;color:#d6d4cd}`,
    `<aside class="side"><div class="brand">Claude</div><div class="nav"><div>${icon("Plus", 16)} New chat</div><div>${icon("MagnifyingGlass", 16)} Search</div><div>${icon("Folder", 16)} Projects</div></div>
<div class="recents">Recents</div><div class="recent on">Mutual NDA for the Halvard pilot</div><div class="recent">Q3 board memo outline</div><div class="recent">Hiring plan for design leads</div><div class="recent">Vendor contract checklist</div></aside>
<div class="main"><div class="top"><span>Mutual NDA for the Halvard pilot</span><span>${icon("Export", 17)} Share</span></div><div class="thread">
  <div data-test-render-count="1"><div data-testid="user-message" class="user">Draft a one-page mutual NDA for a six-week pilot with Halvard Studio.</div></div>
  <div data-test-render-count="1"><div class="font-claude-response">
    <h3>Mutual Non-Disclosure Agreement</h3>
    <p>This Agreement is made between Kjarni ehf. and Halvard Studio to protect confidential information shared during the pilot.</p>
    <ol><li><strong>Confidential Information.</strong> Anything marked confidential, or that a reasonable person would treat as such.</li><li><strong>Use.</strong> Only to evaluate and run the pilot.</li><li><strong>Term.</strong> One year from signing.</li></ol>
    ${claudeRow}</div></div>
  <div data-test-render-count="1"><div data-testid="user-message" class="user">Make the term two years and add a governing law clause.</div></div>
  <div data-test-render-count="1"><div class="font-claude-response">
    <p>Done. Clause 3 now reads <strong>two years from signing</strong>, and a new clause 4 adds governing law:</p>
    <ol start="4"><li><strong>Governing law.</strong> Icelandic law, with disputes heard in Reykjavík District Court.</li></ol>
    ${claudeRow}</div></div>
</div>
<div class="composer">Reply to Claude…<div class="tools">${icon("Plus", 18)}${icon("Microphone", 18)}<span class="model">Opus 5.5</span></div></div></div>`,
  ),
);

// ---- Gemini style -------------------------------------------------------
const geminiRow = `<message-actions><div class="actions-container-v2">
  <button aria-label="Good response">${icon("ThumbsUp", 19)}</button><button aria-label="Bad response">${icon("ThumbsDown", 19)}</button><button aria-label="Redo">${icon("ArrowsClockwise", 19)}</button>
  <copy-button><button data-test-id="copy-button" aria-label="Copy">${icon("Copy", 19)}</button></copy-button><button aria-label="Show more options">${icon("DotsThree", 19)}</button></div></message-actions>`;
writeFileSync(
  new URL("gemini.html", out),
  page(
    "Compound interest, explained - Gemini",
    `body{background:#131314;color:#e3e3e3;font:16px/1.7 "Google Sans",ui-sans-serif,system-ui,sans-serif;height:100vh;overflow:hidden;display:grid;grid-template-columns:68px 1fr}
.rail{display:flex;flex-direction:column;align-items:center;gap:24px;padding-top:20px;color:#c4c7c5}.main{position:relative;overflow:hidden}
.thread{width:640px;margin:22px auto 0;padding-bottom:170px}.query{margin:0 0 22px auto;width:fit-content;max-width:80%;background:#333537;border-radius:20px 4px 20px 20px;padding:10px 18px}
h3{font-size:20px;font-weight:500;margin:0 0 8px}p{margin:0 0 12px}.math-block{display:block;text-align:center;font:italic 20px/1.4 "Times New Roman",serif;margin:8px 0 14px}.math-inline{font:italic 17px "Times New Roman",serif}
table{border-collapse:collapse;width:100%;margin:4px 0 14px;font-size:15px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #3c4043}th{color:#c4c7c5;font-weight:500}
.actions-container-v2{display:flex;gap:6px;align-items:center;color:#c4c7c5;margin:0 0 20px -8px}.actions-container-v2 button{width:36px;height:36px;border-radius:50%}
.composer{position:absolute;left:50%;transform:translateX(-50%);bottom:40px;width:660px;background:#1e1f20;border-radius:30px;padding:16px 22px;display:flex;gap:14px;align-items:center;color:#9aa0a6}.composer .grow{flex:1}`,
    `<nav class="rail">${icon("NotePencil", 21)}${icon("MagnifyingGlass", 21)}${icon("ClockCounterClockwise", 21)}${icon("Gear", 21)}</nav>
<div class="main"><div class="thread" data-test-id="chat-history-container"><span data-test-id="conversation-title" style="display:none">Compound interest, explained</span>
  <div class="conversation-container"><user-query><div class="query query-text"><p class="query-text-line" style="margin:0">How does compound interest work? Give the formula.</p></div></user-query>
  <model-response><message-content><div class="markdown">
    <h3>The formula</h3>
    <p>After <span class="math-inline" data-math="t">t</span> years, a principal <span class="math-inline" data-math="P">P</span> at rate <span class="math-inline" data-math="r">r</span>, compounded <span class="math-inline" data-math="n">n</span> times a year, grows to:</p>
    <div class="math-block" data-math="A = P\\left(1 + \\frac{r}{n}\\right)^{nt}">A = P (1 + r⁄n)<sup>nt</sup></div>
    <table><thead><tr><th>Year</th><th>Balance at 5%</th></tr></thead><tbody><tr><td>1</td><td>1,051</td></tr><tr><td>5</td><td>1,283</td></tr><tr><td>10</td><td>1,647</td></tr></tbody></table>
  </div></message-content>${geminiRow}</model-response></div>
</div>
<div class="composer">${icon("Plus", 20)}<span class="grow">Ask Gemini</span>${icon("Microphone", 20)}</div></div>`,
  ),
);
console.log("Wrote store/studio/out/{chatgpt,claude,gemini}.html");
