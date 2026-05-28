type KeptSegment = { srcStart: number; srcEnd: number };

export function buildAudioFilter({
  audioSources,
  arrangedMusicSegments,
  keptSegments,
  hasKeptSegments,
  effectiveMusic,
  effectiveLimiter,
  manifest,
  duration,
}: {
  audioSources: Array<{ path: string; volume: number; isOutro?: boolean }>;
  arrangedMusicSegments: Array<{
    id: string;
    path: string;
    volume: number;
    trimStart: number;
    visibleDuration: number;
    delayMs: number;
    fadeInSecond: number;
    fadeOutSecond: number;
  }>;
  keptSegments: KeptSegment[];
  hasKeptSegments: boolean;
  effectiveMusic: any;
  effectiveLimiter: any;
  manifest: any;
  duration: number;
}) {
  const sc = effectiveMusic?.sidechain;
  const scEnabled = sc?.enabled !== false;
  const threshold = sc?.threshold ?? 0.1;
  const ratio = 1.0 / (1.0 - (sc?.amount ?? 0.5));
  const attack = sc?.attackMs ?? 80;
  const release = sc?.releaseMs ?? 350;
  const hasMainSpeech = audioSources.some((src, index) => index === 0 && !src.isOutro);
  const hasMusicSource = arrangedMusicSegments.length > 0
    || audioSources.some((src, index) => index > 0 && !src.isOutro);
  const needsSpeechTrigger = hasMainSpeech && hasMusicSource && scEnabled;
  const lim = effectiveLimiter;
  const limEnabled = lim?.enabled !== false;
  const limIn = limEnabled ? Math.pow(10, (lim?.inputGainDb ?? 0) / 20) : 1;
  const limThresh = limEnabled
    ? Math.max(0.063, Math.pow(10, (lim?.thresholdDb ?? -6) / 20))
    : 1;
  const limOut = limEnabled ? Math.pow(10, (lim?.outputGainDb ?? 0) / 20) : 1;
  const limRelease = lim?.releaseSec ?? 0.25;
  const musicInputStartIndex = audioSources.length + 1;

  let filter = '';
  audioSources.forEach((src, index) => {
    const ffmpegIndex = index + 1;
    if (index === 0) {
      filter += buildMainAudioFilter({
        ffmpegIndex,
        src,
        keptSegments,
        hasKeptSegments,
        limEnabled,
        limIn,
        limThresh,
        limOut,
        limRelease,
        needsSpeechTrigger,
        duration,
      });
      return;
    }
    if (src.isOutro) {
      const delayMs = Math.round((manifest.baseDuration || 0) * 1000);
      filter += `[${ffmpegIndex}:a]volume=${src.volume.toFixed(2)},adelay=${delayMs}|${delayMs}[outro_mix];`;
      return;
    }
    filter += `[${ffmpegIndex}:a]volume=${src.volume.toFixed(2)}[music_pre];`;
    filter += scEnabled
      ? `[music_pre][speech_trigger]sidechaincompress=threshold=${threshold}:ratio=${ratio.toFixed(2)}:attack=${attack}:release=${release}[music_mix];`
      : '[music_pre]anull[music_mix];';
  });

  if (arrangedMusicSegments.length > 0) {
    filter += buildArrangedMusicFilter(
      arrangedMusicSegments,
      musicInputStartIndex,
      scEnabled,
      needsSpeechTrigger,
      threshold,
      ratio,
      attack,
      release,
    );
  }

  const mixLabels = [];
  if (hasMainSpeech) mixLabels.push('[speech_mix]');
  if (hasMusicSource) mixLabels.push('[music_mix]');
  if (audioSources.some((src) => src.isOutro)) mixLabels.push('[outro_mix]');

  filter += `${mixLabels.join('')}amix=inputs=${mixLabels.length}:dropout_transition=0,volume=${mixLabels.length},alimiter=limit=0.9[aout]`;
  return filter;
}

function buildMainAudioFilter({
  ffmpegIndex,
  src,
  keptSegments,
  hasKeptSegments,
  limEnabled,
  limIn,
  limThresh,
  limOut,
  limRelease,
  needsSpeechTrigger,
  duration,
}: {
  ffmpegIndex: number;
  src: { volume: number };
  keptSegments: KeptSegment[];
  hasKeptSegments: boolean;
  limEnabled: boolean;
  limIn: number;
  limThresh: number;
  limOut: number;
  limRelease: number;
  needsSpeechTrigger: boolean;
  duration: number;
}) {
  let mainLabel = `[${ffmpegIndex}:a]`;
  let filter = '';

  if (hasKeptSegments) {
    const splitOuts = keptSegments.map((_, idx) => `[m_src_${idx}]`);
    filter += `${mainLabel}asplit=${keptSegments.length}${splitOuts.join('')};`;
    const concatInputs: string[] = [];
    keptSegments.forEach((segment, idx) => {
      const durationSec = segment.srcEnd - segment.srcStart;
      const fadeDuration = 0.02;
      const fadeIn = idx > 0 ? `afade=t=in:st=0:d=${fadeDuration}` : '';
      const fadeOut = idx < keptSegments.length - 1
        ? `afade=t=out:st=${Math.max(0, durationSec - fadeDuration).toFixed(3)}:d=${fadeDuration}`
        : '';
      const fadeFilters = [fadeIn, fadeOut].filter(Boolean).join(',');
      const comma = fadeFilters ? ',' : '';
      filter += `[m_src_${idx}]atrim=start=${segment.srcStart.toFixed(3)}:end=${segment.srcEnd.toFixed(3)},asetpts=PTS-STARTPTS${comma}${fadeFilters}[m_seg_${idx}];`;
      concatInputs.push(`[m_seg_${idx}]`);
    });
    filter += `${concatInputs.join('')}concat=n=${keptSegments.length}:v=0:a=1[main_edited];`;
    mainLabel = '[main_edited]';
  }

  filter += `${mainLabel}volume=${(src.volume * limIn).toFixed(2)}`;
  if (limEnabled) {
    filter += `,alimiter=level_in=1:level_out=1:limit=${limThresh.toFixed(3)}:attack=5:release=${(limRelease * 1000).toFixed(0)}`;
  }
  filter += `,volume=${limOut.toFixed(2)},apad=whole_dur=${duration.toFixed(3)}`;
  filter += needsSpeechTrigger ? ',asplit=2[speech_trigger][speech_mix];' : '[speech_mix];';
  return filter;
}

function buildArrangedMusicFilter(
  arrangedMusicSegments: Array<{
    id: string;
    path: string;
    volume: number;
    trimStart: number;
    visibleDuration: number;
    delayMs: number;
    fadeInSecond: number;
    fadeOutSecond: number;
  }>,
  musicInputStartIndex: number,
  scEnabled: boolean,
  needsSpeechTrigger: boolean,
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
) {
  let filter = '';
  const segmentLabels: string[] = [];
  arrangedMusicSegments.forEach((segment, index) => {
    const inputIndex = musicInputStartIndex + index;
    let chain = `[${inputIndex}:a]volume=${segment.volume.toFixed(2)}`;
    if (segment.fadeInSecond > 0) {
      chain += `,afade=t=in:st=0:d=${segment.fadeInSecond.toFixed(3)}`;
    }
    if (segment.fadeOutSecond > 0) {
      const fadeOutStart = Math.max(0, segment.visibleDuration - segment.fadeOutSecond);
      chain += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${segment.fadeOutSecond.toFixed(3)}`;
    }
    chain += `,adelay=${segment.delayMs}|${segment.delayMs}[${segment.id}];`;
    filter += chain;
    segmentLabels.push(`[${segment.id}]`);
  });

  if (segmentLabels.length === 1) {
    filter += `${segmentLabels[0]}anull[music_pre];`;
  } else if (segmentLabels.length > 1) {
    filter += `${segmentLabels.join('')}amix=inputs=${segmentLabels.length}:dropout_transition=0,volume=${segmentLabels.length}[music_pre];`;
  }

  filter += scEnabled && needsSpeechTrigger
    ? `[music_pre][speech_trigger]sidechaincompress=threshold=${threshold}:ratio=${ratio.toFixed(2)}:attack=${attack}:release=${release}[music_mix];`
    : '[music_pre]anull[music_mix];';
  return filter;
}
