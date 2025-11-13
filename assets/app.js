/**
 * Advanced Research Tool
 * Core logic preserved; layout and export UX refined.
 */

// ---- Configuration ----
const CONFIG = {
    OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',
    DEFAULT_MAX_TOKENS: 4000,
    MAX_TOPIC_LENGTH: 4000,
    MIN_TOPIC_LENGTH: 10,
    LOG_MAX_ENTRIES: 500,
    REQUEST_TIMEOUT_MS: 180000,
    SETTINGS_KEY: 'advancedResearchTool.settings.v1',
    HEADERS_META: {
        'X-Title': 'Advanced Research Tool',
    },
    DEFAULT_SETTINGS: {
        apiKey: '',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        defaultCustomModel: '',
        defaultIterations: 5,
        defaultConstraints: '',
        theme: 'auto',
        compact: false,
        reducedMotion: false
    }
};

// ---- Utility Functions ----

function sanitizeText(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/\s+/g, ' ').trim();
}

function truncateForLog(message, maxLen = 120) {
    if (!message) return '';
    return message.length > maxLen ? message.slice(0, maxLen - 3) + '...' : message;
}

function createAbortableTimeout(ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    return { controller, timeout };
}

function safeGetFirstChoiceContent(data) {
    try {
        if (
            data &&
            Array.isArray(data.choices) &&
            data.choices[0] &&
            data.choices[0].message &&
            typeof data.choices[0].message.content === 'string'
        ) {
            return data.choices[0].message.content;
        }
    } catch (e) {
        // fallthrough
    }
    throw new Error('Malformed API response: missing choices[0].message.content');
}

function buildUserPrompt(base, extraSections) {
    const sections = [base].concat(extraSections || []);
    return sections.join('\n\n');
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setBodyTheme(theme) {
    document.body.classList.remove('theme-dark');
    if (theme === 'dark') {
        document.body.classList.add('theme-dark');
    } else if (theme === 'auto') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) document.body.classList.add('theme-dark');
    }
}

function setBodyDensity(compact) {
    document.body.classList.remove('density-compact', 'density-spacious');
    if (compact) {
        document.body.classList.add('density-compact');
    }
}

function setBodyMotion(reduced) {
    document.body.classList.toggle('reduced-motion', !!reduced);
}

function updateLiveStatus(text) {
    const region = document.getElementById('statusLiveRegion');
    if (region) {
        region.textContent = text || '';
    }
}

// ---- Settings Manager ----

const SettingsManager = {
    load() {
        try {
            const raw = localStorage.getItem(CONFIG.SETTINGS_KEY);
            if (!raw) return { ...CONFIG.DEFAULT_SETTINGS };
            const parsed = JSON.parse(raw);
            return { ...CONFIG.DEFAULT_SETTINGS, ...parsed };
        } catch {
            return { ...CONFIG.DEFAULT_SETTINGS };
        }
    },
    save(settings) {
        const toStore = { ...CONFIG.DEFAULT_SETTINGS, ...(settings || {}) };
        localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(toStore));
        return toStore;
    },
    reset() {
        localStorage.removeItem(CONFIG.SETTINGS_KEY);
        return { ...CONFIG.DEFAULT_SETTINGS };
    }
};

// ---- AdvancedResearcher Class (core logic) ----

class AdvancedResearcher {
    constructor(apiKey, modelId, constraints, uiHooks) {
        this.apiKey = apiKey;
        this.modelId = modelId;
        this.constraints = constraints || '';
        this.researchLog = [];
        this.uiHooks = uiHooks || {};
        this.active = true;
    }

    ensureActive() {
        if (!this.active) {
            throw new Error('Research run was cancelled or is no longer active.');
        }
    }

    async log(message, level = 'info') {
        this.ensureActive();
        const timestamp = new Date().toLocaleTimeString();
        const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        this.researchLog.push(entry);

        if (this.researchLog.length > CONFIG.LOG_MAX_ENTRIES) {
            this.researchLog.shift();
        }

        if (typeof this.uiHooks.onLog === 'function') {
            this.uiHooks.onLog(entry);
        }

        if (typeof this.uiHooks.onProgressText === 'function') {
            this.uiHooks.onProgressText(truncateForLog(message, 140));
        }

        console.log(entry);
    }

    async callOpenRouter(messages, {
        maxTokens = CONFIG.DEFAULT_MAX_TOKENS,
        temperature = 0.2,
        label = 'OpenRouter call'
    } = {}) {
        this.ensureActive();

        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Internal error: messages array is empty.');
        }

        const payload = {
            model: this.modelId,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false
        };

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...CONFIG.HEADERS_META
        };

        if (typeof window !== 'undefined' && window.location && window.location.href) {
            headers['HTTP-Referer'] = window.location.href;
        }

        const { controller, timeout } = createAbortableTimeout(CONFIG.REQUEST_TIMEOUT_MS);

        await this.log(`${label}: contacting model...`);

        let response;
        try {
            response = await fetch(CONFIG.OPENROUTER_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } catch (networkError) {
            clearTimeout(timeout);
            if (networkError.name === 'AbortError') {
                throw new Error(`${label} timed out after ${CONFIG.REQUEST_TIMEOUT_MS / 1000}s.`);
            }
            throw new Error(`${label} network error: ${networkError.message}`);
        }

        clearTimeout(timeout);

        if (!response.ok) {
            let errorDetail = '';
            try {
                const errData = await response.json();
                if (errData && (errData.error || errData.message)) {
                    errorDetail = ` Details: ${JSON.stringify(errData.error || errData.message)}`;
                }
            } catch {
                // ignore
            }

            const statusText = response.statusText || 'Unknown error';
            const message = `${label} API error: ${response.status} ${statusText}${errorDetail}`;
            await this.log(message, 'error');
            throw new Error(message);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const message = `${label} failed to parse response JSON: ${parseError.message}`;
            await this.log(message, 'error');
            throw new Error(message);
        }

        const content = safeGetFirstChoiceContent(data);
        await this.log(`${label}: response received.`);
        return content;
    }

    async analyzeTopic(topic) {
        this.ensureActive();
        await this.log('Phase 1: Analyzing research topic...');

        const base = `Perform a comprehensive analysis of the research topic: "${topic}"`;
        const sections = [
            'Provide:',
            '1. TopicCQ: complexity assessment (scale 1-10) with justification.',
            '2. Key subtopics and core questions.',
            '3. Suitable methodologies and evidence types.',
            '4. Critical uncertainties and assumptions.',
            '5. Interdisciplinary links worth exploring.',
            '6. Current research gaps & data limitations.',
            '',
            'Be structured, concise, and decision-useful.'
        ];
        const prompt = buildUserPrompt(base, sections);

        const analysis = await this.callOpenRouter(
            [{ role: 'user', content: prompt }],
            { maxTokens: 2000, temperature: 0.15, label: 'Topic analysis' }
        );

        await this.log('Topic analysis completed.');
        return { analysis: analysis || 'No analysis returned by the model.' };
    }

    async gatherPerspectives(topic, topicAnalysis, iterations) {
        this.ensureActive();
        await this.log('Phase 2: Generating research perspectives...');

        const baseAnalysis = (topicAnalysis && topicAnalysis.analysis) ? topicAnalysis.analysis : '';
        const prompt = buildUserPrompt(
            `Based on the topic "${topic}" and the following analysis (if any):\n${baseAnalysis.slice(0, 2000)}`,
            [
                `Generate between ${iterations + 2} and ${iterations * 3} distinct, high-quality research perspectives.`,
                'Each perspective must be:',
                '- Clearly named (start with a bold title).',
                '- Methodologically sound and academically relevant.',
                '- Non-overlapping and genuinely distinct.',
                '- Capable of yielding substantial insight.',
                '',
                'Return as a numbered list: "1. Title: short rationale".'
            ]
        );

        const raw = await this.callOpenRouter(
            [{ role: 'user', content: prompt }],
            { maxTokens: 3000, temperature: 0.35, label: 'Perspective generation' }
        );

        const perspectives = this.parsePerspectives(raw);
        if (perspectives.length === 0) {
            throw new Error('No perspectives could be parsed from the model response.');
        }

        const maxPerspectives = Math.max(iterations, 3);
        const finalPerspectives = perspectives.slice(0, maxPerspectives);

        await this.log(`Generated ${finalPerspectives.length} research perspectives.`);
        return finalPerspectives;
    }

    parsePerspectives(raw) {
        if (typeof raw !== 'string') return [];
        const lines = raw.split('\n');
        const results = [];

        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const match = trimmed.match(/^(\d+)[.)]\s*(.+)$/);
            if (match && match[2]) {
                results.push(match[2].trim());
            }
        }

        if (results.length === 0) {
            const paragraphs = raw
                .split(/\n{2,}/)
                .map(p => p.trim())
                .filter(Boolean);
            return paragraphs;
        }

        return results;
    }

    async deepResearch(perspectives, depth, iterations) {
        this.ensureActive();
        await this.log('Phase 3: Running deep research across perspectives...');

        const researchResults = {};
        const maxPerspectivesToResearch = Math.min(perspectives.length, iterations);

        for (let i = 0; i < maxPerspectivesToResearch; i++) {
            const perspective = perspectives[i];
            const labelPrefix = `Perspective ${i + 1}/${maxPerspectivesToResearch}`;
            const shortName = truncateForLog(perspective, 80);
            await this.log(`${labelPrefix}: Deep research for "${shortName}"`);

            try {
                researchResults[perspective] = await this.researchSinglePerspective(perspective, depth, labelPrefix);
            } catch (err) {
                await this.log(`${labelPrefix}: Failed - ${truncateForLog(err.message, 160)}`, 'error');
                researchResults[perspective] = {
                    error: err.message,
                    initial_research: '',
                    critical_analysis: '',
                    identified_gaps: '',
                    synthesis: ''
                };
            }
        }

        await this.log('Deep research phase completed.');
        return researchResults;
    }

    async researchSinglePerspective(perspective, depth, labelPrefix) {
        this.ensureActive();

        const maxTokens =
            depth === 'extreme' ? 6000 :
            depth === 'advanced' ? 4000 :
            3000;

        const temperature =
            depth === 'extreme' ? 0.12 :
            depth === 'advanced' ? 0.18 :
            0.22;

        const constraintSuffix = this.constraints
            ? `\n\nAdditionally, respect these constraints / addons:\n${this.constraints}`
            : '';

        // 1) Initial research
        const initialPrompt = buildUserPrompt(
            `Conduct a thorough investigation into this research perspective:\n"${perspective}"${constraintSuffix}`,
            [
                'Requirements:',
                '- Outline key theories, models, and frameworks.',
                '- Summarize major findings and representative studies.',
                '- Include concrete examples and (approximate) citations where appropriate.',
                '- Identify important datasets, benchmarks, or empirical evidence.',
                '- Highlight leading researchers, institutions, and recent developments (last 2-3 years).',
                '- Note practical applications, where relevant.',
                '- Avoid vague statements; prefer specific details.'
            ]
        );

        const initialResearch = await this.callOpenRouter(
            [{ role: 'user', content: initialPrompt }],
            { maxTokens, temperature, label: `${labelPrefix} – Initial research` }
        );

        // 2) Critical analysis
        const criticalPrompt = buildUserPrompt(
            `Critically evaluate the following research overview for "${perspective}":\n${(initialResearch || '').slice(0, 2500)}`,
            [
                'Provide:',
                '1. Strengths and weaknesses of the arguments and evidence.',
                '2. Evaluation of methodological quality and limitations.',
                '3. Biases and threats to validity.',
                '4. Comparison with mainstream / consensus views where applicable.',
                '5. Reproducibility and robustness considerations.'
            ]
        );

        const criticalAnalysis = await this.callOpenRouter(
            [{ role: 'user', content: criticalPrompt }],
            { maxTokens: 2500, temperature: 0.15, label: `${labelPrefix} – Critical analysis` }
        );

        // 3) Gap identification
        const gapPrompt = buildUserPrompt(
            `Using the perspective "${perspective}", the research overview, and its critical evaluation:`,
            [
                `Research overview:\n${(initialResearch || '').slice(0, 1500)}...`,
                `Critical analysis:\n${(criticalAnalysis || '').slice(0, 1500)}...`,
                '',
                'Identify:',
                '1. Concrete research gaps and unanswered questions.',
                '2. Opportunities for novel contributions (theoretical & applied).',
                '3. Methodological improvements or new study designs.',
                '4. Practical & policy implications.',
                '5. Interdisciplinary collaboration opportunities.',
                'Be specific and actionable. Structure points clearly.'
            ]
        );

        const identifiedGaps = await this.callOpenRouter(
            [{ role: 'user', content: gapPrompt }],
            { maxTokens: 2500, temperature: 0.25, label: `${labelPrefix} – Gap analysis` }
        );

        // 4) Synthesis per perspective
        const synthesisPrompt = buildUserPrompt(
            `Synthesize a cohesive view for the perspective "${perspective}".`,
            [
                'Base your synthesis on:',
                `- Research overview: ${(initialResearch || '').slice(0, 1500)}...`,
                `- Critical analysis: ${(criticalAnalysis || '').slice(0, 1000)}...`,
                `- Gaps & opportunities: ${(identifiedGaps || '').slice(0, 1000)}...`,
                '',
                'Provide:',
                '1. Integrated narrative with key insights.',
                '2. Assessment of current evidence quality.',
                '3. Priority list of research directions (High/Medium/Low).',
                '4. Suggested methodologies & datasets for top priorities.',
                '5. Practical applications and expected impact.',
                'Make it clear, structured, and non-redundant.'
            ]
        );

        const synthesis = await this.callOpenRouter(
            [{ role: 'user', content: synthesisPrompt }],
            { maxTokens: 3000, temperature: 0.14, label: `${labelPrefix} – Perspective synthesis` }
        );

        return {
            initial_research: initialResearch || '',
            critical_analysis: criticalAnalysis || '',
            identified_gaps: identifiedGaps || '',
            synthesis: synthesis || ''
        };
    }

    async synthesizeFindings(research, topic) {
        this.ensureActive();
        await this.log('Phase 4: Synthesizing cross-perspective findings...');

        let researchSummary = `Topic: ${topic}\n\n`;

        const perspectives = Object.keys(research || {});
        if (perspectives.length === 0) {
            researchSummary += 'No detailed per-perspective results available; synthesize based on topic-level reasoning only.\n';
        } else {
            perspectives.forEach((perspective, index) => {
                const findings = research[perspective] || {};
                const synthesisSnippet = (findings.synthesis || findings.initial_research || '').slice(0, 800);
                researchSummary += `Perspective ${index + 1}: ${perspective}\n`;
                if (synthesisSnippet) {
                    researchSummary += `Key findings snippet: ${synthesisSnippet}\n\n`;
                } else if (findings.error) {
                    researchSummary += `Error for this perspective: ${findings.error}\n\n`;
                }
            });
        }

        const base = `Synthesize comprehensive research findings from multiple perspectives on: ${topic}`;
        const sections = [
            'Create a detailed research report that includes:',
            '1. Executive summary of key findings (max ~300 words).',
            '2. Integrated analysis across all perspectives and themes.',
            '3. Critical insights and emerging patterns.',
            '4. Overall research quality assessment and confidence levels.',
            '5. Consolidated gap analysis with prioritized opportunities.',
            '6. Concrete recommendations for future research (methods, timelines, resources).',
            '7. Practical applications, implementation strategies, and expected impact.',
            '8. Limitations of this synthesis (including relying on model-generated text).',
            '',
            'Write as a structured, clearly formatted report.'
        ];

        const prompt = buildUserPrompt(base, sections);

        const synthesis = await this.callOpenRouter(
            [{
                role: 'user',
                content: `${prompt}\n\nContextual research summary:\n${researchSummary.slice(0, 6000)}`
            }],
            { maxTokens: 5000, temperature: 0.16, label: 'Global synthesis' }
        );

        await this.log('Global synthesis completed.');
        return synthesis || 'No synthesis returned by the model.';
    }

    async conductResearch(topic, depth = 'extreme', iterations = 5) {
        this.ensureActive();
        await this.log('Initializing full research workflow...');

        if (this.uiHooks.onPhaseLabel) {
            this.uiHooks.onPhaseLabel('Phase 1/4: Topic analysis');
        }

        const topicAnalysis = await this.analyzeTopic(topic);
        if (typeof this.uiHooks.onPhaseProgress === 'function') {
            this.uiHooks.onPhaseProgress(1, 4);
        }

        if (this.uiHooks.onPhaseLabel) {
            this.uiHooks.onPhaseLabel('Phase 2/4: Perspectives');
        }

        const perspectives = await this.gatherPerspectives(topic, topicAnalysis, iterations);
        if (typeof this.uiHooks.onPhaseProgress === 'function') {
            this.uiHooks.onPhaseProgress(2, 4);
        }

        if (this.uiHooks.onPhaseLabel) {
            this.uiHooks.onPhaseLabel('Phase 3/4: Deep research');
        }

        const deepResearch = await this.deepResearch(perspectives, depth, iterations);
        if (typeof this.uiHooks.onPhaseProgress === 'function') {
            this.uiHooks.onPhaseProgress(3, 4);
        }

        if (this.uiHooks.onPhaseLabel) {
            this.uiHooks.onPhaseLabel('Phase 4/4: Global synthesis');
        }

        const synthesis = await this.synthesizeFindings(deepResearch, topic);
        if (typeof this.uiHooks.onPhaseProgress === 'function') {
            this.uiHooks.onPhaseProgress(4, 4);
        }

        await this.log('Research workflow completed successfully.');

        return {
            topic,
            topic_analysis: topicAnalysis,
            perspectives,
            deep_research: deepResearch,
            synthesis,
            research_log: this.researchLog.slice()
        };
    }

    cancel() {
        this.active = false;
    }
}

// ---- DOM & Application Logic ----

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('researchForm');
    const apiKeyInput = document.getElementById('apiKey');
    const modelIdSelect = document.getElementById('modelId');
    const customModelGroup = document.getElementById('customModelGroup');
    const customModelInput = document.getElementById('customModel');
    const topicInput = document.getElementById('topic');
    const depthSelect = document.getElementById('depth');
    const iterationsSelect = document.getElementById('iterations');
    const constraintsInput = document.getElementById('constraints');

    const startButton = document.getElementById('startResearch');
    const openSettingsFromForm = document.getElementById('openSettingsFromForm');

    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const statusPhase = document.getElementById('statusPhase');

    const resultsContainer = document.getElementById('resultsContainer');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const topicAnalysisDiv = document.getElementById('topicAnalysis');
    const perspectivesDiv = document.getElementById('perspectives');
    const deepResearchDiv = document.getElementById('deepResearch');
    const synthesisDiv = document.getElementById('synthesis');
    const researchLogDiv = document.getElementById('researchLog');

    const exportToggle = document.getElementById('exportToggle');
    const exportMenu = document.getElementById('exportMenu');
    const exportTxtBtn = document.getElementById('exportTxt');
    const exportPdfBtn = document.getElementById('exportPdf');

    const settingsButton = document.getElementById('settingsButton');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const settingsBackdrop = document.getElementById('settingsBackdrop');
    const settingsClose = document.getElementById('settingsClose');
    const settingsSave = document.getElementById('settingsSave');
    const settingsReset = document.getElementById('settingsReset');

    const settingsApiKey = document.getElementById('settingsApiKey');
    const settingsModel = document.getElementById('settingsModel');
    const settingsCustomModel = document.getElementById('settingsCustomModel');
    const settingsIterations = document.getElementById('settingsIterations');
    const settingsConstraints = document.getElementById('settingsConstraints');
    const toggleDarkTheme = document.getElementById('toggleDarkTheme');
    const toggleCompact = document.getElementById('toggleCompact');
    const toggleReducedMotion = document.getElementById('toggleReducedMotion');

    const docsButton = document.getElementById('docsButton');
    const themeToggleButton = document.getElementById('themeToggleButton');
    const themeToggleLabel = document.getElementById('themeToggleLabel');

    let currentResearcher = null;
    let isRunning = false;
    let currentSettings = SettingsManager.load();
    applySettingsToDOM(currentSettings, { initial: true });

    // ----- Settings UI integration -----

    function setToggleEl(toggleEl, on) {
        toggleEl.dataset.on = on ? 'true' : 'false';
        toggleEl.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    function openSettings() {
        populateSettingsForm(currentSettings);
        settingsDrawer.classList.add('open');
        settingsBackdrop.classList.add('open');
        settingsButton.setAttribute('aria-expanded', 'true');
        const firstFocusable = settingsDrawer.querySelector('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
        trapFocus(settingsDrawer);
    }

    function closeSettings() {
        settingsDrawer.classList.remove('open');
        settingsBackdrop.classList.remove('open');
        settingsButton.setAttribute('aria-expanded', 'false');
        releaseFocusTrap();
        settingsButton.focus();
    }

    function populateSettingsForm(settings) {
        settingsApiKey.value = settings.apiKey || '';
        settingsModel.value = settings.defaultModel || '';
        settingsCustomModel.value = settings.defaultCustomModel || '';
        settingsIterations.value = settings.defaultIterations ? String(settings.defaultIterations) : '';
        settingsConstraints.value = settings.defaultConstraints || '';

        setToggleEl(toggleDarkTheme, settings.theme === 'dark');
        setToggleEl(toggleCompact, !!settings.compact);
        setToggleEl(toggleReducedMotion, !!settings.reducedMotion);
    }

    function collectSettingsFromForm(prev) {
        const next = { ...(prev || CONFIG.DEFAULT_SETTINGS) };

        next.apiKey = settingsApiKey.value || '';
        next.defaultModel = settingsModel.value || '';
        next.defaultCustomModel = settingsCustomModel.value || '';
        const iterVal = settingsIterations.value ? parseInt(settingsIterations.value, 10) : null;
        if (iterVal && iterVal >= 1 && iterVal <= 10) {
            next.defaultIterations = iterVal;
        }
        next.defaultConstraints = settingsConstraints.value || '';

        const darkOn = toggleDarkTheme.dataset.on === 'true';
        next.theme = darkOn ? 'dark' : 'light';

        next.compact = toggleCompact.dataset.on === 'true';
        next.reducedMotion = toggleReducedMotion.dataset.on === 'true';

        return next;
    }

    function applySettingsToDOM(settings, { initial = false } = {}) {
        setBodyTheme(settings.theme === 'auto' ? 'auto' : settings.theme);
        const isDark = document.body.classList.contains('theme-dark');
        themeToggleLabel.textContent = isDark ? 'Dark' : 'Light';

        setBodyDensity(!!settings.compact);
        setBodyMotion(!!settings.reducedMotion);

        if (initial || settings.apiKey) {
            if (settings.apiKey) {
                apiKeyInput.value = settings.apiKey;
            }
        }

        const modelToApply = settings.defaultModel || '';
        if (initial && modelToApply) {
            if (modelToApply === 'custom') {
                modelIdSelect.value = 'custom';
                customModelGroup.style.display = 'block';
                customModelInput.value = settings.defaultCustomModel || '';
            } else {
                modelIdSelect.value = modelToApply;
            }
        }

        if (initial && settings.defaultIterations) {
            if ([3, 5, 7].includes(settings.defaultIterations)) {
                iterationsSelect.value = String(settings.defaultIterations);
            }
        }

        if (initial && settings.defaultConstraints) {
            constraintsInput.value = settings.defaultConstraints;
        }
    }

    settingsButton.addEventListener('click', openSettings);
    openSettingsFromForm.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsBackdrop.addEventListener('click', closeSettings);

    settingsSave.addEventListener('click', () => {
        const next = collectSettingsFromForm(currentSettings);

        if (next.defaultModel && next.defaultModel === 'custom' && !next.defaultCustomModel.includes('/')) {
            alert('Custom default model must include provider/model.');
            return;
        }

        currentSettings = SettingsManager.save(next);
        applySettingsToDOM(currentSettings, { initial: false });

        if (currentSettings.apiKey) {
            apiKeyInput.value = currentSettings.apiKey;
        }

        if (currentSettings.defaultConstraints && !constraintsInput.value) {
            constraintsInput.value = currentSettings.defaultConstraints;
        }

        closeSettings();
    });

    settingsReset.addEventListener('click', () => {
        currentSettings = SettingsManager.reset();
        populateSettingsForm(currentSettings);
        applySettingsToDOM(currentSettings, { initial: false });
    });

    function toggleSwitchClickHandler(ev) {
        const target = ev.currentTarget;
        const on = target.dataset.on === 'true';
        setToggleEl(target, !on);
    }

    function toggleSwitchKeyHandler(ev) {
        if (ev.key === ' ' || ev.key === 'Enter') {
            ev.preventDefault();
            const target = ev.currentTarget;
            const on = target.dataset.on === 'true';
            setToggleEl(target, !on);
        }
    }

    [toggleDarkTheme, toggleCompact, toggleReducedMotion].forEach((el) => {
        el.addEventListener('click', toggleSwitchClickHandler);
        el.addEventListener('keydown', toggleSwitchKeyHandler);
    });

    // Theme quick toggle
    themeToggleButton.addEventListener('click', () => {
        const isDark = document.body.classList.contains('theme-dark');
        const nextTheme = isDark ? 'light' : 'dark';
        setBodyTheme(nextTheme);
        themeToggleLabel.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';

        currentSettings = SettingsManager.save({
            ...currentSettings,
            theme: nextTheme
        });
        setToggleEl(toggleDarkTheme, nextTheme === 'dark');
    });

    // Docs button: scroll to workflow section
    docsButton.addEventListener('click', () => {
        const sidePanels = document.querySelectorAll('.side-card');
        if (sidePanels.length > 0) {
            scrollIntoView(sidePanels[0]);
        }
    });

    // Model selection: show/hide custom field
    modelIdSelect.addEventListener('change', () => {
        if (modelIdSelect.value === 'custom') {
            customModelGroup.style.display = 'block';
            customModelInput.setAttribute('aria-hidden', 'false');
        } else {
            customModelGroup.style.display = 'none';
            customModelInput.setAttribute('aria-hidden', 'true');
        }
    });

    // Form submission handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isRunning) return;

        hideMessage(errorMessage);
        hideMessage(successMessage);
        clearResults();

        const apiKey = sanitizeText(apiKeyInput.value || currentSettings.apiKey || '');
        const topicRaw = topicInput.value || '';
        const topic = sanitizeText(topicRaw);

        let modelId = modelIdSelect.value;
        if (modelId === 'custom') {
            modelId = sanitizeText(customModelInput.value);
        } else if (!modelId && currentSettings.defaultModel) {
            modelId = currentSettings.defaultModel === 'custom'
                ? (currentSettings.defaultCustomModel || '')
                : currentSettings.defaultModel;
        }

        const depth = depthSelect.value || 'extreme';

        let iterations = parseInt(iterationsSelect.value, 10);
        if (!iterations && currentSettings.defaultIterations) {
            iterations = currentSettings.defaultIterations;
        }
        iterations = iterations || 3;

        const constraints = sanitizeText(constraintsInput.value || currentSettings.defaultConstraints || '');

        const validationError = validateInputs({ apiKey, modelId, topic, iterations });
        if (validationError) {
            showMessage(errorMessage, validationError);
            return;
        }

        isRunning = true;
        startButton.disabled = true;
        startButton.innerHTML = '<span class="icon" aria-hidden="true">🔄</span><span>Running research...</span>';

        lockRunInputs(true);
        progressContainer.style.display = 'block';
        updateProgressBar(2);
        updateProgressText('Starting research workflow...');
        updatePhaseLabel('Initializing workflow');
        resultsContainer.style.display = 'none';
        researchLogDiv.textContent = '';
        updateLiveStatus('Research started.');

        currentResearcher = new AdvancedResearcher(apiKey, modelId, constraints, {
            onLog: (entry) => appendLogEntry(entry),
            onProgressText: (text) => updateProgressText(text),
            onPhaseProgress: (phaseIndex, totalPhases) => {
                const ratio = Math.max(0, Math.min(1, phaseIndex / totalPhases));
                updateProgressBar(Math.round(ratio * 100));
            },
            onPhaseLabel: (label) => {
                updatePhaseLabel(label);
            }
        });

        try {
            const results = await currentResearcher.conductResearch(topic, depth, iterations);
            renderResults(results);
            showMessage(successMessage, 'Research completed successfully.');
            updateLiveStatus('Research completed successfully.');
            scrollIntoView(resultsContainer);
        } catch (err) {
            const msg = `Research failed: ${err.message}`;
            console.error('[Advanced Research Tool]', err);
            showMessage(errorMessage, msg);
            updateLiveStatus('Research failed.');
        } finally {
            isRunning = false;
            if (currentResearcher) {
                currentResearcher.cancel();
            }
            startButton.disabled = false;
            startButton.innerHTML = '<span class="icon" aria-hidden="true">🚀</span><span>Run Advanced Research</span>';
            lockRunInputs(false);
        }
    });

    function lockRunInputs(lock) {
        apiKeyInput.readOnly = lock;
        modelIdSelect.disabled = lock;
        customModelInput.readOnly = lock;
        topicInput.readOnly = lock;
        depthSelect.disabled = lock;
        iterationsSelect.disabled = lock;
        constraintsInput.readOnly = lock;
        openSettingsFromForm.disabled = lock;
        settingsButton.disabled = lock;
    }

    // ----- Export dropdown behavior -----

    function closeExportMenu() {
        exportMenu.classList.remove('open');
        exportToggle.setAttribute('aria-expanded', 'false');
    }

    exportToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportMenu.classList.contains('open');
        if (isOpen) {
            closeExportMenu();
        } else {
            exportMenu.classList.add('open');
            exportToggle.setAttribute('aria-expanded', 'true');
            const firstItem = exportMenu.querySelector('button');
            if (firstItem) firstItem.focus();
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!exportMenu.classList.contains('open')) return;
        if (!exportMenu.contains(e.target) && e.target !== exportToggle) {
            closeExportMenu();
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && exportMenu.classList.contains('open')) {
            e.stopPropagation();
            closeExportMenu();
            exportToggle.focus();
        }
    });

    // TXT export
    exportTxtBtn.addEventListener('click', () => {
        const visibleResultsText = collectResultsAsText();
        if (!visibleResultsText.trim()) {
            showMessage(errorMessage, 'No results available to export yet.');
            closeExportMenu();
            return;
        }
        const blob = new Blob([visibleResultsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research_results_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        closeExportMenu();
    });

    // PDF export via print view
    exportPdfBtn.addEventListener('click', () => {
        const textContent = collectResultsAsText();
        if (!textContent.trim()) {
            showMessage(errorMessage, 'No results available to export yet.');
            closeExportMenu();
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showMessage(errorMessage, 'Popup blocked. Allow popups to export as PDF.');
            closeExportMenu();
            return;
        }

        const topicTitle = (document.getElementById('topic').value || '').trim() || 'Advanced Research Report';
        const now = new Date();
        const formattedDate = now.toLocaleString();

        const safeTopicAnalysis = escapeHtml((topicAnalysisDiv.textContent || '').trim());
        const safePerspectives = escapeHtml((perspectivesDiv.textContent || '').trim());
        const safeDeep = escapeHtml((deepResearchDiv.textContent || '').trim());
        const safeSynthesis = escapeHtml((synthesisDiv.textContent || '').trim());
        const safeLog = escapeHtml((researchLogDiv.textContent || '').trim());

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(topicTitle)} - Research Report</title>
    <style>
        body {
            margin: 0;
            padding: 24px;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #111827;
            line-height: 1.6;
            background: #ffffff;
        }
        h1 {
            font-size: 20px;
            margin: 0 0 8px;
        }
        .meta {
            font-size: 10px;
            color: #6b7280;
            margin-bottom: 16px;
        }
        h2 {
            font-size: 14px;
            margin: 16px 0 6px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 2px;
        }
        h3 {
            font-size: 12px;
            margin: 10px 0 4px;
        }
        p,
        li,
        pre {
            font-size: 10px;
        }
        ul {
            padding-left: 16px;
            margin: 4px 0 8px;
        }
        pre {
            white-space: pre-wrap;
            background: #f9fafb;
            padding: 6px;
            border-radius: 4px;
            border: 1px solid #e5e7eb;
        }
        .section {
            margin-bottom: 12px;
        }
    </style>
</head>
<body class="print-report-root">
    <h1>Advanced Research Report</h1>
    <div class="meta">
        <div><strong>Topic:</strong> ${escapeHtml(topicTitle)}</div>
        <div><strong>Generated:</strong> ${escapeHtml(formattedDate)}</div>
    </div>

    ${safeTopicAnalysis ? `
    <div class="section">
        <h2>1. Topic Analysis</h2>
        <pre>${safeTopicAnalysis}</pre>
    </div>` : ''}

    ${safePerspectives ? `
    <div class="section">
        <h2>2. Research Perspectives</h2>
        <pre>${safePerspectives}</pre>
    </div>` : ''}

    ${safeDeep ? `
    <div class="section">
        <h2>3. Deep Research Findings</h2>
        <pre>${safeDeep}</pre>
    </div>` : ''}

    ${safeSynthesis ? `
    <div class="section">
        <h2>4. Synthesis & Conclusions</h2>
        <pre>${safeSynthesis}</pre>
    </div>` : ''}

    ${safeLog ? `
    <div class="section">
        <h2>5. Research Log (Execution Trace)</h2>
        <pre>${safeLog}</pre>
    </div>` : ''}

</body>
</html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();

        printWindow.addEventListener('load', () => {
            printWindow.print();
        });

        closeExportMenu();
    });

    function appendLogEntry(entry) {
        const logLine = document.createElement('div');
        logLine.className = 'log-entry';
        logLine.textContent = entry;
        researchLogDiv.appendChild(logLine);
        researchLogDiv.scrollTop = researchLogDiv.scrollHeight;
    }

    function updateProgressBar(percent) {
        progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }

    function updateProgressText(text) {
        progressText.textContent = text;
    }

    function updatePhaseLabel(label) {
        statusPhase.textContent = label;
    }

    function showMessage(container, message) {
        container.textContent = message;
        container.style.display = 'block';
    }

    function hideMessage(container) {
        container.style.display = 'none';
        container.textContent = '';
    }

    function clearResults() {
        topicAnalysisDiv.textContent = '';
        perspectivesDiv.innerHTML = '';
        deepResearchDiv.innerHTML = '';
        synthesisDiv.textContent = '';
        researchLogDiv.textContent = '';
        resultsContainer.style.display = 'none';
    }

    function renderResults(results) {
        if (!results || typeof results !== 'object') {
            showMessage(errorMessage, 'Internal error: invalid results object.');
            return;
        }

        const topicAnalysisText =
            results.topic_analysis &&
            typeof results.topic_analysis.analysis === 'string'
                ? results.topic_analysis.analysis
                : 'No topic analysis available.';
        topicAnalysisDiv.textContent = topicAnalysisText;

        const perspectives = Array.isArray(results.perspectives) ? results.perspectives : [];
        perspectivesDiv.innerHTML = perspectives.length
            ? perspectives
                .map((p, i) => `<div><strong>${i + 1}.</strong> ${escapeHtml(p)}</div>`)
                .join('')
            : '<em>No perspectives were generated.</em>';

        deepResearchDiv.innerHTML = '';
        const deep = results.deep_research && typeof results.deep_research === 'object'
            ? results.deep_research
            : {};

        Object.entries(deep).forEach(([perspective, research]) => {
            const safePerspective = escapeHtml(perspective || 'Unnamed perspective');
            const section = document.createElement('section');
            section.setAttribute('aria-label', `Deep research for ${safePerspective}`);

            const synthesisSnippet = (research && research.synthesis) ? research.synthesis.slice(0, 800) : '';
            const hasError = research && research.error;

            section.innerHTML = `
                <h4 style="margin:0 0 4px;font-size:var(--text-md);color:var(--text-main);">${safePerspective}</h4>
                ${
                    hasError
                        ? `<p style="font-size:var(--text-sm);color:var(--danger);"><strong>Warning:</strong> ${escapeHtml(research.error)}</p>`
                        : synthesisSnippet
                            ? `<h5 style="margin:0 0 2px;font-size:var(--text-sm);color:var(--text-muted);">Key Synthesis</h5>
                               <p style="margin:0 0 4px;font-size:var(--text-sm);color:var(--text-muted);">${escapeHtml(synthesisSnippet)}${synthesisSnippet.length === 800 ? '...' : ''}</p>`
                            : '<p style="font-size:var(--text-sm);color:var(--text-soft);"><em>No synthesis available for this perspective.</em></p>'
                }
                <details style="margin-top:2px;font-size:var(--text-sm);color:var(--text-soft);">
                    <summary>View detailed breakdown</summary>
                    <div>
                        <h6 style="margin:4px 0 2px;font-size:var(--text-xs);color:var(--text-muted);">Initial Research</h6>
                        <p>${escapeHtml((research && research.initial_research) || 'No data.')}</p>
                        <h6 style="margin:4px 0 2px;font-size:var(--text-xs);color:var(--text-muted);">Critical Analysis</h6>
                        <p>${escapeHtml((research && research.critical_analysis) || 'No data.')}</p>
                        <h6 style="margin:4px 0 2px;font-size:var(--text-xs);color:var(--text-muted);">Identified Gaps</h6>
                        <p>${escapeHtml((research && research.identified_gaps) || 'No data.')}</p>
                    </div>
                </details>
            `;

            deepResearchDiv.appendChild(section);
        });

        synthesisDiv.textContent =
            typeof results.synthesis === 'string' && results.synthesis.trim()
                ? results.synthesis
                : 'No synthesis available.';

        const logEntries = Array.isArray(results.research_log) ? results.research_log : [];
        researchLogDiv.textContent = logEntries.join('\n');

        resultsContainer.style.display = 'block';
    }

    function collectResultsAsText() {
        const parts = [];

        const topicTitle = (topicInput.value || '').trim();
        if (topicTitle) {
            parts.push(`=== Topic ===`);
            parts.push(topicTitle);
            parts.push('');
        }

        const topicText = (topicAnalysisDiv.textContent || '').trim();
        if (topicText) {
            parts.push('=== Topic Analysis ===');
            parts.push(topicText);
            parts.push('');
        }

        const perspectivesText = (perspectivesDiv.textContent || '').trim();
        if (perspectivesText) {
            parts.push('=== Research Perspectives ===');
            parts.push(perspectivesText);
            parts.push('');
        }

        const deepText = (deepResearchDiv.textContent || '').trim();
        if (deepText) {
            parts.push('=== Deep Research Findings ===');
            parts.push(deepText);
            parts.push('');
        }

        const synthesisText = (synthesisDiv.textContent || '').trim();
        if (synthesisText) {
            parts.push('=== Synthesis & Conclusions ===');
            parts.push(synthesisText);
            parts.push('');
        }

        const logText = (researchLogDiv.textContent || '').trim();
        if (logText) {
            parts.push('=== Research Log ===');
            parts.push(logText);
        }

        return parts.join('\n');
    }

    function validateInputs({ apiKey, modelId, topic, iterations }) {
        if (!apiKey) return 'Please provide your OpenRouter API key to run research.';
        if (!modelId) return 'Please choose a model.';
        if (!topic || topic.length < CONFIG.MIN_TOPIC_LENGTH) {
            return `Research topic must be at least ${CONFIG.MIN_TOPIC_LENGTH} characters long.`;
        }
        if (topic.length > CONFIG.MAX_TOPIC_LENGTH) {
            return `Research topic must be under ${CONFIG.MAX_TOPIC_LENGTH} characters.`;
        }
        if (!Number.isInteger(iterations) || iterations < 1 || iterations > 8) {
            return 'Perspective coverage must be between 1 and 8.';
        }
        return null;
    }

    function scrollIntoView(element) {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Accessibility: keyboard trap for settings drawer
    let previousActiveElement = null;
    let focusableElements = [];
    let focusTrapListener = null;

    function trapFocus(container) {
        previousActiveElement = document.activeElement;
        focusableElements = Array.from(
            container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        focusTrapListener = (event) => {
            if (event.key !== 'Tab') return;
            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }
            if (event.shiftKey) {
                if (document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        container.addEventListener('keydown', focusTrapListener);
    }

    function releaseFocusTrap() {
        if (focusTrapListener) {
            settingsDrawer.removeEventListener('keydown', focusTrapListener);
            focusTrapListener = null;
        }
        if (previousActiveElement) {
            previousActiveElement.focus();
            previousActiveElement = null;
        }
    }
});

