let isRunning = false;
let isProcessing = false;
let lastQuestionSignature = "";
let observer = null;
let debounceTimer = null;

const QUESTION_SELECTORS = [
  "[data-testid*='question']",
  "[class*='question']",
  "[class*='Question']",
  "[id*='question']",
  "h1",
  "h2",
  "h3",
  ".problem-statement",
  ".question-text",
  "article p",
];

const OPTION_SELECTORS = [
  "button[class*='option']",
  "button[class*='answer']",
  "button[class*='choice']",
  "[role='radio']",
  "[role='option']",
  "label[class*='option']",
  "label[class*='answer']",
  ".answer-option",
  ".mcq-option",
  "input[type='radio'] + label",
  "li button",
  "button",
];

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getVisibleText(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  clone.querySelectorAll("script, style, svg, img").forEach((el) => el.remove());
  return normalizeText(clone.innerText || clone.textContent || "");
}

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function extractQuestion() {
  for (const selector of QUESTION_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!isVisible(el)) continue;
      const text = getVisibleText(el);
      if (text.length >= 20) return text;
    }
  }

  const main = document.querySelector("main, article, [role='main']");
  if (main) {
    const text = getVisibleText(main);
    if (text.length >= 20) return text.slice(0, 1200);
  }

  return "";
}

function extractOptions() {
  const seen = new Set();
  const options = [];

  for (const selector of OPTION_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!isVisible(el)) continue;

      let text = getVisibleText(el);
      if (!text || text.length < 1 || text.length > 500) continue;

      const key = text.toLowerCase();
      if (seen.has(key)) continue;

      const lower = text.toLowerCase();
      if (
        lower === "start" ||
        lower === "stop" ||
        lower === "submit" ||
        lower === "next" ||
        lower === "skip" ||
        lower === "hint"
      ) {
        continue;
      }

      seen.add(key);
      options.push({ text, element: el });
    }

    if (options.length >= 2 && options.length <= 8) break;
  }

  return options.slice(0, 8);
}

function questionSignature(question, options) {
  return `${question}::${options.map((o) => o.text).join("|")}`;
}

function findClickTarget(optionText, options) {
  const normalized = normalizeText(optionText).toLowerCase();
  const match = options.find(
    (opt) => normalizeText(opt.text).toLowerCase() === normalized
  );
  if (match) return match.element;

  const partial = options.find((opt) => {
    const optText = normalizeText(opt.text).toLowerCase();
    return optText.includes(normalized) || normalized.includes(optText);
  });
  return partial ? partial.element : null;
}

async function solveCurrentQuestion() {
  if (!isRunning || isProcessing) return;

  const question = extractQuestion();
  const options = extractOptions();

  if (!question || options.length < 2) return;

  const signature = questionSignature(question, options);
  if (signature === lastQuestionSignature) return;

  isProcessing = true;
  lastQuestionSignature = signature;

  const timestamp = new Date().toISOString();
  const optionTexts = options.map((o) => o.text);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SOLVE_QUESTION",
      payload: {
        question,
        options: optionTexts,
        url: window.location.href,
      },
    });

    if (!response || response.skipped || response.error) {
      lastQuestionSignature = "";
      return;
    }

    const target = findClickTarget(response.answer, options);
    let clickSuccess = false;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(300);
      target.click();
      clickSuccess = true;
    }

    await chrome.runtime.sendMessage({
      type: "LOG_CLICK",
      payload: {
        timestamp,
        clicked: response.answer,
        clickSuccess,
      },
    });
  } catch (error) {
    console.error("[Coding Automator]", error);
    lastQuestionSignature = "";
  } finally {
    isProcessing = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleScan() {
  if (!isRunning) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    solveCurrentQuestion();
  }, 800);
}

function startObserver() {
  if (observer) return;

  observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleScan();
}

function stopObserver() {
  clearTimeout(debounceTimer);
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isProcessing = false;
  lastQuestionSignature = "";
}

function setRunning(enabled) {
  isRunning = enabled;
  if (enabled) {
    startObserver();
  } else {
    stopObserver();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "AUTOMATION_CONTROL") {
    setRunning(Boolean(message.enabled));
    sendResponse({ enabled: isRunning });
    return false;
  }

  if (message.type === "GET_RUNNING") {
    sendResponse({ enabled: isRunning });
    return false;
  }

  return false;
});

chrome.storage.local.get(["automationEnabled"], (result) => {
  if (result.automationEnabled) {
    setRunning(true);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.automationEnabled) {
    setRunning(Boolean(changes.automationEnabled.newValue));
  }
});
