import { useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import type { MusicParams } from '../../lib/MusicPlayer';
import type { MusicAsset, MusicTimelineClip } from '../../lib/types';
import type { ProjectMeta } from '../../lib/projectApi';
import { deleteMusicAsset, getMusicAssetUrl, listProjects, uploadMusicFiles } from '../../lib/projectApi';
import { MICRO_TIMELINE_COLORS } from '../../lib/types';
import {
  clampMusicFade,
  MUSIC_DEFAULT_OVERLAP_SECONDS,
  musicClipEnd,
  musicFadeGainAtTime,
  MUSIC_TRACK_COUNT,
  readLocalAudioDuration,
} from './musicTimeline';
interface Args {
  activeProjectId: string | null;
  activeProjectIdRef: React.MutableRefObject<string | null>;
  music: MusicParams;
  musicLayerOn: boolean;
  musicLibrary: MusicAsset[];
  musicAssetDurations: Record<string, number>;
  selectedMusicAssetIds: string[];
  musicTimelineClips: MusicTimelineClip[];
  selectedMusicClipId: string | null;
  musicPlayheadSecond: number;
  playing: boolean;
  muted: boolean;
  musicElRef: React.MutableRefObject<HTMLAudioElement | null>;
  musicDuckGainRef: React.MutableRefObject<number>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setMusicLibrary: React.Dispatch<React.SetStateAction<MusicAsset[]>>;
  setMusicAssetDurations: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSelectedMusicAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  setMusicTimelineClips: React.Dispatch<React.SetStateAction<MusicTimelineClip[]>>;
  setSelectedMusicClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowAudioTracks: React.Dispatch<React.SetStateAction<boolean>>;
  showMusicPanel: () => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'progress', sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: 'info' | 'success' | 'error' | 'progress') => void;
}
export function useMusicTimeline({
  activeProjectId,
  activeProjectIdRef,
  music,
  musicLayerOn,
  musicLibrary,
  musicAssetDurations,
  selectedMusicAssetIds,
  musicTimelineClips,
  selectedMusicClipId,
  musicPlayheadSecond,
  playing,
  muted,
  musicElRef,
  musicDuckGainRef,
  setProjects,
  setMusicLibrary,
  setMusicAssetDurations,
  setSelectedMusicAssetIds,
  setMusicTimelineClips,
  setSelectedMusicClipId,
  setShowAudioTracks,
  showMusicPanel,
  addToast,
  updateToast,
}: Args) {
  const selectedMusicClip = useMemo(
    () => musicTimelineClips.find((clip) => clip.id === selectedMusicClipId) ?? null,
    [musicTimelineClips, selectedMusicClipId],
  );
  const selectedMusicClipName = selectedMusicClip ? musicLibrary.find((asset) => asset.id === selectedMusicClip.assetId)?.originalName ?? null : null;
  const musicClipLabels = useMemo(
    () =>
      Object.fromEntries(
        musicTimelineClips.map((clip) => [clip.id, musicLibrary.find((asset) => asset.id === clip.assetId)?.originalName ?? `Track ${clip.trackIndex + 1}`]),
      ),
    [musicLibrary, musicTimelineClips],
  );
  useEffect(() => {
    if (!activeProjectId) return;
    const pending = musicLibrary.filter((asset) => musicAssetDurations[asset.id] === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    pending.forEach((asset) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = getMusicAssetUrl(activeProjectId, asset.id);
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (cancelled) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setMusicAssetDurations((prev) => (prev[asset.id] === undefined ? { ...prev, [asset.id]: audio.duration } : prev));
          }
        },
        { once: true },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, musicLibrary, musicAssetDurations, setMusicAssetDurations]);
  const musicLaneAudioRefs = useRef<Array<HTMLAudioElement | null>>([null, null]);
  const musicLaneAssetIdsRef = useRef<Array<string | null>>([null, null]);
  useEffect(() => {
    return () => {
      musicLaneAudioRefs.current.forEach((audio) => {
        try {
          audio?.pause();
        } catch {}
      });
      musicLaneAudioRefs.current = [null, null];
      musicLaneAssetIdsRef.current = [null, null];
    };
  }, []);
  useEffect(() => {
    if (musicTimelineClips.length === 0 || !activeProjectId) {
      musicLaneAudioRefs.current.forEach((audio) => audio?.pause());
      return;
    }
    musicElRef.current?.pause();
    for (let lane = 0; lane < MUSIC_TRACK_COUNT; lane += 1) {
      const activeClip = musicTimelineClips
        .filter((clip) => clip.trackIndex === lane)
        .find((clip) => musicPlayheadSecond >= clip.startSecond && musicPlayheadSecond < musicClipEnd(clip));
      const audio = musicLaneAudioRefs.current[lane];
      if (!activeClip) {
        audio?.pause();
        continue;
      }
      const asset = musicLibrary.find((item) => item.id === activeClip.assetId);
      if (!asset) {
        audio?.pause();
        continue;
      }
      let laneAudio = audio;
      if (!laneAudio || musicLaneAssetIdsRef.current[lane] !== asset.id) {
        laneAudio?.pause();
        laneAudio = document.createElement('audio');
        laneAudio.preload = 'auto';
        laneAudio.crossOrigin = 'anonymous';
        laneAudio.src = getMusicAssetUrl(activeProjectId, asset.id);
        musicLaneAudioRefs.current[lane] = laneAudio;
        musicLaneAssetIdsRef.current[lane] = asset.id;
      }

      const targetTime = Math.max(
        0,
        Math.min(
          (musicAssetDurations[asset.id] ?? activeClip.durationSecond) - 0.01,
          activeClip.sourceOffsetSecond + (musicPlayheadSecond - activeClip.startSecond),
        ),
      );
      const gain = musicFadeGainAtTime(activeClip, musicPlayheadSecond);
      const duck = music.sidechain.enabled ? musicDuckGainRef.current : 1;
      laneAudio.volume = music.muted || !musicLayerOn || muted ? 0 : Math.max(0, Math.min(1, music.volume * gain * duck));
      if (Math.abs((laneAudio.currentTime || 0) - targetTime) > 0.15) {
        try {
          laneAudio.currentTime = targetTime;
        } catch {}
      }
      if (playing) laneAudio.play().catch(() => {});
      else laneAudio.pause();
    }
  }, [
    activeProjectId,
    music,
    musicAssetDurations,
    musicDuckGainRef,
    musicElRef,
    musicLayerOn,
    musicLibrary,
    musicPlayheadSecond,
    musicTimelineClips,
    muted,
    playing,
  ]);
  const handlePickMusicFiles = async (files: File[]) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || files.length === 0) return;
    const durations = await Promise.all(files.map((file) => readLocalAudioDuration(file)));
    const uploadId = addToast('Importing music files…', 'progress', true);
    try {
      const result = await uploadMusicFiles(projectId, files, (pct) => updateToast(uploadId, `Importing music… ${pct}%`, 'progress'));
      updateToast(uploadId, `${result.assets.length} music file${result.assets.length === 1 ? '' : 's'} imported`, 'success');
      setMusicLibrary((prev) => [...prev, ...result.assets]);
      setSelectedMusicAssetIds((prev) => [...new Set([...prev, ...result.assets.map((asset) => asset.id)])]);
      setMusicAssetDurations((prev) => {
        const next = { ...prev };
        result.assets.forEach((asset, index) => {
          const duration = durations[index];
          if (Number.isFinite(duration) && duration > 0) next[asset.id] = duration;
        });
        return next;
      });
      listProjects().then(setProjects);
    } catch (error: any) {
      updateToast(uploadId, `Music import failed: ${error?.message ?? error}`, 'error');
    }
  };
  const handleDeleteMusicAsset = async (assetId: string) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    try {
      await deleteMusicAsset(projectId, assetId);
      setMusicLibrary((prev) => prev.filter((asset) => asset.id !== assetId));
      setSelectedMusicAssetIds((prev) => prev.filter((id) => id !== assetId));
      setMusicTimelineClips((prev) => prev.filter((clip) => clip.assetId !== assetId));
      if (selectedMusicClip?.assetId === assetId) setSelectedMusicClipId(null);
      setMusicAssetDurations((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
      listProjects().then(setProjects);
    } catch (error: any) {
      addToast(`Failed to remove music: ${error?.message ?? error}`, 'error');
    }
  };
  const handleAutoArrangeSelectedMusic = () => {
    const chosenAssets = musicLibrary.filter((asset) => selectedMusicAssetIds.includes(asset.id));
    if (chosenAssets.length === 0) {
      addToast('Select at least one music file first', 'error');
      return;
    }
    let cursor = musicTimelineClips.length > 0 ? Math.max(...musicTimelineClips.map((clip) => musicClipEnd(clip))) - MUSIC_DEFAULT_OVERLAP_SECONDS : 0;
    const baseIndex = musicTimelineClips.length;
    const newClips = chosenAssets.map((asset, index) => {
      const durationSecond = Math.max(0.01, musicAssetDurations[asset.id] ?? 30);
      const fade = clampMusicFade(Math.min(5, MUSIC_DEFAULT_OVERLAP_SECONDS / 2, durationSecond / 3), durationSecond);
      const clip: MusicTimelineClip = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        trackIndex: ((baseIndex + index) % MUSIC_TRACK_COUNT) as 0 | 1,
        startSecond: Math.max(0, cursor),
        durationSecond,
        sourceOffsetSecond: 0,
        fadeInSecond: index === 0 && musicTimelineClips.length === 0 ? 0 : fade,
        fadeOutSecond: fade,
        color: MICRO_TIMELINE_COLORS[(baseIndex + index) % MICRO_TIMELINE_COLORS.length],
      };
      cursor = clip.startSecond + durationSecond - MUSIC_DEFAULT_OVERLAP_SECONDS;
      return clip;
    });
    setMusicTimelineClips((prev) => [...prev, ...newClips]);
    setSelectedMusicClipId(newClips[0]?.id ?? null);
    setShowAudioTracks(true);
    showMusicPanel();
  };
  const handleUpdateSelectedMusicClip = (patch: Partial<MusicTimelineClip>) => {
    if (!selectedMusicClipId) return;
    setMusicTimelineClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== selectedMusicClipId) return clip;
        const durationSecond = patch.durationSecond ?? clip.durationSecond;
        return {
          ...clip,
          ...patch,
          durationSecond,
          fadeInSecond: clampMusicFade(patch.fadeInSecond ?? clip.fadeInSecond, durationSecond),
          fadeOutSecond: clampMusicFade(patch.fadeOutSecond ?? clip.fadeOutSecond, durationSecond),
          startSecond: Math.max(0, patch.startSecond ?? clip.startSecond),
          sourceOffsetSecond: Math.max(0, patch.sourceOffsetSecond ?? clip.sourceOffsetSecond),
        };
      }),
    );
  };
  return {
    selectedMusicClip,
    selectedMusicClipName,
    musicClipLabels,
    handlePickMusicFiles,
    handleDeleteMusicAsset,
    handleAutoArrangeSelectedMusic,
    handleUpdateSelectedMusicClip,
    handleMoveMusicClip: (id: string, startSecond: number, trackIndex?: 0 | 1) =>
      setMusicTimelineClips((prev) =>
        prev.map((clip) => (clip.id === id ? { ...clip, startSecond: Math.max(0, startSecond), trackIndex: trackIndex ?? clip.trackIndex } : clip)),
      ),
    handleAdjustMusicClipFade: (id: string, kind: 'fadeInSecond' | 'fadeOutSecond', value: number) => {
      setSelectedMusicClipId(id);
      setMusicTimelineClips((prev) =>
        prev.map((clip) => (clip.id === id ? { ...clip, [kind]: clampMusicFade(value, clip.durationSecond) } : clip)),
      );
    },
    handleDeleteSelectedMusicClip: () => {
      if (!selectedMusicClipId) return;
      setMusicTimelineClips((prev) => prev.filter((clip) => clip.id !== selectedMusicClipId));
      setSelectedMusicClipId(null);
    },
    handleClearMusicTimeline: () => {
      setMusicTimelineClips([]);
      setSelectedMusicClipId(null);
    },
  };
}
