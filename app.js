// Hugging Face API Configuration
const HF_KEY = "xxxxx";
const MODEL = "google/gemma-3-27b-it";
const HF_URL = "https://router.huggingface.co/v1/chat/completions";

// Global State
let conversationHistory = [];
let currentChatId = null;

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('trip-form');
    const statusPanel = document.getElementById('agent-status');
    const resultsPanel = document.getElementById('results-container');
    const statusMessage = document.getElementById('status-message');
    const chatListEl = document.getElementById('chat-history-list');

    // --- 1. LocalStorage Logic ---
    function getChats() {
        try {
            const data = localStorage.getItem('tripChats');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function saveChats(chats) {
        localStorage.setItem('tripChats', JSON.stringify(chats));
    }

    function saveCurrentChat() {
        if (!currentChatId) return;
        let chats = getChats();
        const index = chats.findIndex(c => c._id === currentChatId);
        if (index > -1) {
            chats[index].messages = conversationHistory;
        } else {
            chats.push({
                _id: currentChatId,
                title: "New Trip Plan",
                messages: conversationHistory,
                createdAt: Date.now()
            });
        }
        saveChats(chats);
        loadSidebar();
    }

    function loadSidebar() {
        let chats = getChats();
        // Sort newest first
        chats.sort((a, b) => b.createdAt - a.createdAt);
        
        chatListEl.innerHTML = '';
        if (chats.length === 0) {
            chatListEl.innerHTML = '<p class="sidebar-empty">No past trips yet.</p>';
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            if (chat._id === currentChatId) div.classList.add('active');
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chat-title';
            titleSpan.textContent = chat.title || 'Trip Plan';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'chat-item-delete';
            deleteBtn.title = "Delete trip";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm("Delete this trip?")) {
                    deleteChat(chat._id);
                }
            };
            
            div.appendChild(titleSpan);
            div.appendChild(deleteBtn);
            div.onclick = () => loadSingleChat(chat._id);
            chatListEl.appendChild(div);
        });
    }

    function loadSingleChat(id) {
        let chats = getChats();
        const chat = chats.find(c => c._id === id);
        if (!chat) return;
        
        currentChatId = chat._id;
        conversationHistory = chat.messages || [];
        loadSidebar();

        // Find the last assistant message to display
        const lastAssistantMsg = conversationHistory.slice().reverse().find(m => m.role === 'assistant');
        
        form.classList.add('hidden');
        statusPanel.classList.add('hidden');
        resultsPanel.classList.remove('hidden');

        if (lastAssistantMsg) {
            // Strip internal thought for rendering
            const thoughtEndToken = "</internal_thought>";
            let textToRender = lastAssistantMsg.content;
            if (textToRender.includes(thoughtEndToken)) {
                textToRender = textToRender.split(thoughtEndToken)[1].trimStart();
            }
            textToRender = textToRender.replace(/```markdown|```/g, '');
            
            window.lastGeneratedItinerary = textToRender;
            document.getElementById('itinerary-content').innerHTML = marked.parse(textToRender);
        } else {
            document.getElementById('itinerary-content').innerHTML = "<p>No itinerary generated yet.</p>";
        }
    }

    function deleteChat(id) {
        let chats = getChats();
        chats = chats.filter(c => c._id !== id);
        saveChats(chats);
        
        if (currentChatId === id) {
            document.getElementById('new-chat-btn').click();
        } else {
            loadSidebar();
        }
    }

    document.getElementById('new-chat-btn').addEventListener('click', () => {
        currentChatId = null;
        conversationHistory = [];
        
        resultsPanel.classList.add('hidden');
        statusPanel.classList.add('hidden');
        form.classList.remove('hidden');
        document.getElementById('user-prompt').value = '';
        
        loadSidebar(); // Update active class naturally
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to completely delete all saved trips? This cannot be undone.")) {
            localStorage.removeItem('tripChats');
            document.getElementById('new-chat-btn').click();
        }
    });

    // Initial Load
    loadSidebar();

    // --- 2. Form Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = document.getElementById('user-prompt').value;
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

        conversationHistory = [
            { role: "user", content: prompt }
        ];

        // Give it a generic title based on string slice and save empty chat
        const shortTitle = userInput.substring(0, 30) + (userInput.length > 30 ? "..." : "");
        currentChatId = Date.now().toString(); // unique ID
        
        let chats = getChats();
        chats.push({
            _id: currentChatId,
            title: shortTitle,
            messages: conversationHistory,
            createdAt: Date.now()
        });
        saveChats(chats);
        loadSidebar();

        await runAgenticWorkflow();
    });

    document.getElementById('follow-up-btn').addEventListener('click', async () => {
        const followUpInput = document.getElementById('follow-up-prompt');
        const followUpText = followUpInput.value.trim();
        if (!followUpText) return;

        followUpInput.value = ""; // Clear input UI
        
        conversationHistory.push({
            role: "user",
            content: followUpText + "\n\nPlease use <internal_thought> again to reason about how to apply these changes, then provide the FULL updated itinerary."
        });

        await runAgenticWorkflow();
    });

    function updateAgentStep(stepNum, status, textMessage) {
        statusMessage.textContent = textMessage;
        const stepEl = document.getElementById(`step-${stepNum}`);
        if (stepEl) {
            stepEl.className = status;
        }
    }

    async function streamGenerateAPI(messages, onChunk) {
        const response = await fetch(HF_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_KEY}`,
                "Content-Type": "application/json",
                "Accept": "text/event-stream"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                max_tokens: 8192,
                temperature: 0.7,
                stream: true
            })
        });

        if (!response.ok) {
            let errorDetail = response.statusText;
            try {
                const errorJson = await response.clone().json();
                if (errorJson.error) {
                    errorDetail = errorJson.error;
                }
            } catch (e) {}
            throw new Error(`\n${errorDetail}`);
        }

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

    async function runAgenticWorkflow() {
        form.classList.add('hidden');
        resultsPanel.classList.add('hidden');
        statusPanel.classList.remove('hidden');

        [1, 2].forEach(n => {
            const step = document.getElementById(`step-${n}`);
            if (step) step.className = 'pending';
        });

        const consoleEl = document.getElementById('console-output');
        consoleEl.innerHTML = '';

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

        try {
            logSystem(`Initializing Orchestration...`);
            updateAgentStep(1, 'active', 'Architect: Executing Chain-of-Thought...');
            logSystem('Launching Agent [Generating Plan]...');

            let accumulatedText = "";
            let insideThought = false;
            let finalOutputAccumulator = "";
            let thoughtStartToken = "<internal_thought>";
            let thoughtEndToken = "</internal_thought>";

            appendToConsole('console-planner', '\\n[Agent Initialization]\\n', true);
            
            await streamGenerateAPI(conversationHistory, (chunk, fullText) => {
                accumulatedText += chunk;
                
                if (accumulatedText.includes(thoughtStartToken) && !accumulatedText.includes(thoughtEndToken)) {
                    if (!insideThought) {
                        insideThought = true;
                        updateAgentStep(1, 'active', 'Architect: Generating Chain-of-Thought...');
                    }
                    appendToConsole('console-planner', chunk);
                } else if (accumulatedText.includes(thoughtEndToken)) {
                    if (insideThought) {
                        insideThought = false;
                        updateAgentStep(1, 'completed', 'Architect: Chain-of-Thought completed.');
                        updateAgentStep(2, 'active', 'Synthesizer: Drafting Final Output...');
                        logSystem('Thinking complete. Switching to Synthesizer...');
                        
                        statusPanel.classList.add('hidden');
                        resultsPanel.classList.remove('hidden');
                        document.getElementById('itinerary-content').innerHTML = "<p><em>Synthesizer is compiling your meticulously planned itinerary...</em></p>";
                    }
                    
                    const finalParts = accumulatedText.split(thoughtEndToken);
                    if (finalParts.length > 1) {
                        finalOutputAccumulator = finalParts[1].trimStart();
                        let cleanFinal = finalOutputAccumulator.replace(/```markdown|```/g, '');
                        document.getElementById('itinerary-content').innerHTML = marked.parse(cleanFinal);
                    }
                } else {
                    appendToConsole('console-system', chunk);
                }
            });

            // Once finished, record assistant's total response.
            conversationHistory.push({
                role: "assistant",
                content: accumulatedText
            });

            // Save to localStorage
            saveCurrentChat();

            updateAgentStep(2, 'completed', 'Synthesizer: Itinerary finalized.');
            window.lastGeneratedItinerary = finalOutputAccumulator;

        } catch (error) {
            console.error(error);
            logSystem(`CRITICAL ORCHESTRATION ERROR: ${error.message}`);
            statusMessage.textContent = "An error occurred. Check the Agent Console.";
            statusMessage.style.color = "#f85149";
        }
    }

    // --- 5. Reset & Download ---
    document.getElementById('reset-btn').addEventListener('click', () => {
        document.getElementById('new-chat-btn').click();
    });

    document.getElementById('download-btn').addEventListener('click', () => {
        if (!window.lastGeneratedItinerary) return;

        const btn = document.getElementById('download-btn');
        const originalText = btn.innerText;
        btn.innerText = "Generating PDF...";
        btn.disabled = true;

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

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            btn.innerText = originalText;
            btn.disabled = false;
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 500);
    });

});
