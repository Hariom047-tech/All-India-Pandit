import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/pandit-chat.css';

// API base
const API = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';

interface Message {
  id: string;
  role: 'user' | 'pandit';
  content: string;
  timestamp: Date;
  sourcesUsed?: string[];
}

export default function PanditChat() {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Generate unique message ID
  const genId = () => Math.random().toString(36).slice(2, 10);
  
  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Fetch greeting on mount
  useEffect(() => {
    fetchGreeting();
  }, []);
  
  async function fetchGreeting() {
    try {
      const res = await fetch(`${API}/chat/greeting`);
      const data = await res.json();
      setMessages([{
        id: genId(),
        role: 'pandit',
        content: data.greeting,
        timestamp: new Date()
      }]);
      setSuggestions(data.suggestions || []);
    } catch {
      // Fallback greeting
      setMessages([{
        id: genId(),
        role: 'pandit',
        content: '🙏 Jai Maa Baglamukhi! Main Pandit Ji hun. Bataiye aapko kya samasya hai?',
        timestamp: new Date()
      }]);
      setSuggestions([
        'Ghar mein bahut kalesh hota hai',
        'Court case chal raha hai',
        'Business mein nuksan ho raha hai',
        'Shaadi mein deri ho rahi hai',
        'Nazar lag gayi hai'
      ]);
    }
  }
  
  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;
    
    // Add user message
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: msg,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSuggestions([]); // Hide suggestions after first message
    setIsLoading(true);
    
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId })
      });
      const data = await res.json();
      
      if (data.sessionId) setSessionId(data.sessionId);
      
      const panditMsg: Message = {
        id: genId(),
        role: 'pandit',
        content: data.response || data.error || 'Kshama karein, koi samasya aa gayi.',
        timestamp: new Date(),
        sourcesUsed: data.sourcesUsed
      };
      setMessages(prev => [...prev, panditMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: genId(),
        role: 'pandit',
        content: 'Kshama karein, abhi network mein kuch samasya hai. Kripya thodi der baad prayaas karein. 🙏',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }
  
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
  
  // Format message content with basic markdown
  function formatContent(text: string) {
    // Bold **text**
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br/>');
    // Bullet points
    formatted = formatted.replace(/^- (.*)/gm, '• $1');
    return formatted;
  }
  
  // Source name mapping
  const sourceLabels: Record<string, string> = {
    'problems-solutions': '🎯 Problem Guide',
    'herbs-encyclopedia': '🌿 Jadi-Buti',
    'puja-vidhi-guide': '🙏 Puja Vidhi',
    'diy-remedies': '🏠 Home Remedy',
    'baglamukhi-knowledge': '🔱 Baglamukhi',
    'real-experiences': '⭐ Real Story',
    'bhagavad-gita': '📖 Bhagavad Gita'
  };
  
  // Topic buttons for sidebar
  const topics = [
    { emoji: '🔱', label: 'Maa Baglamukhi' },
    { emoji: '⚖️', label: 'Court Case' },
    { emoji: '💼', label: 'Business' },
    { emoji: '💍', label: 'Marriage' },
    { emoji: '🏥', label: 'Health' },
    { emoji: '👨‍👩‍👧', label: 'Family' },
    { emoji: '🛡️', label: 'Protection' },
    { emoji: '🏠', label: 'Vastu' },
    { emoji: '🪐', label: 'Graha Dosh' },
    { emoji: '📿', label: 'Mantra' }
  ];
  
  return (
    <div className="pc-chat">
      {/* Sacred Background */}
      <div className="pc-chat__sacred-bg" />
      
      {/* Mobile header */}
      <header className="pc-chat__header">
        <button className="pc-chat__menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <div className="pc-chat__header-info">
          <div className="pc-chat__avatar pc-chat__avatar--sm">
            <span>ॐ</span>
          </div>
          <div>
            <h1 className="pc-chat__header-name">Pandit Ji AI</h1>
            <span className="pc-chat__header-status">
              {isLoading ? 'Soch rahe hain...' : 'Online • 24/7 Available'}
            </span>
          </div>
        </div>
      </header>
      
      {/* Sidebar */}
      <aside className={`pc-chat__sidebar ${sidebarOpen ? 'pc-chat__sidebar--open' : ''}`}>
        <div className="pc-chat__sidebar-profile">
          <div className="pc-chat__avatar pc-chat__avatar--lg">
            <span>ॐ</span>
            <div className="pc-chat__avatar-pulse" />
          </div>
          <h2 className="pc-chat__sidebar-name">Pandit Ji AI</h2>
          <p className="pc-chat__sidebar-title">🪔 25+ Varsh ka Anubhav</p>
          <p className="pc-chat__sidebar-desc">Vedic Gyan • Tantra Vidya • Jyotish<br/>Havan • Puja • Samasya Samadhan</p>
        </div>
        
        <div className="pc-chat__sidebar-divider" />
        
        <h3 className="pc-chat__sidebar-heading">Vishay Chunein</h3>
        <div className="pc-chat__topics">
          {topics.map(t => (
            <button
              key={t.label}
              className="pc-chat__topic-btn"
              onClick={() => { sendMessage(`${t.label} ke baare mein bataiye`); setSidebarOpen(false); }}
            >
              <span className="pc-chat__topic-emoji">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        
        <div className="pc-chat__sidebar-divider" />
        
        <div className="pc-chat__sidebar-footer">
          <p>🔒 Aapki baatcheet puri tarah se surakshit hai</p>
          <p className="pc-chat__sidebar-brand">Powered by All India Pandit Connect</p>
        </div>
      </aside>
      
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && <div className="pc-chat__overlay" onClick={() => setSidebarOpen(false)} />}
      
      {/* Main chat area */}
      <main className="pc-chat__main">
        <div className="pc-chat__messages">
          <AnimatePresence>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                className={`pc-chat__msg pc-chat__msg--${msg.role}`}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                {msg.role === 'pandit' && (
                  <div className="pc-chat__msg-avatar">
                    <span>ॐ</span>
                  </div>
                )}
                <div className={`pc-chat__bubble pc-chat__bubble--${msg.role}`}>
                  <div 
                    className="pc-chat__bubble-text"
                    dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                  />
                  {msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                    <div className="pc-chat__sources">
                      {msg.sourcesUsed.map(s => (
                        <span key={s} className="pc-chat__source-badge">
                          {sourceLabels[s] || s}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="pc-chat__time">
                    {msg.timestamp.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Typing indicator */}
          {isLoading && (
            <motion.div
              className="pc-chat__msg pc-chat__msg--pandit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="pc-chat__msg-avatar"><span>ॐ</span></div>
              <div className="pc-chat__bubble pc-chat__bubble--pandit pc-chat__typing">
                <div className="pc-chat__typing-dots">
                  <span /><span /><span />
                </div>
                <span className="pc-chat__typing-text">Pandit Ji soch rahe hain...</span>
              </div>
            </motion.div>
          )}
          
          <div ref={chatEndRef} />
        </div>
        
        {/* Suggestions */}
        {suggestions.length > 0 && messages.length <= 1 && (
          <motion.div 
            className="pc-chat__suggestions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="pc-chat__suggestions-label">✨ Ye sawal pooch sakte hain:</p>
            <div className="pc-chat__suggestions-grid">
              {suggestions.map((s, i) => (
                <motion.button
                  key={i}
                  className="pc-chat__suggestion-chip"
                  onClick={() => sendMessage(s)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.08 }}
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        
        {/* Input bar */}
        <div className="pc-chat__input-bar">
          <div className="pc-chat__input-wrap">
            <textarea
              ref={inputRef}
              className="pc-chat__input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Apni samasya yahan likhein... 🙏"
              rows={1}
              maxLength={1000}
              disabled={isLoading}
            />
            <button
              className="pc-chat__send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor" />
              </svg>
            </button>
          </div>
          <p className="pc-chat__disclaimer">
            🔱 Pandit Ji AI shastra-aadharit margdarshan deta hai. Gambhir samasya mein visheshagya se bhi sampark karein.
          </p>
        </div>
      </main>
    </div>
  );
}
