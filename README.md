# Extension for Coddy

Browser extension that reads coding practice questions, asks local AI for the answer, clicks it automatically, and logs activity.

## Architecture

| Part | File | Role |
|------|------|------|
| Content script | `content-script.js` | Reads questions/options from the page, clicks answers |
| Background worker | `background.js` | Sends questions to AI, stores activity log |
| Popup | `popup.html` / `popup.js` | Start, Stop, View buttons |
| Activity log | `log.html` / `log.js` | Shows questions, AI picks, click results |
| AI server | `ai-server/server.py` | Flask proxy to Ollama (free, local, offline) |

## Setup

### 1. Install Ollama (free)

1. Download from [ollama.ai](https://ollama.ai)
2. Install and open a terminal
3. Pull a model:

```bash
ollama pull qwen2.5:3b
```

Ollama runs automatically on port **11434**.

### 2. Start the AI server

```bash
cd ai-server
pip install -r requirements.txt
python server.py
```

Server runs at `http://localhost:5000`. The extension tries Flask first, then falls back to Ollama directly.

### 3. Load the extension in Chrome/Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `coding-extension` folder

### 4. Use it

1. Open your coding practice website
2. Click the extension icon
3. Click **Start**
4. When a new question appears, the extension reads it, asks AI, and clicks the answer
5. Click **Stop** to pause
6. Click **View** to see the activity log

## Buttons

- **Start** — enables automation on the current tab
- **Stop** — disables automation
- **View** — opens a log of questions, AI answers, click success, and timestamps

## Customization

If your site uses unusual HTML, edit the selectors in `content-script.js`:

- `QUESTION_SELECTORS` — where to find question text
- `OPTION_SELECTORS` — where to find answer buttons

Change the AI model in `background.js` (`OLLAMA_MODEL`) or in `ai-server/server.py`.

## Notes

- Works best on multiple-choice coding quiz pages
- AI accuracy depends on the model (larger models = better reasoning)
- All AI runs locally — no API keys or costs
- Use only on sites you are allowed to automate
