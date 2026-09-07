import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ConversationMessage } from './types';
import 'highlight.js/styles/github-dark.css';

const VISIBLE_MESSAGE_LIMIT = 80;

const MARKDOWN_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [[rehypeHighlight, { detect: true, ignoreMissing: true }]] as const;

function roleLabel(role: ConversationMessage['role']): string {
  if (role === 'assistant') return 'Assistant';
  if (role === 'user') return 'You';
  if (role === 'tool') return 'Tool';
  return 'System';
}

function MessageListView(props: { messages: ConversationMessage[] }): React.ReactElement {
  const visibleMessages = props.messages.slice(-VISIBLE_MESSAGE_LIMIT);

  return (
    <div className="messageList" aria-label="Conversation">
      {visibleMessages.length === 0 && (
        <div className="emptyConversation">
          <div className="emptyGlyph" aria-hidden="true">
            01
          </div>
          <h2>Start a conversation</h2>
          <p>Ask 0-1 CLI to inspect, plan, edit, or explain. Agent activity and file changes stream in live.</p>
        </div>
      )}
      {visibleMessages.map((message) => (
        <article className={`messageRow ${message.role}`} key={message.id}>
          {message.role === 'assistant' && (
            <div className="messageAvatar brand" aria-hidden="true">
              ✶
            </div>
          )}
          <div className="messageBody">
            <header>
              <strong className={message.streaming ? 'streamingLabel' : undefined}>{roleLabel(message.role)}</strong>
              {message.meta && <span>{message.meta}</span>}
            </header>
            {message.role === 'user' ? (
              <div className="userText">{message.content}</div>
            ) : (
              <div className="markdownBody">
                <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} rehypePlugins={REHYPE_PLUGINS as never}>
                  {message.content || (message.streaming ? '' : '')}
                </ReactMarkdown>
                {message.streaming && <span className="streamCaret" aria-hidden="true" />}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export const MessageList = React.memo(MessageListView);
