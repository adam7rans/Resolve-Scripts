import React, { useState, useEffect, useRef } from 'react';
import { TranscriptData, parseTranscript } from '../lib/transcript';

interface CaptionsEditorProps {
  transcript: TranscriptData | null;
  onUpdate: (data: TranscriptData) => void;
}

export const CaptionsEditor: React.FC<CaptionsEditorProps> = ({ transcript, onUpdate }) => {
  const [localJson, setLocalJson] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // Sync local state when transcript changes from outside
  useEffect(() => {
    if (transcript) {
      setLocalJson(JSON.stringify(transcript, null, 2));
      setError(null);
    }
  }, [transcript]);

  // Update match count when search or JSON changes
  useEffect(() => {
    if (!searchTerm) {
      setMatchCount(0);
      setCurrentMatchIndex(-1);
      return;
    }
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = localJson.match(regex);
    setMatchCount(matches ? matches.length : 0);
    if (matches && matches.length > 0) {
      setCurrentMatchIndex(0);
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [searchTerm, localJson]);

  // Sync scroll between textarea and highlight div
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalJson(val);
    try {
      const parsed = JSON.parse(val);
      const validated = parseTranscript(parsed);
      onUpdate(validated);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renderHighlights = () => {
    if (!searchTerm) return localJson;

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = localJson.split(regex);
    let matchIdx = -1;

    return parts.map((part, i) => {
      if (regex.test(part)) {
        matchIdx++;
        const isCurrent = matchIdx === currentMatchIndex;
        return (
          <mark 
            key={i} 
            id={isCurrent ? 'current-search-match' : undefined}
            style={{ 
              background: isCurrent ? '#1f6feb' : '#1a3d6e', 
              color: '#fff', 
              borderRadius: 2,
              boxShadow: isCurrent ? '0 0 0 1px #fff' : 'none',
              zIndex: isCurrent ? 1 : 0,
              position: 'relative',
              padding: '1px 0'
            }}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  const navigateMatch = (dir: 1 | -1) => {
    if (matchCount === 0) return;
    let next = currentMatchIndex + dir;
    if (next < 0) next = matchCount - 1;
    if (next >= matchCount) next = 0;
    setCurrentMatchIndex(next);

    // Scroll the current match into view
    setTimeout(() => {
      const matchEl = document.getElementById('current-search-match');
      if (matchEl && highlightRef.current && textareaRef.current) {
        // We need to scroll BOTH the highlight div and the textarea
        const rect = matchEl.getBoundingClientRect();
        const containerRect = highlightRef.current.getBoundingClientRect();
        
        const relativeTop = rect.top - containerRect.top + highlightRef.current.scrollTop;
        const targetScroll = relativeTop - containerRect.height / 2;
        
        highlightRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
        textareaRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }, 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, minHeight: 400 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Search in JSON..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigateMatch(e.shiftKey ? -1 : 1);
              }
            }}
            style={{
              width: '100%',
              background: '#1a1a1a',
              border: '1px solid #333',
              color: '#eee',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 13,
              outline: 'none',
            }}
          />
          {searchTerm && (
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
               <span style={{ fontSize: 11, color: '#666', marginRight: 4 }}>
                {matchCount > 0 ? `${currentMatchIndex + 1}/${matchCount}` : '0/0'}
              </span>
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14 }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button 
            onClick={() => navigateMatch(-1)}
            disabled={matchCount === 0}
            style={{ 
              background: '#222', border: '1px solid #333', color: '#ccc', 
              padding: '4px 8px', borderRadius: 4, cursor: matchCount > 0 ? 'pointer' : 'default',
              opacity: matchCount > 0 ? 1 : 0.5
            }}
          >
            ↑
          </button>
          <button 
            onClick={() => navigateMatch(1)}
            disabled={matchCount === 0}
            style={{ 
              background: '#222', border: '1px solid #333', color: '#ccc', 
              padding: '4px 8px', borderRadius: 4, cursor: matchCount > 0 ? 'pointer' : 'default',
              opacity: matchCount > 0 ? 1 : 0.5
            }}
          >
            ↓
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, border: '1px solid #222', borderRadius: 4, overflow: 'hidden', background: '#050505' }}>
        <div
          ref={highlightRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            padding: 10,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            color: 'transparent',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: '1.5',
            pointerEvents: 'none',
            overflow: 'auto',
          }}
        >
          {renderHighlights()}
          {'\n\n'}
        </div>
        <textarea
          ref={textareaRef}
          value={localJson}
          onChange={handleChange}
          onScroll={handleScroll}
          spellCheck={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            padding: 10,
            background: 'transparent',
            color: '#ccc',
            border: 'none',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: '1.5',
            resize: 'none',
            outline: 'none',
            caretColor: '#fff',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflow: 'auto',
          }}
        />
      </div>

      {error && (
        <div style={{ color: '#f85149', fontSize: 11, padding: '4px 8px', background: 'rgba(248, 81, 73, 0.1)', borderRadius: 3 }}>
          Invalid JSON: {error}
        </div>
      )}
    </div>
  );
};
