const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendPrompt: (message) => ipcRenderer.send('chat-start', message),
    onToken: (callback) => ipcRenderer.on('chat-token', (_event, token) => callback(token)),
    onDone: (callback) => ipcRenderer.on('chat-done', (_event) => callback())
});