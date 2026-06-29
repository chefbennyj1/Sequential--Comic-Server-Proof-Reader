class ProofReaderPlugin {
    
    init(subRouter) {
        console.log('[Proof-Reader] Initializing API routes...');
        
        // Expose endpoint at POST /api/plugins/Proof-Reader/analyze
        subRouter.post('/analyze', async (req, res) => {
            try {
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
     * Constructs the prompt and queries the Local-Llm-Engine plugin
     * @param {Array} pages - The sliding window of recent pages
     * @param {Array} characters - The character voice profiles
     */
    async proofread(pages, characters) {
        // 1. Construct the System Prompt
        let systemPrompt = "You are an expert story editor and proofreader. Review the final page of the provided scene. Check for spelling, grammar, and out-of-character dialogue.\n\n";
        
        if (characters && characters.length > 0) {
            systemPrompt += "CHARACTER PROFILES:\n";
            characters.forEach(char => {
                if (char.dialogueStylePrompt) {
                    systemPrompt += `- ${char.name}: ${char.dialogueStylePrompt}\n`;
                }
            });
        }

        // 2. Construct the User Prompt
        let userPrompt = "SCENE CONTEXT:\n";
        pages.forEach((page, index) => {
            userPrompt += `--- Page ${index + 1} ---\n`;
            userPrompt += JSON.stringify(page.content || page) + "\n";
        });
        userPrompt += "\nPlease provide a concise proofreading critique for the final page.";

        // 3. Format into ChatML
        const promptString = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;

        // 4. Send request to the Local-Llm-Engine plugin running on this same server
        console.log("[Proof-Reader] Sending request to Local-Llm-Engine...");
        
        // Assuming the server is running on port 3000
        const response = await fetch(`http://localhost:3000/api/plugins/Local-Llm-Engine/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptString,
                n_predict: 512,
                temperature: 0.3
            })
        });

        const data = await response.json();
        
        if (!data.ok) {
            throw new Error(`Engine error: ${data.message}`);
        }

        return data.content;
    }
}

module.exports = new ProofReaderPlugin();
