# Advanced Research Tool

## Description

Advanced Research Tool is a local-first, static web client for orchestrating a multi-phase, LLM-powered research workflow entirely from your browser. It integrates with the OpenRouter Chat Completions API (no backend required) to transform an input topic into a decision-ready research report through structured stages: topic analysis, perspective generation, deep dives, and synthesis. The tool is designed for researchers, analysts, and developers who need reproducible, transparent, and configurable AI-assisted research without surrendering their API keys or data to a remote server.

---

## Features

- **Local-only, single-page client**
  - Runs as static HTML/JS/CSS; no server or build step required.
  - Your OpenRouter API key is used only in your browser; optional local persistence via `localStorage`.

- **Multi-phase research pipeline**
  1. **Topic Analysis** – Complexity, subtopics, methodologies, gaps.
  2. **Perspective Generation** – Multiple distinct, non-overlapping research angles.
  3. **Deep Research** – Per-perspective overviews, critical appraisals, gap analyses, and syntheses.
  4. **Global Synthesis** – Integrated, structured report with recommendations and limitations.

- **Configurable models and depth**
  - Supports any OpenRouter-compatible model (predefined list + custom).
  - Adjustable research depth and number of perspectives.

- **Robust UX and observability**
  - Progress bar and phase labels for each stage.
  - Live research log with execution trace and surfaced errors.
  - Inline display of partial results and detailed breakdowns.

- **Export and reporting**
  - Export visible results as `.txt`.
  - Generate a print-optimized report suitable for “Save as PDF”.

- **Personalized settings**
  - Default API key (optional), default model, iterations, and constraints.
  - Appearance options: dark mode, compact layout, reduced motion.
  - All settings stored under a single, namespaced key in `localStorage`.

- **Accessibility-conscious UI**
  - Keyboard-accessible controls, focus trapping in settings.
  - ARIA attributes and live regions for assistive technologies.

---

## Tech Stack

All dependencies are client-side and framework-free.

- **HTML5**
  - Semantic structure, ARIA attributes, dialog and layout scaffolding.
- **CSS3**
  - Modern layout (CSS Grid/Flexbox), theming via CSS variables.
  - Light/dark theme, density and motion controls.
- **Vanilla JavaScript (ES6+)**
  - Application logic and state management.
  - Multi-phase research orchestrator (`AdvancedResearcher`).
  - DOM interactions, form validation, settings, exports.
- **OpenRouter Chat Completions API**
  - External LLM access (Anthropic, OpenAI, Google, Cohere, Mistral, xAI, and custom).

No build tools, bundlers, or external JS frameworks are required.

---

## File Structure

```text
.
├─ researchToolBuilder.html      # Main HTML entry: layout, panels, and app shell
└─ assets/
   ├─ styles.css                 # Complete styling, theming, layout, and components
   └─ app.js                     # Core logic, workflow engine, UI bindings, exports, settings
```

### Key Components

- **`researchToolBuilder.html`**
  - **Header**: Branding, “Docs & Flow”, theme toggle, Settings.
  - **Step Panel (left)**: Main configuration form:
    - API key
    - Model selection (incl. custom)
    - Topic/question
    - Depth and perspective coverage
    - Optional constraints
  - **Results Card (center)**:
    - Topic Analysis, Perspectives, Deep Findings, Synthesis, Research Log.
    - Export dropdown (TXT / PDF).
  - **Side Panel (right)**:
    - Workflow overview and usage hints.
  - **Settings Drawer**:
    - Defaults (API key, model, iterations, constraints).
    - Appearance (dark theme, compact layout, reduced motion).
    - Stored locally via `localStorage`.

- **`assets/app.js`**
  - **`CONFIG`**: Centralized configuration (API URL, timeouts, defaults, settings key).
  - **Utility functions**:
    - Text sanitization, HTML escaping, truncation, timeouts, theme/density/motion handlers.
  - **`SettingsManager`**:
    - Load/save/reset user preferences in `localStorage`.
  - **`AdvancedResearcher` class**:
    - Encapsulates the research workflow:
      - `callOpenRouter` – Typed, logged API calls with timeout and errors.
      - `analyzeTopic` – Phase 1.
      - `gatherPerspectives` / `parsePerspectives` – Phase 2.
      - `deepResearch` / `researchSinglePerspective` – Phase 3.
      - `synthesizeFindings` – Phase 4.
      - `conductResearch` – Orchestrates all phases with UI hooks.
      - `cancel` – Marks a run inactive.
  - **DOM integration**:
    - Form handling, validation, progress, messages, results rendering.
    - Settings drawer interactions and focus trap.
    - Theme quick toggle, layout updates.
    - Export (TXT and PDF/print) utilities.

- **`assets/styles.css`**
  - Tokenized design (CSS variables for colors, typography, spacing).
  - Themed backgrounds and card styles.
  - Responsive grid layout for three-column/stacked views.
  - Styled inputs, buttons, cards, logs, export menu, and settings drawer.
  - Dark theme overrides and reduced motion support.

---

## Getting Started

### 1. Prerequisites

- A modern web browser (Chrome, Edge, Firefox, Safari).
- An **OpenRouter API key**:
  - Sign up / manage keys at: https://openrouter.ai/

No Node.js, npm, or backend environment is required.

### 2. Download or Clone

```bash
# Clone this repository
git clone https://github.com/your-org/advanced-research-tool.git
cd advanced-research-tool
```

Or download the files and place them in a directory preserving the structure:

```text
your-folder/
  researchToolBuilder.html
  assets/
    app.js
    styles.css
```

### 3. Run Locally

You can open the HTML file directly, or serve it via a simple static server.

#### Option A: Open directly

1. Double-click `researchToolBuilder.html`, or
2. Open it in your browser via `File → Open`.

This is sufficient for typical usage.

#### Option B: Serve via a local HTTP server (recommended)

Some environments handle CORS/headers more predictably over HTTP.

Using Python:

```bash
python -m http.server 8000
```

Then navigate to:

```text
http://localhost:8000/researchToolBuilder.html
```

Or using `npx serve`:

```bash
npx serve .
```

### 4. Configure OpenRouter

Ensure your OpenRouter account is active and your API key has access to the models you plan to use.

---

## Usage

This section covers how to use the tool in the browser and how the workflow is structured internally for developers.

### 1. Basic Workflow (UI)

1. **Open the tool**
   - Navigate to `researchToolBuilder.html` in your browser.

2. **Provide your API key**
   - In “Step 1: Configure your run”, enter your **OpenRouter API Key**.
   - Optional: Click **Settings** to store it locally on a trusted machine.

3. **Choose an LLM model**
   - Select from the dropdown (e.g. `anthropic/claude-3.5-sonnet`, `openai/gpt-4.1`).
   - To use a custom model:
     - Choose “Custom Model (enter below)”.
     - Provide its ID, e.g. `your-provider/your-model`.
   - You can set a persistent default in **Settings → Default model**.

4. **Define your research topic**
   - In “Research Topic / Question”, describe:
     - Context, scope, goals
     - Constraints (domain, timeframe)
     - Required outputs (what a good answer must include)
   - Must be at least `10` characters; max `4000`.

5. **Tune depth and coverage**
   - **Research depth**:
     - Normal: faster, concise.
     - Advanced: deeper analysis.
     - Extreme: maximum detail and reasoning.
   - **Perspective coverage**:
     - 3, 5, or 7 perspectives (configurable, validated 1–8).

6. **Optional: Constraints & add-ons**
   - Add:
     - Required citation style.
     - Bias-mitigation instructions.
     - Mandatory frameworks/domains.
     - Output formatting rules.
   - These are threaded into the deep-research prompts.

7. **Run the workflow**
   - Click **Run Advanced Research**.
   - During execution:
     - Inputs lock (only critical fields).
     - Progress bar and phase label update (Phase 1–4).
     - Live log shows each API call and any errors.

8. **Review results**
   - **Topic Analysis**: Structured analysis of your topic.
   - **Research Perspectives**: Numbered list of distinct angles.
   - **Deep Research Findings**:
     - Per-perspective summaries.
     - Expand “View detailed breakdown” for full details.
   - **Synthesis & Conclusions**:
     - Integrated final report.
   - **Research Log**:
     - Full trace of steps, timings, and API error messages.

9. **Export**
   - Use **Export → Download as .txt** to get a plaintext bundle.
   - Use **Export → Download as .pdf**:
     - Opens a print-optimized view.
     - Use browser “Save as PDF”.

10. **Adjust settings**
    - Click **Settings**:
      - Store default API key and model.
      - Set default iterations/constraints.
      - Toggle dark theme, compact layout, reduced motion.
      - Changes persist in `localStorage`.

---

### 2. Developer Usage (Code Examples)

If you want to integrate or extend the workflow, the core abstraction is the `AdvancedResearcher` class in `assets/app.js`.

#### Instantiating `AdvancedResearcher`

```js
const researcher = new AdvancedResearcher(
  '<OPENROUTER_API_KEY>',
  'anthropic/claude-3.5-sonnet',  // or any valid OpenRouter model ID
  'Use formal academic tone; include concrete citations where possible.',
  {
    onLog: (entry) => console.log(entry),
    onProgressText: (text) => console.log('Progress:', text),
    onPhaseLabel: (label) => console.log('Phase:', label),
    onPhaseProgress: (idx, total) => console.log(`Phase ${idx}/${total}`)
  }
);
```

#### Running the full research pipeline

```js
(async () => {
  const topic = 'Long-context LLM architectures for real-time financial risk monitoring';
  const depth = 'extreme'; // 'normal' | 'advanced' | 'extreme'
  const iterations = 5;    // number of perspectives to target

  const result = await researcher.conductResearch(topic, depth, iterations);

  console.log('Topic analysis:', result.topic_analysis);
  console.log('Perspectives:', result.perspectives);
  console.log('Deep research:', result.deep_research);
  console.log('Global synthesis:', result.synthesis);
  console.log('Execution log:', result.research_log);
})();
```

#### Using individual phases (advanced customization)

Each phase is exposed as a method:

```js
// Phase 1: Topic analysis
const topicAnalysis = await researcher.analyzeTopic(topic);

// Phase 2: Perspectives
const perspectives = await researcher.gatherPerspectives(topic, topicAnalysis, 5);

// Phase 3: Deep research
const deep = await researcher.deepResearch(perspectives, 'advanced', 5);

// Phase 4: Global synthesis
const synthesis = await researcher.synthesizeFindings(deep, topic);
```

You can:
- Replace the UI hooks with your own callbacks.
- Pipe results into a different UI or storage layer.
- Swap in alternative prompt templates while reusing the orchestration and error handling.

---

### 3. Security and Privacy Notes

- API keys are:
  - Read from the form and/or settings.
  - Used only in client-side requests to OpenRouter.
  - Persisted locally **only** if you opt-in via Settings.
- No data is sent to any server other than OpenRouter.
- Settings are stored under `advancedResearchTool.settings.v1` in `localStorage`.

---
