import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

export interface ChatItem {
  id: string;
  senderToken: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionToken: string;
  displayName: string;
  messages: ChatItem[];
  onSendMessage: (text: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  currentSessionToken,
  displayName,
  messages,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '340px',
        background: 'var(--bg-drawer)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--bg-card-border)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-drawer)',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--bg-card-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <MessageSquare size={20} color="var(--primary)" /> Meeting Chat
        </h3>
        <button className="btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
          <X size={16} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '32px' }}>
            No messages yet. Say hello to everyone!
          </div>
        ) : (
          messages.map((m) => {
            const isYou = m.senderToken === currentSessionToken;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isYou ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'flex', gap: '6px' }}>
                  <strong>{isYou ? 'You' : m.senderName}</strong>
                  <span>{formatTime(m.timestamp)}</span>
                </div>

                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: isYou ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: isYou
                      ? 'linear-gradient(135deg, var(--primary), var(--primary-hover))'
                      : 'var(--bg-item)',
                    color: isYou ? '#ffffff' : 'var(--text-main)',
                    border: isYou ? 'none' : '1px solid var(--bg-card-border)',
                    fontSize: '0.9rem',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Controls */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--bg-card-border)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          background: 'var(--bg-drawer)',
        }}
      >
        <input
          type="text"
          className="custom-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={{ flex: 1 }}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          style={{ padding: '12px', borderRadius: '50%', width: '44px', height: '44px', justifyContent: 'center' }}
          title="Send Message"
        >
          <Send size={18} />
        </button>
      </div>
    </aside>
  );
};
