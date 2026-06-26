const container = document.getElementById("log-container");
const refreshBtn = document.getElementById("refresh-btn");
const clearBtn = document.getElementById("clear-btn");

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderLog(log) {
  if (!log.length) {
    container.innerHTML =
      '<p class="empty">No activity yet. Click Start on the extension popup and open a practice question.</p>';
    return;
  }

  container.innerHTML = log
    .map((entry) => {
      const isError = entry.status === "error";
      const clickBadge = entry.clickSuccess
        ? '<span class="badge success">Clicked</span>'
        : entry.clicked
          ? '<span class="badge fail">Click failed</span>'
          : isError
            ? '<span class="badge fail">Error</span>'
            : '<span class="badge pending">Answered</span>';

      const optionsHtml = (entry.options || [])
        .map((opt) => `<li>${escapeHtml(opt)}</li>`)
        .join("");

      return `
        <article class="entry ${isError ? "error" : ""}">
          <div class="meta">
            <span>${formatTime(entry.timestamp)}</span>
            ${clickBadge}
          </div>
          <p class="question">${escapeHtml(entry.question || "(no question)")}</p>
          ${optionsHtml ? `<ul class="options">${optionsHtml}</ul>` : ""}
          ${
            entry.answer
              ? `<p class="answer">AI picked: ${escapeHtml(entry.answer)}</p>`
              : ""
          }
          ${entry.error ? `<p class="error-msg">${escapeHtml(entry.error)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadLog() {
  const response = await chrome.runtime.sendMessage({ type: "GET_LOG" });
  renderLog(response?.log || []);
}

refreshBtn.addEventListener("click", loadLog);

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all log entries?")) return;
  await chrome.runtime.sendMessage({ type: "CLEAR_LOG" });
  loadLog();
});

loadLog();
