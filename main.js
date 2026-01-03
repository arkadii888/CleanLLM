import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    repeatPenalty: 1.1,
    stop: ["<|im_end|>", "<|im_start|>", "user:", "model:", "</s>", "<|eot_id|>"],
    systemPrompt: "You are a helpful assistant. Answer concisely."
};

const CHATS_DIR = path.join(app.getPath('userData'), 'chats');
const MODEL_PATH = path.join(__dirname, "models", "gpt-oss-20b-MXFP4.gguf");
const MODEL_CONTEXT_SIZE = 4096;
const CHARS_PER_TOKEN = 3;

let win;
let aiEngine = null;
let model = null;
let context = null;
let sequence = null;
let chatSession = null;
let activeChatId = null;
let isQuitting = false;
let isProcessing = false;

if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });
const getChatPath = (chatId) => path.join(CHATS_DIR, `${chatId}.json`);

function loadAllChats() {
    try {
        const files = fs.readdirSync(CHATS_DIR).filter(file => file.endsWith('.json'));
        return files.map(f => {
            try { return JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf-8')); }
            catch { return null; }
        }).filter(c => c !== null).sort((a, b) => b.timestamp - a.timestamp);
    } catch { return []; }
}

function loadChat(id) {
    const p = getChatPath(id);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}

function saveChat(chat) {
    const p = getChatPath(chat.id);
    chat.timestamp = Date.now();
    fs.writeFileSync(p, JSON.stringify(chat, null, 2));
    if (win && !win.isDestroyed()) win.webContents.send('history-update', loadAllChats());
}

function getContextWindow(messages) {
    const MAX_HISTORY_CHARS = Math.floor(MODEL_CONTEXT_SIZE * 0.7 * CHARS_PER_TOKEN);
    let totalChars = 0;
    const cleanHistory = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (totalChars + msg.content.length > MAX_HISTORY_CHARS) break;
        cleanHistory.unshift(msg);
        totalChars += msg.content.length;
    }
    return { history: cleanHistory, charsUsed: totalChars };
}

async function initAIEngine() {
    if (!fs.existsSync(MODEL_PATH)) {
        console.error(`CRITICAL: Model file not found at ${MODEL_PATH}`);
        return;
    }

    try {
        console.log("System: Init GPU...");
        aiEngine = await getLlama({ gpu: true });
        model = await aiEngine.loadModel({ modelPath: MODEL_PATH, gpuLayers: 99 });
        console.log("System: GPU OK.");
    } catch (gpuError) {
        console.warn("System: Switch to CPU...");
        aiEngine = await getLlama({ gpu: false });
        model = await aiEngine.loadModel({ modelPath: MODEL_PATH, gpuLayers: 0 });
    }

    context = await model.createContext({
        batchSize: 2048,
        contextSize: MODEL_CONTEXT_SIZE
    });
    sequence = context.getSequence();
    console.log("System: AI Engine Ready.");
}

async function cleanupAndExit() {
    if (isQuitting) return;
    isQuitting = true;
    try {
        if (chatSession) chatSession.dispose();
        if (context) await context.dispose();
        if (model) model.dispose();
    } catch (e) { console.error(e); }
    finally { app.exit(0); }
}

const createWindow = () => {
    win = new BrowserWindow({
        width: 1200, height: 800,
        backgroundColor: '#303446',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon-transparent.ico' : 'icon-transparent.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });
    win.setMenu(null);
    win.loadURL('http://localhost:5173');
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) shell.openExternal(url);
        return { action: 'deny' };
    });
};

app.whenReady().then(async () => {
    await initAIEngine();
    createWindow();
});

app.on('before-quit', (e) => { e.preventDefault(); cleanupAndExit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('history-get', () => loadAllChats());
ipcMain.handle('history-create', () => {
    const newChat = { id: crypto.randomUUID(), title: 'New Chat', timestamp: Date.now(), messages: [] };
    saveChat(newChat);
    return newChat;
});
ipcMain.handle('history-delete', (e, id) => {
    const p = getChatPath(id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    if (activeChatId === id) { activeChatId = null; if (chatSession) { chatSession.dispose(); chatSession = null; } }
    return loadAllChats();
});

ipcMain.on('chat-start', async (event, { prompt, chatId }) => {
    if (isProcessing || !model || !context || !sequence) {
        if (win && !win.isDestroyed()) win.webContents.send('chat-done');
        return;
    }

    const currentChat = loadChat(chatId);
    if (!currentChat) return;

    isProcessing = true;

    try {
        const { history: safeHistory, charsUsed } = getContextWindow(currentChat.messages);
        const estimatedUsedTokens = Math.ceil((charsUsed + prompt.length) / CHARS_PER_TOKEN);
        let maxTokensForAnswer = MODEL_CONTEXT_SIZE - estimatedUsedTokens - 100;
        if (maxTokensForAnswer < 200) maxTokensForAnswer = 200;

        if (activeChatId !== chatId || !chatSession) {
            if (chatSession) { chatSession.dispose(); chatSession = null; }

            chatSession = new LlamaChatSession({
                contextSequence: sequence,
                autoDisposeSequence: false,
                systemPrompt: DEFAULT_CONFIG.systemPrompt
            });

            const llamaHistory = safeHistory.map(msg => ({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: [{ type: "text", text: msg.content }]
            }));
            chatSession.setChatHistory(llamaHistory);
            activeChatId = chatId;
        }

        currentChat.messages.push({ role: 'user', content: prompt });
        if (currentChat.messages.length === 1)
            currentChat.title = prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '');
        saveChat(currentChat);

        let fullResponse = "";

        await chatSession.prompt(prompt, {
            temperature: DEFAULT_CONFIG.temperature,
            topK: DEFAULT_CONFIG.topK,
            topP: DEFAULT_CONFIG.topP,
            repeatPenalty: DEFAULT_CONFIG.repeatPenalty,
            maxTokens: maxTokensForAnswer,
            stop: DEFAULT_CONFIG.stop,

            onTextChunk: (chunk) => {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('chat-token', chunk);
                    fullResponse += chunk;
                }
            }
        });

        const freshChat = loadChat(chatId);
        if (freshChat) {
            freshChat.messages.push({ role: 'ai', content: fullResponse });
            saveChat(freshChat);
        }

    } catch (e) {
        console.error("Inference Error:", e);
        if (win) win.webContents.send('chat-error', e.message);
    } finally {
        isProcessing = false;
        if (win) win.webContents.send('chat-done');
    }
});