import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let aiEngine = null;
let model = null;
let context = null;
let chatSession = null;
let isQuitting = false;


async function initAIEngine() {
    const modelPath = path.join(__dirname, "models", "Qwen3-VL-4B-Instruct-Q4_K_M.gguf");

    if (!fs.existsSync(modelPath)) {
        console.error(`CRITICAL: Model file not found at ${modelPath}`);
        return;
    }

    try {
        console.log("System: Attempting to initialize with GPU (CUDA/Metal)...");

        aiEngine = await getLlama({ gpu: true });
        model = await aiEngine.loadModel({
            modelPath: modelPath,
            gpuLayers: 99
        });

        console.log("System: SUCCESS! Running on GPU.");

    } catch (gpuError) {
        console.warn("System: ⚠️ GPU initialization failed. Switching to CPU mode.");
        console.error("System: Debug info:", gpuError.message);

        try {
            console.log("System: Initializing with CPU only...");

            aiEngine = await getLlama({ gpu: false });
            model = await aiEngine.loadModel({
                modelPath: modelPath,
                gpuLayers: 0
            });

            console.log("System: SUCCESS! Running on CPU.");

        } catch (cpuError) {
            console.error("System: CRITICAL FATAL ERROR. Could not load on CPU either.");
            console.error(cpuError);
            return;
        }
    }

    try {
        context = await model.createContext({
            batchSize: 2048,
            contextSize: 4096
        });

        chatSession = new LlamaChatSession({
            contextSequence: context.getSequence()
        });

        console.log("System: Chat Session is ready!");

    } catch (ctxError) {
        console.error("System: Error creating context:", ctxError);
    }
}

async function cleanupAndExit() {
    if (isQuitting) return;
    isQuitting = true;

    console.log("System: Graceful shutdown initiated...");

    try {
        chatSession = null;

        if (context) {
            console.log("System: Disposing context (releasing VRAM/RAM)...");
            await context.dispose();
            context = null;
        }

        if (model) {
            if (model.dispose) {
                console.log("System: Disposing model...");
                model.dispose();
            }
            model = null;
        }

        aiEngine = null;
        console.log("System: Cleanup complete.");

    } catch (e) {
        console.error("System: Error during cleanup:", e);
    } finally {
        console.log("System: Bye!");
        app.exit(0);
    }
}

const createWindow = () => {
    win = new BrowserWindow({
        width: 1000,
        height: 1000,
        backgroundColor: '#303446',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon-transparent.ico' : 'icon-transparent.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.setMenu(null);
    win.loadURL('http://localhost:5173');
};

app.whenReady().then(async () => {
    await initAIEngine();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', (e) => {
    e.preventDefault();
    cleanupAndExit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('chat-start', async (event, userPrompt) => {
    if (!chatSession) {
        console.error("System: Chat session not initialized.");
        if (win) win.webContents.send('chat-token', " [System: AI is still loading...] ");
        if (win) win.webContents.send('chat-done');
        return;
    }

    try {
        await chatSession.prompt(userPrompt, {
            onTextChunk: (chunk) => {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('chat-token', chunk);
                }
            }
        });

        if (win && !win.isDestroyed()) {
            win.webContents.send('chat-done');
        }

    } catch (e) {
        console.error("Inference Error:", e);
        if (win) win.webContents.send('chat-token', " [System Error] ");
        if (win) win.webContents.send('chat-done');
    }
});