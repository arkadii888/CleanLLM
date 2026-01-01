import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Hello! I am CleanLLM. Ready to assist you.' }
    ]);
    const [input, setInput] = useState('');

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = () => {
        if (!input.trim()) return;

        setMessages(prev => [...prev, { role: 'user', content: input }]);
        const currentInput = input;
        setInput('');

        setTimeout(() => {
            setMessages(prev => [...prev, { role: 'ai', content: `I received your message: "${currentInput}"` }]);
        }, 500);
    };

    return (
        <div className="app-container">
            <div className="chat-area">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`message-wrapper ${msg.role === 'user' ? 'user' : 'ai'}`}
                    >
                        <div className={`message-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                            {msg.content}
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
                    placeholder="Type a message..."
                />
                <button className="send-button" onClick={sendMessage}>
                    SEND
                </button>
            </div>
        </div>
    );
}

export default App;