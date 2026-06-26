const AI_SERVER_URL = "http://localhost:5000/answer";
const OLLAMA_URL = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "qwen2.5:3b";
const LOG_KEY = "activityLog";
const MAX_LOG_ENTRIES = 500;

let isEnabled = false;

chrome.storage.local.get(["automationEnabled"], (result) => {
  isEnabled = Boolean(result.automationEnabled);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.automationEnabled) {
    isEnabled = Boolean(changes.automationEnabled.newValue);
  }
});

function buildPrompt(question, options) {
  const optionList = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
  return (
    "You are answering a coding practice question.\n" +
    `Question: ${question}\n` +
    `Options:\n${optionList}\n` +
    "Reply with ONLY the exact text of the correct answer option. No explanation."
  );
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function pickBestOption(aiResponse, options) {
  const cleaned = aiResponse.trim();
  const exact = options.find((opt) => opt === cleaned);
  if (exact) return exact;

  const normalizedResponse = normalizeText(cleaned);
  const normalizedMatch = options.find(
    (opt) => normalizeText(opt) === normalizedResponse
  );
  if (normalizedMatch) return normalizedMatch;

  const containsMatch = options.find(
    (opt) =>
      normalizedResponse.includes(normalizeText(opt)) ||
      normalizeText(opt).includes(normalizedResponse)
  );
  if (containsMatch) return containsMatch;

  const numbered = cleaned.match(/^(\d+)[.)]/);
  if (numbered) {
    const index = parseInt(numbered[1], 10) - 1;
    if (index >= 0 && index < options.length) return options[index];
  }

  return options[0] || cleaned;
}

async function askFlaskServer(question, options) {
  const response = await fetch(AI_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, options }),
  });

  if (!response.ok) {
    throw new Error(`AI server error: ${response.status}`);
  }

  const data = await response.json();
  return data.answer || data.response || "";
}

async function askOllamaDirect(question, options) {
  const prompt = buildPrompt(question, options);
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.response || "";
}

async function getAiAnswer(question, options) {
  try {
    const flaskAnswer = await askFlaskServer(question, options);
    if (flaskAnswer) return flaskAnswer;
  } catch {
    // Fall back to direct Ollama if Flask server is not running.
  }

  return askOllamaDirect(question, options);
}

async function appendLog(entry) {
  const result = await chrome.storage.local.get([LOG_KEY]);
  const log = result[LOG_KEY] || [];
  log.unshift(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log.length = MAX_LOG_ENTRIES;
  }
  await chrome.storage.local.set({ [LOG_KEY]: log });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATUS") {
    sendResponse({ enabled: isEnabled });
    return false;
  }

  if (message.type === "SET_ENABLED") {
    isEnabled = Boolean(message.enabled);
    chrome.storage.local.set({ automationEnabled: isEnabled });
    sendResponse({ enabled: isEnabled });
    return false;
  }

  if (message.type === "GET_LOG") {
    chrome.storage.local.get([LOG_KEY], (result) => {
      sendResponse({ log: result[LOG_KEY] || [] });
    });
    return true;
  }

  if (message.type === "CLEAR_LOG") {
    chrome.storage.local.set({ [LOG_KEY]: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "SOLVE_QUESTION") {
    if (!isEnabled) {
      sendResponse({ skipped: true, reason: "Automation is stopped." });
      return false;
    }

    const { question, options, url } = message.payload;
    const timestamp = new Date().toISOString();

    getAiAnswer(question, options)
      .then((rawAnswer) => {
        const answer = pickBestOption(rawAnswer, options);
        return appendLog({
          timestamp,
          url: url || sender.tab?.url || "",
          question,
          options,
          aiRaw: rawAnswer,
          answer,
          status: "answered",
        }).then(() => ({ answer, aiRaw: rawAnswer }));
      })
      .then((result) => sendResponse(result))
      .catch(async (error) => {
        await appendLog({
          timestamp,
          url: url || sender.tab?.url || "",
          question,
          options,
          answer: null,
          status: "error",
          error: error.message,
        });
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (message.type === "LOG_CLICK") {
    const entry = message.payload;
    chrome.storage.local.get([LOG_KEY], (result) => {
      const log = result[LOG_KEY] || [];
      if (log.length > 0 && log[0].timestamp === entry.timestamp) {
        log[0].clicked = entry.clicked;
        log[0].clickSuccess = entry.clickSuccess;
      } else {
        log.unshift(entry);
      }
      chrome.storage.local.set({ [LOG_KEY]: log });
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
