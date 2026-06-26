const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const viewBtn = document.getElementById("view-btn");
const statusEl = document.getElementById("status");

function setUi(enabled) {
  statusEl.textContent = enabled ? "Running" : "Stopped";
  statusEl.className = `status ${enabled ? "running" : "stopped"}`;
  startBtn.disabled = enabled;
  stopBtn.disabled = !enabled;
}

async function setAutomation(enabled) {
  await chrome.storage.local.set({ automationEnabled: enabled });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "AUTOMATION_CONTROL",
        enabled,
      });
    } catch {
      // Content script may not be injected on this tab yet.
    }
  }

  await chrome.runtime.sendMessage({
    type: "SET_ENABLED",
    enabled,
  });

  setUi(enabled);
}

async function refreshStatus() {
  const result = await chrome.storage.local.get(["automationEnabled"]);
  setUi(Boolean(result.automationEnabled));
}

startBtn.addEventListener("click", () => setAutomation(true));
stopBtn.addEventListener("click", () => setAutomation(false));

viewBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("log.html") });
});

refreshStatus();
