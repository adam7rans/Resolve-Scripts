import React, { useEffect, useRef } from 'react';

export interface Toast {
  id: number;
  type: 'info' | 'success' | 'error' | 'progress';
  message: string;
  /** If true, won't auto-dismiss */
  sticky?: boolean;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const COLORS: Record<Toast['type'], { bg: string; border: string; text: string; dot: string }> = {
  info:     { bg: '#0f1117', border: '#2a3a5c', text: '#93b4e8', dot: '#4a90d9' },
  success:  { bg: '#0a1a0f', border: '#1a4a2a', text: '#86efac', dot: '#22c55e' },
  error:    { bg: '#1a0a0a', border: '#5c1f1f', text: '#fca5a5', dot: '#ef4444' },
  progress: { bg: '#0f1117', border: '#2a3a5c', text: '#b0c8f0', dot: '#4a90d9' },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const c = COLORS[toast.type];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast.sticky && toast.type !== 'progress') {
      timerRef.current = setTimeout(onDismiss, toast.type === 'success' ? 4000 : 6000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.type, toast.sticky]);

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 6,
      padding: '9px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      minWidth: 260,
      maxWidth: 340,
      animation: 'toast-in 0.18s ease',
    }}>
      {/* indicator dot / spinner */}
      {toast.type === 'progress' ? (
        <div style={{ marginTop: 2, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 1s linear infinite', display: 'block' }}>
            <circle cx="7" cy="7" r="5.5" fill="none" stroke={c.dot} strokeWidth="2" strokeDasharray="20 14" />
          </svg>
        </div>
      ) : (
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: c.dot, marginTop: 4, flexShrink: 0,
          boxShadow: `0 0 6px ${c.dot}88`,
        }} />
      )}
      <span style={{ flex: 1, fontSize: 12, color: c.text, lineHeight: 1.5 }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', color: c.text, cursor: 'pointer',
          opacity: 0.5, fontSize: 16, lineHeight: 1, padding: 0, marginTop: -1, flexShrink: 0,
        }}
      >×</button>
    </div>
  );
};

export const StatusToast: React.FC<Props> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`
        @keyframes toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 200, pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} onDismiss={() => onDismiss(t.id)} />
          </div>
        ))}
      </div>
    </>
  );
};
