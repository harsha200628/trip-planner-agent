// Hugging Face API Configuration
const HF_KEY = "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";
const MODEL = "google/gemma-3-27b-it";
const HF_URL = "https://router.huggingface.co/v1/chat/completions";

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Form Submission & Agent Workflow ---
    const form = document.getElementById('trip-form');
    const statusPanel = document.getElementById('agent-status');
    const resultsPanel = document.getElementById('results-container');
    const statusMessage = document.getElementById('status-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide form, show status
        form.classList.add('hidden');
        resultsPanel.classList.add('hidden');
        statusPanel.classList.remove('hidden');

        // Setup Agent Console
        const consoleEl = document.getElementById('console-output');
        consoleEl.innerHTML = ''; // clear

        function appendToConsole(actorClass, text, isNew = false) {
            if (isNew) {
                const span = document.createElement('span');
                span.className = actorClass;
                span.innerText = text;
                consoleEl.appendChild(span);
                return span;
            } else {
                const spans = consoleEl.getElementsByClassName(actorClass);
                if (spans.length > 0) {
                    spans[spans.length - 1].innerText += text;
                }
            }
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        function logSystem(msg) {
            const div = document.createElement('div');
            div.className = 'console-message console-system';
            div.innerText = `> ${msg}`;
            consoleEl.appendChild(div);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        // Gather Input Data
        const userPrompt = document.getElementById('user-prompt').value;
        
        const userInput = userPrompt;

        try {
            logSystem(`Initializing Orchestration for user prompt...`);

            // === OPTIMIZED: MULTI-AGENT IN A SINGLE CALL ===
            updateAgentStep(1, 'active', 'Architect: Executing Chain-of-Thought...');
            logSystem('Launching Agent [Thinking and generating itinerary in one pass]...');

            const prompt = `You are an expert AI Travel Architect.
User Request: ${userInput}

You MUST use an <internal_thought> block to think through the entire itinerary before you output the final markdown. Let's think step by step.
Format your output EXACTLY as follows:

<internal_thought>
- Constraints Analysis
- Realistic travel times and distances
- Budget Strategy (verify viability)
- Critic Review: Are these activities viable and logical? Adjust if needed.
- Rough Daily Schedule
</internal_thought>

[FINAL OUTPUT HERE]
The final output MUST be beautifully formatted Markdown tailored to the user's request, including:
## 📋 Trip Summary
## 🗺️ Day-by-Day Itinerary (Highly detailed with time estimates and travel methods)
## 💰 Estimated Costs
## 💡 Travel Tips

Begin! First open <internal_thought>.`;

            let accumulatedText = "";
            let insideThought = false;
            let finalOutputAccumulator = "";
            let thoughtStartToken = "<internal_thought>";
            let thoughtEndToken = "</internal_thought>";

            appendToConsole('console-planner', '\\n[Agent Initialization]\\n', true);
            
            await streamHuggingFace([{ role: "user", content: prompt }], (chunk, fullText) => {
                accumulatedText += chunk;
                
                // Parse the chain of thought vs final output live
                if (accumulatedText.includes(thoughtStartToken) && !accumulatedText.includes(thoughtEndToken)) {
                    if (!insideThought) {
                        insideThought = true;
                        updateAgentStep(1, 'active', 'Architect: Generating Chain-of-Thought...');
                    }
                    
                    // To avoid printing the `<internal_thought>` tag itself to the console, we could strip it,
                    // but appending chunks live is simpler. The console will just show the raw tags which is fine.
                    appendToConsole('console-planner', chunk);
                } else if (accumulatedText.includes(thoughtEndToken)) {
                    if (insideThought) {
                        insideThought = false;
                        // First time we close the thought tag
                        updateAgentStep(1, 'completed', 'Architect: Chain-of-Thought completed.');
                        updateAgentStep(2, 'active', 'Synthesizer: Drafting Final Output...');
                        logSystem('Thinking complete. Switching to Synthesizer...');
                        
                        // Switch UI
                        statusPanel.classList.add('hidden');
                        resultsPanel.classList.remove('hidden');
                        document.getElementById('itinerary-content').innerHTML = "<p><em>Synthesizer is compiling your meticulously planned itinerary...</em></p>";
                    }
                    
                    // We extract everything after the end token for the final markdown rendering
                    const finalParts = accumulatedText.split(thoughtEndToken);
                    if (finalParts.length > 1) {
                        finalOutputAccumulator = finalParts[1].trimStart();
                        document.getElementById('itinerary-content').innerHTML = marked.parse(finalOutputAccumulator);
                    }
                } else {
                    // Before <internal_thought> strictly starts (e.g. system warmup tokens)
                    appendToConsole('console-system', chunk);
                }
            });

            updateAgentStep(2, 'completed', 'Synthesizer: Itinerary finalized.');
            window.lastGeneratedItinerary = finalOutputAccumulator;

        } catch (error) {
            console.error(error);
            logSystem(`CRITICAL ORCHESTRATION ERROR: ${error.message}`);
            statusMessage.textContent = "An error occurred. Check the Agent Console.";
            statusMessage.style.color = "#f85149";
        }
    });

    // --- 4. Utilities ---
    async function callHuggingFace(messages, stream = false) {
        const response = await fetch(HF_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_KEY}`,
                "Content-Type": "application/json",
                "Accept": stream ? "text/event-stream" : "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                max_tokens: 8192,
                temperature: 0.7,
                stream: stream
            })
        });

        if (!response.ok) {
            throw new Error(`HF API Error: ${response.statusText}`);
        }
        return stream ? response : await response.json();
    }

    async function streamHuggingFace(messages, onChunk) {
        const response = await callHuggingFace(messages, true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullOutput = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6);
                    if (dataStr.trim() === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                            const chunk = data.choices[0].delta.content;
                            fullOutput += chunk;
                            onChunk(chunk, fullOutput);
                        }
                    } catch (e) {
                        // ignore parse error
                    }
                }
            }
        }
        return fullOutput;
    }

    function updateAgentStep(stepNum, status, textMessage) {
        statusMessage.textContent = textMessage;

        const stepEl = document.getElementById(`step-${stepNum}`);
        if (stepEl) {
            stepEl.className = status; // 'pending', 'active', 'completed'
        }
    }

    // --- 5. Reset & Download ---
    document.getElementById('reset-btn').addEventListener('click', () => {
        resultsPanel.classList.add('hidden');
        form.classList.remove('hidden');

        // Reset steps
        [1, 2].forEach(n => {
            const step = document.getElementById(`step-${n}`);
            if (step) step.className = 'pending';
        });
        document.getElementById('itinerary-content').innerHTML = "";
    });

    document.getElementById('download-btn').addEventListener('click', () => {
        if (!window.lastGeneratedItinerary) return;

        const btn = document.getElementById('download-btn');
        const originalText = btn.innerText;
        btn.innerText = "Generating PDF...";
        btn.disabled = true;

        // Create an invisible iframe to use the browser's flawless native print-to-pdf engine
        // This solves the 'blank page' issue caused by html2canvas security restrictions when running files locally (file://)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>AI_Trip_Itinerary</title>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #000; line-height: 1.6; }
                    h1 { color: #3b82f6; text-align: center; margin-bottom: 5px; }
                    .subtitle { text-align: center; color: #666; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
                    h2, h3 { margin-top: 25px; color: #111; }
                    ul { padding-left: 20px; }
                    li { margin-bottom: 5px; }
                    @media print {
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body>
                <h1>Your Dream Itinerary</h1>
                <p class="subtitle">Generated by AI Trip Planner</p>
                <div>${marked.parse(window.lastGeneratedItinerary)}</div>
            </body>
            </html>
        `;

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(content);
        doc.close();

        // Wait a tiny bit for the browser to parse the HTML, then trigger print
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();

            // Restore button
            btn.innerText = originalText;
            btn.disabled = false;

            // Wait before cleaning up the iframe down to avoid cancelling the print dialog
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 500);
    });

});
