class ProofReaderPlugin {
    
    init(subRouter, config = {}) {
        this.port = config.port || 3000;
        console.log(`[Proof-Reader] Initializing API routes on port ${this.port}...`);
        
        this.config = config;
        
        // Expose endpoint at POST /api/plugins/Proof-Reader/analyze
        subRouter.post('/analyze', async (req, res) => {
            try {
                // 1. Dependency Check
                const deps = this.config.manifest?.dependencies || [];
                for (const dep of deps) {
                    if (!this.config.isPluginEnabled(dep)) {
                        return res.status(503).json({ 
                            ok: false, 
                            message: `Dependency missing: The '${dep}' plugin must be enabled to run Proof-Reader.` 
                        });
                    }
                }
                
                const { pages, characters } = req.body;
                
                if (!pages || !Array.isArray(pages)) {
                    return res.status(400).json({ ok: false, message: "Missing or invalid 'pages' array in request body." });
                }

                const critique = await this.proofread(pages, characters);
                res.json({ ok: true, content: critique });

            } catch (err) {
                console.error("[Proof-Reader] Analysis failed:", err);
                res.status(500).json({ ok: false, message: err.message });
            }
        });
    }

    /**
     * Helper to execute a prompt against the Local LLM Engine
     */
    async executeLLM(promptString) {
        const port = this.port || 3000;
        const response = await fetch(`http://localhost:${port}/api/plugins/Local-Llm-Engine/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptString,
                n_predict: 512,
                temperature: 0.1 // Low temp to enforce strict formatting
            })
        });

        const data = await response.json();
        if (!data.ok) throw new Error(`Engine error: ${data.message}`);
        return data.content;
    }

    /**
     * Performs a two-pass proofreading analysis
     */
    async proofread(pages, characters) {
        // 1. Build the shared Scene Context
        let sceneContext = "SCENE CONTEXT:\n";
        pages.forEach((page, index) => {
            const pageNum = index + 1;
            sceneContext += `--- Page ${pageNum} ---\n`;
            // Simplified injection so the LLM doesn't get overwhelmed with raw JSON schema
            // We just dump the panels array if it exists
            const content = page.content || page;
            sceneContext += JSON.stringify(content, null, 2) + "\n";
        });
        
        const outputFormat = "You must output ONLY in the following strict format for each issue found. Do not include conversational filler, intros, or summaries:\nPage X, Panel Y: [issue type] - [brief note]\n\nIf no issues are found, simply output: 'No issues found.'";

        // ==========================================
        // PASS 1: GRAMMAR & SPELLING
        // ==========================================
        const grammarSysPrompt = `You are an expert copy editor. Review the final page of the provided scene. Check ONLY for spelling, grammar, and structural typos.\n\n${outputFormat}`;
        const grammarUserPrompt = `${sceneContext}\nPlease provide your grammar and spelling critique for the final page.`;
        const grammarPromptStr = `<|im_start|>system\n${grammarSysPrompt}<|im_end|>\n<|im_start|>user\n${grammarUserPrompt}<|im_end|>\n<|im_start|>assistant\n`;
        
        console.log("[Proof-Reader] Executing Pass 1: Grammar & Spelling...");
        const grammarResult = await this.executeLLM(grammarPromptStr);
        let finalCritique = "### Grammar & Spelling\n" + (grammarResult.trim() || "No issues found.");

        // ==========================================
        // PASS 2: CHARACTER VOICE
        // ==========================================
        if (characters && characters.length > 0) {
            let charProfiles = "CHARACTER PROFILES:\n";
            let hasProfiles = false;
            characters.forEach(char => {
                if (char.dialogueStylePrompt) {
                    charProfiles += `- ${char.name}: ${char.dialogueStylePrompt}\n`;
                    hasProfiles = true;
                }
            });

            if (hasProfiles) {
                const voiceSysPrompt = `You are an expert narrative director. Review the final page of the provided scene. Check ONLY for out-of-character dialogue based on the provided character profiles.\n\n${charProfiles}\n\n${outputFormat}`;
                const voiceUserPrompt = `${sceneContext}\nPlease provide your character voice critique for the final page.`;
                const voicePromptStr = `<|im_start|>system\n${voiceSysPrompt}<|im_end|>\n<|im_start|>user\n${voiceUserPrompt}<|im_end|>\n<|im_start|>assistant\n`;

                console.log("[Proof-Reader] Executing Pass 2: Character Voice...");
                const voiceResult = await this.executeLLM(voicePromptStr);
                finalCritique += "\n\n### Character Voice\n" + (voiceResult.trim() || "No issues found.");
            }
        }

        return finalCritique;
    }
}

module.exports = new ProofReaderPlugin();
