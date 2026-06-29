const { spawn } = require('child_process');
const path = require('path');

class LocalProofreader {
    constructor() {
        this.process = null;
        this.isRunning = false;
        // Default Llama.cpp server port
        this.port = 8080; 
        
        // Paths
        // TODO: We will need the path to the actual llama-server executable
        this.llamaServerPath = path.join(__dirname, '..', '..', 'ai_models', 'llama-server.exe');
        this.modelPath = path.join(__dirname, '..', '..', 'ai_models', 'gemma', 'google_gemma-3-4b-it-Q4_K_M.gguf');
    }

    /**
     * Starts the local LLM server process and loads the model into VRAM/RAM.
     */
    async start() {
        if (this.isRunning) {
            console.log("[Proofreader] Server is already running.");
            return true;
        }

        console.log(`[Proofreader] Starting local LLM with model: ${this.modelPath}`);
        
        try {
            // Spawn the llama-server child process
            // Note: We'll configure specific flags (like context size -c) here later
            this.process = spawn(this.llamaServerPath, [
                '-m', this.modelPath,
                '--port', this.port.toString(),
                '-c', '8192' // 8k context window
            ]);

            this.process.stdout.on('data', (data) => {
                // Uncomment to debug server output
                // console.log(`[Llama-Server]: ${data}`);
            });

            this.process.stderr.on('data', (data) => {
                const output = data.toString();
                // The server prints initialization logs to stderr
                if (output.includes("HTTP server listening")) {
                    this.isRunning = true;
                    console.log(`[Proofreader] Server successfully started on port ${this.port}.`);
                }
            });

            this.process.on('close', (code) => {
                console.log(`[Proofreader] Server process exited with code ${code}`);
                this.isRunning = false;
                this.process = null;
            });

            // We need a short delay to allow the model to load into memory
            // In a production version, we would ping the /health endpoint until ready
            return new Promise(resolve => setTimeout(() => resolve(true), 3000));

        } catch (err) {
            console.error("[Proofreader] Failed to start server:", err);
            this.isRunning = false;
            return false;
        }
    }

    /**
     * Kills the LLM server process, immediately freeing up system RAM/VRAM.
     */
    stop() {
        if (!this.isRunning || !this.process) {
            console.log("[Proofreader] Server is not running.");
            return;
        }

        console.log("[Proofreader] Stopping local LLM server to free resources...");
        this.process.kill('SIGINT');
        this.process = null;
        this.isRunning = false;
    }

    /**
     * Sends a proofreading request to the local LLM.
     * @param {Array} pages - The sliding window of recent pages (e.g. [page1, page2, page3])
     * @param {Array} characters - The character voice profiles for context
     */
    async proofread(pages, characters) {
        if (!this.isRunning) {
            throw new Error("Proofreader server is not running. Please start it first.");
        }

        // 1. Construct the System Prompt using the Character voice profiles
        let systemPrompt = "You are an expert story editor and proofreader. Review the final page of the provided scene. Check for spelling, grammar, and out-of-character dialogue.\n\n";
        if (characters && characters.length > 0) {
            systemPrompt += "CHARACTER PROFILES:\n";
            characters.forEach(char => {
                if (char.dialogueStylePrompt) {
                    systemPrompt += `- ${char.name}: ${char.dialogueStylePrompt}\n`;
                }
            });
        }

        // 2. Construct the User Prompt using the pages text
        let userPrompt = "SCENE CONTEXT:\n";
        pages.forEach((page, index) => {
            userPrompt += `--- Page ${index + 1} ---\n`;
            // TODO: Parse the actual page data (dialogue bubbles, narrator text) here
            userPrompt += JSON.stringify(page.content) + "\n";
        });
        userPrompt += "\nPlease provide a concise proofreading critique for the final page.";

        // 3. Send the request to the local llama-server API
        console.log("[Proofreader] Sending prompt to local LLM...");
        
        try {
            const response = await fetch(`http://localhost:${this.port}/completion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`,
                    n_predict: 512, // Max tokens to generate
                    temperature: 0.3 // Low temperature for focused editing
                })
            });

            const data = await response.json();
            return data.content; // The LLM's response
        } catch (err) {
            console.error("[Proofreader] Error generating critique:", err);
            throw err;
        }
    }
}

module.exports = new LocalProofreader();
