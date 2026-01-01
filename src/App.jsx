import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './Sidebar';
import MarkdownRenderer from './MarkdownRenderer';

function App() {
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'System initialized. Ready to chat.' }
    ]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!window.electronAPI) return;

        const removeTokenListener = window.electronAPI.onToken((token) => {
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];

                if (lastMsg.role === 'ai') {
                    lastMsg.content += token;
                    return newMessages;
                } else {
                    return [...prev, { role: 'ai', content: token }];
                }
            });
        });

        const removeDoneListener = window.electronAPI.onDone(() => {
            setIsGenerating(false);
        });

        return () => {
        };
    }, []);

    const sendMessage = () => {
        if (!input.trim() || isGenerating) return;

        const userText = input;

        setMessages(prev => [
            ...prev,
            { role: 'user', content: userText },
            { role: 'ai', content: '' }
        ]);

        setInput('');
        setIsGenerating(true);

        if (window.electronAPI) {
            window.electronAPI.sendPrompt(userText);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'row', width: '100vw', height: '100vh' }}>

            <Sidebar
                isCollapsed={isSidebarCollapsed}
                toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />

            <div className="app-container" style={{ flex: 1, position: 'relative' }}>
                <div className="chat-area">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`message-wrapper ${msg.role === 'user' ? 'user' : 'ai'}`}
                        >
                            {(msg.content || (isGenerating && index === messages.length - 1)) && (
                                <div className={`message-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                                    {msg.role === 'ai' ? (
                                        <MarkdownRenderer content={msg.content} />
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                            )}
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
                        placeholder={isGenerating ? "AI is thinking..." : "Type a message..."}
                        disabled={isGenerating}
                    />
                    <button
                        className="send-button"
                        onClick={sendMessage}
                        disabled={isGenerating}
                        style={{ opacity: isGenerating ? 0.6 : 1, cursor: isGenerating ? 'default' : 'pointer' }}
                    >
                        {isGenerating ? '...' : 'SEND'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;