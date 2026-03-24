# 🗺️ trip-planner-agent

An intelligent, sleek, and highly dynamic web application that uses advanced Agentic AI workflows to generate meticulously planned travel itineraries from a single natural language prompt.

Instead of filling out tedious forms, simply describe your dream trip—where you want to go, your travel style, and your budget—and watch the AI architect the entire journey in real-time.

## ✨ Features

- **Single-Prompt Generation:** Drive the entire application via one intuitive text box. The AI extracts dates, locations, budgets, and constraints directly from natural language.
- **Live Chain-of-Thought Streaming:** A custom "Agent Console" visually streams the AI's internal thought process in real-time, simulating how an expert travel agent or architect plans out transport logistics, budget viability, and daily pacing.
- **Ultra-Fast Single Pass Optimization:** We've rewritten the generation pipeline to combine previous multi-step LLM calls into a single, high-speed streaming generation, drastically reducing wait times.
- **High-Fidelity Output:** Fully formatted markdown output covering a trip summary, day-by-day itineraries, exact cost breakdowns, and personalized travel tips.
- **Premium Dark Mode UI:** A gorgeous, glassmorphic UI styled from scratch using vanilla CSS and Google "Inter" fonts, with elegant macro-animations representing the agent's computing status.
- **Native PDF Export:** Flawlessly save your entire rendered itinerary locally via the browser's native print engine using a specialized hidden-iframe technique.

## 🛠️ Technology Stack

This project deliberately avoids heavy frameworks to showcase powerful AI integration using fundamental web technologies:
- **Frontend Structure:** HTML5
- **Styling:** Vanilla CSS3 (Custom Variables, Flexbox, Animations)
- **Logic & API Integration:** Vanilla JavaScript (ES6+)
- **AI Brain:** [Hugging Face Inference API](https://huggingface.co/) running the powerful `google/gemma-3-27b-it` model
- **Transformers/Parsers:** `marked.js`

## 🚀 Getting Started

1. Clone or download this repository to your local machine.
2. The project relies on no local build engines! Simply double-click `index.html` to open it in any modern web browser.
3. Type a prompt like:
   > *"Plan a 5-day solo trip to Tokyo next month focusing on anime culture and amazing street food, with a medium budget. Detail the transportation."*
4. Click **Plan My Trip** and watch the magic happen in the Agent Console.


*Built to showcase the power of Agentic AI Reasoning Loops directly in the browser.*
