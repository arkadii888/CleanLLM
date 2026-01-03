const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendPrompt: (prompt, chatId) => ipcRenderer.send('chat-start', { prompt, chatId }),
    stopGeneration: () => ipcRenderer.send('chat-stop'),

    onToken: (callback) => {
        const subscription = (_event, token) => callback(token);
        ipcRenderer.on('chat-token', subscription);
        return () => ipcRenderer.removeListener('chat-token', subscription);
    },
    onDone: (callback) => {
        const subscription = (_event) => callback();
        ipcRenderer.on('chat-done', subscription);
        return () => ipcRenderer.removeListener('chat-done', subscription);
    },
    onHistoryUpdate: (callback) => {
        const subscription = (_event, chats) => callback(chats);
        ipcRenderer.on('history-update', subscription);
        return () => ipcRenderer.removeListener('history-update', subscription);
    },
    getHistory: () => ipcRenderer.invoke('history-get'),
    createChat: () => ipcRenderer.invoke('history-create'),
    deleteChat: (chatId) => ipcRenderer.invoke('history-delete', chatId),
});