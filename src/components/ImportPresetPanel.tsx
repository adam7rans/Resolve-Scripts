import React, { useEffect, useMemo, useState } from 'react';
import {
  createPreset,
  getPreset,
  getProject,
  listPresets,
  type PresetMeta,
  type ProjectMeta,
} from '../lib/projectApi';
import { Section } from './Controls';

export interface ImportPresetProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  currentSettings: Record<string, any>;
  onApplySettings: (data: Record<string, any>) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => number;
}

export const ImportPresetPanel: React.FC<ImportPresetProps> = ({
  projects,
  activeProjectId,
  currentSettings,
  onApplySettings,
  addToast,
}) => {
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [importingProject, setImportingProject] = useState(false);
  const [importingPreset, setImportingPreset] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presets, setPresets] = useState<PresetMeta[]>([]);

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId],
  );

  useEffect(() => {
    listPresets().then(setPresets).catch(() => {});
  }, []);

  const handleImportProject = async () => {
    if (!sourceProjectId) return;
    setImportingProject(true);
    try {
      const proj = await getProject(sourceProjectId);
      onApplySettings(proj);
      const sourceName = otherProjects.find((p) => p.id === sourceProjectId)?.name ?? sourceProjectId;
      addToast(`Imported settings from "${sourceName}"`, 'success');
    } catch {
      addToast('Failed to import project settings', 'error');
    } finally {
      setImportingProject(false);
    }
  };

  const handleImportPreset = async () => {
    if (!presetId) return;
    setImportingPreset(true);
    try {
      const preset = await getPreset(presetId);
      onApplySettings(preset);
      const sourceName = presets.find((p) => p.id === presetId)?.name ?? presetId;
      addToast(`Applied preset "${sourceName}"`, 'success');
    } catch {
      addToast('Failed to apply preset', 'error');
    } finally {
      setImportingPreset(false);
    }
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    setSavingPreset(true);
    try {
      const created = await createPreset(name, currentSettings);
      const next = await listPresets();
      setPresets(next);
      setPresetId(created.id);
      setPresetName('');
      addToast(`Saved preset "${created.name}"`, 'success');
    } catch {
      addToast('Failed to save preset', 'error');
    } finally {
      setSavingPreset(false);
    }
  };

  if (!activeProjectId) return null;

  return (
    <Section title="Presets">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Save preset</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: '#ddd',
                border: '1px solid #333',
                padding: '4px 6px',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || savingPreset}
              style={{
                padding: '4px 12px',
                background: presetName.trim() && !savingPreset ? '#1f6feb' : '#222',
                color: presetName.trim() && !savingPreset ? '#fff' : '#666',
                border: 'none',
                borderRadius: 3,
                cursor: presetName.trim() && !savingPreset ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {savingPreset ? 'Saving...' : 'Save Preset'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Apply saved preset</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: '#ddd',
                border: '1px solid #333',
                padding: '4px 6px',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <option value="">Select preset...</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            <button
              onClick={handleImportPreset}
              disabled={!presetId || importingPreset}
              style={{
                padding: '4px 12px',
                background: presetId && !importingPreset ? '#1f6feb' : '#222',
                color: presetId && !importingPreset ? '#fff' : '#666',
                border: 'none',
                borderRadius: 3,
                cursor: presetId && !importingPreset ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {importingPreset ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>

        {otherProjects.length > 0 && (
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Import from project</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={sourceProjectId}
                onChange={(e) => setSourceProjectId(e.target.value)}
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  color: '#ddd',
                  border: '1px solid #333',
                  padding: '4px 6px',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="">Select project...</option>
                {otherProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <button
                onClick={handleImportProject}
                disabled={!sourceProjectId || importingProject}
                style={{
                  padding: '4px 12px',
                  background: sourceProjectId && !importingProject ? '#1f6feb' : '#222',
                  color: sourceProjectId && !importingProject ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: 3,
                  cursor: sourceProjectId && !importingProject ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {importingProject ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        Saves and reapplies the current background, video, caption, audio-reactivity, layer, guide, and export settings.
      </div>
    </Section>
  );
};
