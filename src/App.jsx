import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './Sidebar';
import MarkdownRenderer from './MarkdownRenderer';

const MemoizedMarkdown = React.memo(MarkdownRenderer);

function App() {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const activeChatIdRef = useRef(null);
    const messagesEndRef = useRef(null);
    const chunkBuffer = useRef('');

    useEffect(() => {
        activeChatIdRef.current = activeChatId;
        scrollToBottom();
        setInput('');
    }, [activeChatId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (!window.electronAPI) return;

        const loadChats = async () => {
            const history = await window.electronAPI.getHistory();
            setChats(history);
            if (history.length > 0 && !activeChatIdRef.current) {
                setActiveChatId(history[0].id);
            } else if (history.length === 0) {
                handleNewChat();
            }
        };
        loadChats();

        const cleanupHistory = window.electronAPI.onHistoryUpdate((updatedChats) => {
            if (!isGenerating) setChats(updatedChats);
        });

        const cleanupToken = window.electronAPI.onToken((token) => {
            chunkBuffer.current += token;
        });

        const cleanupDone = window.electronAPI.onDone(() => {
            setIsGenerating(false);
            forceUpdateChats();
        });

        return () => {
            cleanupHistory();
            cleanupToken();
            cleanupDone();
        };
    }, [isGenerating]);

    useEffect(() => {
        let interval = null;

        if (isGenerating) {
            interval = setInterval(() => {
                if (chunkBuffer.current) {
                    forceUpdateChats();
                }
            }, 50);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isGenerating]);

    const forceUpdateChats = () => {
        if (!chunkBuffer.current && !isGenerating) return;

        const chunk = chunkBuffer.current;
        chunkBuffer.current = '';

        setChats(prevChats => {
            return prevChats.map(chat => {
                if (chat.id === activeChatIdRef.current) {
                    const newMessages = [...chat.messages];
                    const lastMsgIndex = newMessages.length - 1;

                    if (lastMsgIndex >= 0) {
                        const lastMsg = newMessages[lastMsgIndex];
                        if (lastMsg.role === 'ai') {
                            newMessages[lastMsgIndex] = {
                                ...lastMsg,
                                content: lastMsg.content + chunk
                            };
                        } else {
                            newMessages.push({ role: 'ai', content: chunk });
                        }
                    } else {
                        newMessages.push({ role: 'ai', content: chunk });
                    }
                    return { ...chat, messages: newMessages };
                }
                return chat;
            });
        });

        if (chunk) scrollToBottom();
    };

    const handleNewChat = async () => {
        if (isGenerating) return;
        const newChat = await window.electronAPI.createChat();
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
    };

    const handleSelectChat = (id) => {
        if (isGenerating) return;
        setActiveChatId(id);
    };

    const sendMessage = () => {
        if (!input.trim() || isGenerating || !activeChatId) return;

        const userText = input;
        setInput('');
        setIsGenerating(true);
        chunkBuffer.current = '';

        setChats(prev => prev.map(chat => {
            if (chat.id === activeChatId) {
                return {
                    ...chat,
                    messages: [
                        ...chat.messages,
                        { role: 'user', content: userText },
                        { role: 'ai', content: '' }
                    ]
                };
            }
            return chat;
        }));

        window.electronAPI.sendPrompt(userText, activeChatId);
    };

    const activeMessages = activeChatId
        ? chats.find(c => c.id === activeChatId)?.messages || []
        : [];

    return (
        <div style={{ display: 'flex', flexDirection: 'row', width: '100vw', height: '100vh' }}>
            <Sidebar
                isCollapsed={isSidebarCollapsed}
                toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                chats={chats}
                activeChatId={activeChatId}
                onSelectChat={handleSelectChat}
                onNewChat={handleNewChat}
            />

            <div className="app-container" style={{ flex: 1, position: 'relative' }}>
                <div className="chat-area">
                    {activeMessages.length === 0 && (
                        <div className="empty-state">
                            <h2 style={{ fontSize: '24px', fontWeight: 600 }}>CleanLLM</h2>
                            <p>Ready to chat.</p>
                        </div>
                    )}

                    {activeMessages.map((msg, index) => (
                        <div key={index} className={`message-wrapper ${msg.role === 'user' ? 'user' : 'ai'}`}>
                            <div className={`message-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                                {msg.role === 'ai' ? (
                                    <MemoizedMarkdown content={msg.content} />
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="input-area">
                    <input
                        className="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder={isGenerating ? "Processing..." : "Type a message..."}
                        disabled={isGenerating}
                        autoFocus
                    />
                    <button className="send-button" onClick={sendMessage} disabled={isGenerating}>
                        {isGenerating ? '...' : 'SEND'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;