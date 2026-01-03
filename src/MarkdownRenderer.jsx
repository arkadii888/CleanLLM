import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import './MarkdownRenderer.css';

const MarkdownRenderer = memo(({ content }) => {
    return (
        <div className="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');

                        if (!inline && match) {
                            return (
                                <div className="code-block-wrapper">
                                    <div className="code-header">
                                        <span>{match[1]}</span>
                                    </div>
                                    <SyntaxHighlighter
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                        {...props}
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                </div>
                            );
                        }

                        return (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    },
                    a: ({ node, ...props }) => (
                        <a target="_blank" rel="noopener noreferrer" {...props} />
                    )
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}, (prevProps, nextProps) => {
    return prevProps.content === nextProps.content;
});

export default MarkdownRenderer;