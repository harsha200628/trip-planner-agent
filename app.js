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

    function toggleResultElements(isRejected) {
        const header = resultsPanel.querySelector('h2');
        const followUp = document.getElementById('follow-up-section');
        const downloadBtn = document.getElementById('download-btn');
        if (isRejected) {
            if (header) header.classList.add('hidden');
            if (followUp) followUp.classList.add('hidden');
            if (downloadBtn) downloadBtn.classList.add('hidden');
        } else {
            if (header) header.classList.remove('hidden');
            if (followUp) followUp.classList.remove('hidden');
            if (downloadBtn) downloadBtn.classList.remove('hidden');
        }
    }

    function extractUserQuery(rawContent, msgIndex) {
        if (msgIndex === 0 && rawContent.includes("User Request:")) {
            const lines = rawContent.split('\n');
            const userReqLine = lines.find(l => l.startsWith("User Request:"));
            if (userReqLine) return userReqLine.replace("User Request:", "").trim();
        }
        if (rawContent.includes("CRITICAL INSTRUCTION:")) {
             return rawContent.split("\n\nCRITICAL INSTRUCTION:")[0].trim();
        }
        return rawContent.trim();
    }

    function renderChatFeed() {
        const container = document.getElementById('itinerary-content');
        container.innerHTML = '';
        
        conversationHistory.forEach((msg, index) => {
            const div = document.createElement('div');
            if (msg.role === 'user') {
                div.className = 'chat-message user-message';
                div.textContent = extractUserQuery(msg.content, index);
            } else if (msg.role === 'assistant') {
                div.className = 'chat-message assistant-message markdown-body';
                const thoughtEndToken = "</internal_thought>";
                let textToRender = msg.content;
                if (textToRender.includes(thoughtEndToken)) {
                    textToRender = textToRender.split(thoughtEndToken)[1].trimStart();
                }
                textToRender = textToRender.replace(/```markdown|```/g, '');
                div.innerHTML = marked.parse(textToRender);
            }
            container.appendChild(div);
        });
        
        // Auto scroll to bottom
        setTimeout(() => {
            document.querySelector('.main-content').scrollTop = document.querySelector('.main-content').scrollHeight;
        }, 50);
    }

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

        if (conversationHistory.length > 0) {
            let lastMsg = conversationHistory[conversationHistory.length - 1];
            let isRejection = lastMsg.role === 'assistant' && lastMsg.content.includes("This is a Trip Planner AI");
            toggleResultElements(isRejection);
            
            renderChatFeed();
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

CRITICAL INSTRUCTION: You are strictly a trip planner and travel architect. If the user asks for ANYTHING unrelated to travel, vacations, itineraries, or trips (e.g., coding, recipes, math, general knowledge), you MUST immediately reply EXACTLY with:
"This is a Trip Planner AI. I can only assist you with travel itineraries, trip planning, and vacation advice. Please ask me about a trip!"
DO NOT use an <internal_thought> block if you are rejecting the prompt.

CRITICAL INSTRUCTION 2: You are running in a strict token-limited environment. Keep your <internal_thought> EXTREMELY concise (under 50 words). Make your final output structured and impactful, but never bloated, to completely avoid mid-sentence cutoff!

IF the request IS about travel:
You MUST use an <internal_thought> block to think through the entire itinerary before you output the final markdown. Let's think step by step.
Format your output EXACTLY as follows:

<internal_thought>
- Constraints Analysis
- Realistic travel times and distances
- Budget Strategy (verify viability)
- Rough Daily Schedule
</internal_thought>

[FINAL OUTPUT HERE]
The final output MUST be beautifully formatted Markdown tailored to the user's request, including:
## 📋 Trip Summary
## 🗺️ Day-by-Day Itinerary (Highly detailed with time estimates and travel methods)
## 💰 Estimated Costs
## 💡 Travel Tips

Begin!`;

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
            content: followUpText + "\n\nCRITICAL INSTRUCTION: If the user is asking a specific question (e.g. 'what about flights?', 'cheaper hotels?', 'give me just day 1'), answer ONLY their specific question clearly. DO NOT regenerate the full itinerary unless specifically asked to. Use <internal_thought> first."
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
            } catch (e) { }
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
        toggleResultElements(false);

        try {
            renderChatFeed();
            
            let assistantDiv = document.createElement('div');
            assistantDiv.className = 'chat-message assistant-message markdown-body';
            assistantDiv.style.display = 'none';
            document.getElementById('itinerary-content').appendChild(assistantDiv);

            let accumulatedText = "";
            let insideThought = false;
            let finalOutputAccumulator = "";
            let thoughtStartToken = "<internal_thought>";
            let thoughtEndToken = "</internal_thought>";
            let rejectedPrompt = false;

            await streamGenerateAPI(conversationHistory, (chunk, fullText) => {
                accumulatedText += chunk;

                if (accumulatedText.includes("This is a Trip Planner AI") || rejectedPrompt) {
                    // Safe trip rejection path - no thought block needed
                    rejectedPrompt = true;
                    statusPanel.classList.add('hidden');
                    resultsPanel.classList.remove('hidden');
                    toggleResultElements(true);
                    
                    assistantDiv.style.display = 'block';
                    assistantDiv.innerHTML = marked.parse(accumulatedText);
                    finalOutputAccumulator = accumulatedText;
                } else if (accumulatedText.includes(thoughtStartToken) && !accumulatedText.includes(thoughtEndToken)) {
                    if (!insideThought) {
                        insideThought = true;
                        // Scroll to bottom so loader is visible
                        document.querySelector('.main-content').scrollTop = document.querySelector('.main-content').scrollHeight;
                    }
                } else if (accumulatedText.includes(thoughtEndToken)) {
                    if (insideThought) {
                        insideThought = false;
                        
                        statusPanel.classList.add('hidden');
                        resultsPanel.classList.remove('hidden');
                        assistantDiv.style.display = 'block';
                    }
                    
                    const finalParts = accumulatedText.split(thoughtEndToken);
                    if (finalParts.length > 1) {
                        finalOutputAccumulator = finalParts[1].trimStart();
                        let cleanFinal = finalOutputAccumulator.replace(/```markdown|```/g, '');
                        assistantDiv.innerHTML = marked.parse(cleanFinal);
                        
                        // Auto scroll down stream
                        document.querySelector('.main-content').scrollTop = document.querySelector('.main-content').scrollHeight;
                    }
                }
            });

            // Handle the boundary case where it rejected immediately but text matching delayed
            if (!rejectedPrompt && !accumulatedText.includes(thoughtEndToken)) {
                let isRejection = accumulatedText.includes("This is a Trip Planner AI");
                toggleResultElements(isRejection);
                statusPanel.classList.add('hidden');
                resultsPanel.classList.remove('hidden');
                
                assistantDiv.style.display = 'block';
                assistantDiv.innerHTML = marked.parse(accumulatedText);
                finalOutputAccumulator = accumulatedText;
            }

            // Once finished, record assistant's total response.
            conversationHistory.push({
                role: "assistant",
                content: accumulatedText
            });

            // Save to localStorage
            saveCurrentChat();

            window.lastGeneratedItinerary = finalOutputAccumulator;

        } catch (error) {
            console.error(error);
            document.getElementById('status-message').textContent = "An error occurred.";
            document.getElementById('status-message').style.color = "#f85149";
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
