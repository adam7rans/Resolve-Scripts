import type React from 'react';
import { useCallback, useRef } from 'react';
import { parseTranscript, type TranscriptData } from '../lib/transcript';
import { uploadCaption, listProjects, type ProjectMeta } from '../lib/projectApi';
import type { ProjectTaskStatus } from '../lib/constants';
import type { Toast } from '../components/StatusToast';

export interface TranscriptHandlerDeps {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setProjectStatus: (s: ProjectTaskStatus) => void;
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptData | null>>;
  setTranscriptName: React.Dispatch<React.SetStateAction<string | null>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
}

export function useTranscriptHandlers(deps: TranscriptHandlerDeps) {
  const { activeProjectIdRef, setProjects, setProjectStatus, setTranscript, setTranscriptName, addToast } = deps;
  const transcriptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTranscript = useCallback((data: TranscriptData) => {
    const pid = activeProjectIdRef.current;
    if (!pid) {
      addToast('Caption changes applied to preview only; select a project to save', 'info');
      return;
    }
    setProjectStatus({ kind: 'progress', message: 'Saving caption JSON to project folder', detail: `Folder: projects/${pid}` });
    uploadCaption(pid, data)
      .then(() => {
        setProjectStatus({ kind: 'success', message: 'Caption JSON saved to project folder', detail: `Folder: projects/${pid}/caption.json` });
        listProjects().then(setProjects);
      })
      .catch((err) => {
        setProjectStatus({ kind: 'error', message: `Caption save failed: ${err.message}` });
        addToast(`Caption save failed: ${err.message}`, 'error');
      });
  }, [activeProjectIdRef, setProjects, setProjectStatus, addToast]);

  const handleEditorUpdateTranscript = useCallback((data: TranscriptData) => {
    setTranscript(data);
    if (transcriptSaveTimerRef.current) clearTimeout(transcriptSaveTimerRef.current);
    transcriptSaveTimerRef.current = setTimeout(() => {
      saveTranscript(data);
    }, 1500);
  }, [setTranscript, saveTranscript]);

  const loadTranscriptFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const data = parseTranscript(raw);
        setTranscript(data);
        setTranscriptName('caption.json');
        saveTranscript(data);
      } catch (e) {
        console.error('Failed to parse transcript JSON', e);
        alert('Could not parse transcript JSON: ' + (e as Error).message);
      }
    };
    reader.readAsText(file);
  }, [setTranscript, setTranscriptName, saveTranscript]);

  const onPickTranscript: React.ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) loadTranscriptFile(f);
  }, [loadTranscriptFile]);

  return { saveTranscript, handleEditorUpdateTranscript, loadTranscriptFile, onPickTranscript };
}
