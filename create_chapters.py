#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
DaVinci Resolve Chapter Plugin
Automates the creation of Text+ chapter titles on a new video track.
"""

import sys
import re

TEXT_SIZE = 0.06
TEXT_CENTER = {1: 0.5, 2: 0.35}
TEXT_FONT_FAMILY = "Ayuthaya"
TEXT_FONT_STYLE = "Regular"
TEXT_BOX_WIDTH_RATIO = 0.90  # target width as ratio of timeline width
TEXT_BOX_HEIGHT_RATIO = 0.40  # generous height so 2-3 lines can wrap
USE_MANUAL_WRAP = True  # deterministic wrap via '\n' (Text+ frame wrapping varies by template/version)
AVG_CHAR_WIDTH_EM = 0.60  # average glyph width in ems (heuristic)
WRAP_MIN_CHARS_PER_LINE = 24
WRAP_MAX_CHARS_PER_LINE = 60
WRAP_MAX_LINES = 3

# Define the chapters here (Timestamp — Title)
CHAPTERS_DATA = """
00:00 — Chapter 1: The Evolution of Information Addiction
01:45 — Chapter 2: Staying "Plugged In" for Survival
05:00 — Chapter 3: The Brutal Reality of "In Real Life" (IRL) Dynamics
08:30 — Chapter 4: AI, Wealth Consolidation, and the "Permanent Underclass"
10:00 — Chapter 5: Re-engineering Human Nature & Eliminating Competition
14:15 — Chapter 6: Personal AI Agents as Social Mediators
21:30 — Chapter 7: Rejecting Traditional Living & The Future of Habitats
25:45 — Chapter 8: Immortality and Escaping Space-Time
"""

def parse_time(time_str):
    """Converts MM:SS or HH:MM:SS to seconds."""
    parts = list(map(int, time_str.split(':')))
    if len(parts) == 2: # MM:SS
        return parts[0] * 60 + parts[1]
    elif len(parts) == 3: # HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0

def _clean_title(title):
    # Remove leading "Chapter N:" if present in CHAPTERS_DATA
    return re.sub(r"^\s*chapter\s*\d+\s*:\s*", "", title, flags=re.IGNORECASE).strip()

def _wrap_title(title, max_chars=WRAP_MAX_CHARS_PER_LINE, max_lines=WRAP_MAX_LINES):
    words = [w for w in title.strip().split() if w]
    if not words:
        return ""

    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= max_chars:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) >= max_lines - 1:
            break
    lines.append(current)

    remaining_words = words[len(" ".join(lines).split()):]
    if remaining_words and len(lines) >= max_lines:
        # Best-effort truncation if text is extremely long
        if not lines[-1].endswith("…"):
            if len(lines[-1]) >= max_chars:
                lines[-1] = lines[-1][: max(0, max_chars - 1)].rstrip() + "…"
            else:
                lines[-1] = lines[-1].rstrip() + "…"
    return "\n".join(lines)

def _tc_to_frames(tc, fps_int):
    hh, mm, ss, ff = [int(x) for x in tc.split(":")]
    return (((hh * 60) + mm) * 60 + ss) * fps_int + ff

def _frames_to_tc(frames, fps_int):
    if frames < 0:
        frames = 0
    ff = frames % fps_int
    total_seconds = frames // fps_int
    ss = total_seconds % 60
    total_minutes = total_seconds // 60
    mm = total_minutes % 60
    hh = total_minutes // 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{ff:02d}"

def get_resolve():
    """Connects to Resolve and returns the resolve object."""
    try:
        import DaVinciResolveScript as dvr_script
        resolve = dvr_script.scriptapp("Resolve")
        return resolve
    except ImportError:
        # If running from within Resolve's script menu, 'resolve' is globally available
        return globals().get("resolve")

def _insert_text_plus(timeline):
    """
    Best-effort insertion of a Text+ title.
    Different Resolve installs sometimes expose it as a Fusion Title, a Fusion Generator, or a regular Title.
    """
    for fn, arg in (
        (getattr(timeline, "InsertFusionTitleIntoTimeline", None), "Text+"),
        (getattr(timeline, "InsertFusionTitleIntoTimeline", None), "Text Plus"),
        (getattr(timeline, "InsertFusionGeneratorIntoTimeline", None), "Text+"),
        (getattr(timeline, "InsertTitleIntoTimeline", None), "Text+"),
        (getattr(timeline, "InsertTitleIntoTimeline", None), "Text"),
    ):
        if not fn:
            continue
        try:
            clip = fn(arg)
        except Exception:
            clip = None
        if clip:
            return clip
    return None

def _compute_wrap_chars(timeline_width_px, timeline_height_px):
    if not timeline_width_px or not timeline_height_px:
        return WRAP_MAX_CHARS_PER_LINE

    # Heuristic: font height ~= TEXT_SIZE * frame height
    # avg char width ~= AVG_CHAR_WIDTH_EM * font height
    try:
        font_px = float(TEXT_SIZE) * float(timeline_height_px)
        avg_char_px = max(1.0, font_px * AVG_CHAR_WIDTH_EM)
        usable_width_px = float(timeline_width_px) * TEXT_BOX_WIDTH_RATIO
        chars = int(round(usable_width_px / avg_char_px))
    except Exception:
        chars = WRAP_MAX_CHARS_PER_LINE

    return max(WRAP_MIN_CHARS_PER_LINE, min(WRAP_MAX_CHARS_PER_LINE, chars))

def _set_clip_text(clip, title, timeline_width_px=None, timeline_height_px=None):
    try:
        comp = clip.GetFusionCompByIndex(1)
    except Exception:
        comp = None
    if not comp:
        return False

    try:
        tools = comp.GetToolList()
    except Exception:
        tools = None

    if not tools:
        return False

    frame_width_px = None
    frame_height_px = None
    if timeline_width_px and timeline_height_px:
        try:
            frame_width_px = int(round(float(timeline_width_px) * TEXT_BOX_WIDTH_RATIO))
            frame_height_px = int(round(float(timeline_height_px) * TEXT_BOX_HEIGHT_RATIO))
        except Exception:
            frame_width_px = None
            frame_height_px = None

    wrap_chars = _compute_wrap_chars(timeline_width_px, timeline_height_px)

    updated = False
    # Prefer the actual Text+ tool when present.
    preferred_tools = []
    fallback_tools = []
    for tool in tools.values():
        try:
            name = tool.GetAttrs("TOOLB_Name")
        except Exception:
            name = None
        if name == "TextPlus":
            preferred_tools.append(tool)
        else:
            fallback_tools.append(tool)

    for tool in (preferred_tools + fallback_tools):
        try:
            # Set text first; do not bake in line breaks unless explicitly enabled.
            tool.SetInput(
                "StyledText",
                _wrap_title(title, max_chars=wrap_chars, max_lines=WRAP_MAX_LINES) if USE_MANUAL_WRAP else title,
                0,
            )

            tool.SetInput("Center", TEXT_CENTER, 0)
            tool.SetInput("Size", TEXT_SIZE, 0)

            # Font (best-effort; input name can vary by template/version)
            for font_key in ("Font", "FontName", "Typeface"):
                try:
                    tool.SetInput(font_key, TEXT_FONT_FAMILY, 0)
                    break
                except Exception:
                    pass

            # Font style (Resolve was trying "Semibold" for some installs)
            for style_key in ("Style", "FontStyle", "TypefaceStyle", "FontFace"):
                try:
                    tool.SetInput(style_key, TEXT_FONT_STYLE, 0)
                    break
                except Exception:
                    pass

            # Use Frame layout with explicit width/height so Text+ performs wrapping.
            for key, value in (
                ("LayoutType", 1),  # 0=Point, 1=Frame, 2=Path (varies, but 1 is Frame on most)
                ("LayoutType", "Frame"),
            ):
                try:
                    tool.SetInput(key, value, 0)
                except Exception:
                    pass

            if frame_width_px and frame_height_px:
                for key, value in (
                    ("Width", frame_width_px),
                    ("Height", frame_height_px),
                    ("FrameWidth", frame_width_px),
                    ("FrameHeight", frame_height_px),
                    ("TextBoxWidth", frame_width_px),
                    ("TextBoxHeight", frame_height_px),
                    ("BoxWidth", frame_width_px),
                    ("BoxHeight", frame_height_px),
                ):
                    try:
                        tool.SetInput(key, value, 0)
                    except Exception:
                        pass

            # Centered text + wrapping / margins (best-effort across versions)
            # 0/1/2 enums vary between versions, so try a few.
            for key, value in (
                ("HorizontalJustification", 1),
                ("HorizontalJustification", 2),
                ("HJustification", 1),
                ("HJustification", 2),
                ("Justification", 1),
                ("Justification", 2),
                ("TextAlign", 1),
                ("TextAlign", 2),
                ("Alignment", 1),
                ("Alignment", 2),
            ):
                try:
                    tool.SetInput(key, value, 0)
                except Exception:
                    pass

            # Enable wrapping (key names vary by version).
            for key, value in (
                ("Layout", 1),
                ("Layout", "Frame"),
                ("TextBox", 1),
                ("WordWrap", 1),
                ("Wrap", 1),
                ("WrapText", 1),
                ("AutoWrap", 1),
            ):
                try:
                    tool.SetInput(key, value, 0)
                except Exception:
                    pass

            # Some variants use normalized (0..1) widths; set those too.
            for width_key in ("Width", "TextBoxWidth", "BoxWidth"):
                try:
                    tool.SetInput(width_key, TEXT_BOX_WIDTH_RATIO, 0)
                except Exception:
                    pass
            updated = True
            break
        except Exception:
            continue
    return updated

def _get_timeline_end_frame_offset(timeline, timeline_start_frame):
    try:
        end_frame = int(timeline.GetEndFrame() or 0)
    except Exception:
        end_frame = 0

    if end_frame > 0:
        if timeline_start_frame and end_frame >= timeline_start_frame:
            return end_frame - timeline_start_frame
        return end_frame

    max_end = 0
    for track_type in ("video", "audio"):
        try:
            track_count = int(timeline.GetTrackCount(track_type) or 0)
        except Exception:
            track_count = 0

        for idx in range(1, track_count + 1):
            try:
                items = timeline.GetItemListInTrack(track_type, idx) or []
            except Exception:
                items = []

            for item in items:
                try:
                    item_end = int(item.GetEnd(False) or 0)
                except Exception:
                    item_end = 0
                if timeline_start_frame and item_end >= timeline_start_frame:
                    item_end = item_end - timeline_start_frame
                if item_end > max_end:
                    max_end = item_end

    return max_end

def _delete_video_tracks_named(timeline, name_to_delete):
    try:
        track_count = int(timeline.GetTrackCount("video") or 0)
    except Exception:
        track_count = 0

    # Delete from high -> low indices so indices remain stable.
    deleted = 0
    for idx in range(track_count, 0, -1):
        try:
            name = timeline.GetTrackName("video", idx) or ""
        except Exception:
            name = ""
        if name.strip().lower() == name_to_delete.strip().lower():
            try:
                if timeline.DeleteTrack("video", idx):
                    deleted += 1
            except Exception:
                pass
    return deleted

def create_chapters():
    resolve = get_resolve()
    if not resolve:
        print("Could not connect to DaVinci Resolve. Make sure External Scripting is enabled.")
        return

    project_manager = resolve.GetProjectManager()
    project = project_manager.GetCurrentProject()
    if not project:
        print("No project open.")
        return

    timeline = project.GetCurrentTimeline()
    if not timeline:
        print("No active timeline.")
        return

    # Parse chapters
    chapters = []
    lines = [line.strip() for line in CHAPTERS_DATA.strip().split('\n') if line.strip()]
    for line in lines:
        if ' — ' in line:
            time_part, title_part = line.split(' — ', 1)
            chapters.append({
                'start_seconds': parse_time(time_part),
                'title': _clean_title(title_part)
            })

    if not chapters:
        print("No valid chapters found in data.")
        return

    # Get timeline properties
    fps = float(timeline.GetSetting("timelineFrameRate") or 24.0)
    fps_int = int(round(fps)) if fps else 24
    # Note: frame-based APIs (e.g. SetMarkInOut / markers) use timeline-offset frames (0 at timeline start),
    # regardless of the timeline start timecode.
    # However, some getters (e.g. GetEndFrame / TimelineItem.GetEnd) may return absolute frame counts; we normalize them.
    timeline_start_frame = int(timeline.GetStartFrame() or 0)
    start_tc = timeline.GetStartTimecode() or "00:00:00:00"
    start_tc_frames = _tc_to_frames(start_tc, fps_int)

    print(f"Timeline start timecode: {start_tc} (fps={fps}, tc_fps={fps_int})")
    timeline_width_setting = timeline.GetSetting("timelineResolutionWidth")
    timeline_width_px = int(timeline_width_setting) if timeline_width_setting else None
    timeline_height_setting = timeline.GetSetting("timelineResolutionHeight")
    timeline_height_px = int(timeline_height_setting) if timeline_height_setting else None
    if timeline_width_px:
        print(f"Timeline width: {timeline_width_px}px")
    if timeline_height_px:
        print(f"Timeline height: {timeline_height_px}px")
    timeline_end_frame_offset = _get_timeline_end_frame_offset(timeline, timeline_start_frame)
    print(f"Timeline end frame (offset): {timeline_end_frame_offset}")

    # Preserve user marks, and use marks to control inserted title duration.
    original_marks = timeline.GetMarkInOut() or {}

    # Lock audio tracks while inserting titles so Resolve doesn't ripple your audio to the right.
    existing_audio_track_count = int(timeline.GetTrackCount("audio") or 0)

    original_track_locks = {"audio": {}}
    for idx in range(1, existing_audio_track_count + 1):
        try:
            original_track_locks["audio"][idx] = bool(timeline.GetIsTrackLocked("audio", idx))
        except Exception:
            original_track_locks["audio"][idx] = False
        try:
            timeline.SetTrackLock("audio", idx, True)
        except Exception:
            pass

    # Ensure we insert onto a fresh Chapters track (Resolve inserts titles to the currently-active video track,
    # and there's no reliable API to "select" an existing track).
    deleted_tracks = _delete_video_tracks_named(timeline, "Chapters")
    if deleted_tracks:
        print(f"Deleted {deleted_tracks} existing 'Chapters' video track(s).")

    # Reuse an existing "Chapters" track if present; otherwise create it.
    target_track = None
    current_video_track_count = int(timeline.GetTrackCount("video") or 0)
    for idx in range(1, current_video_track_count + 1):
        try:
            name = timeline.GetTrackName("video", idx) or ""
        except Exception:
            name = ""
        if name.strip().lower() == "chapters":
            target_track = idx
            break

    if not target_track:
        try:
            timeline.AddTrack("video")
        except Exception as e:
            print(f"Warning: could not add video track ({e}). Continuing without creating a new track.")
        target_track = int(timeline.GetTrackCount("video") or 1)
        try:
            timeline.SetTrackName("video", target_track, "Chapters")
        except Exception:
            pass

    # Ensure chapters track is unlocked, and clear any existing chapter clips on it (no ripple).
    try:
        timeline.SetTrackLock("video", target_track, False)
    except Exception:
        pass
    try:
        existing_items = timeline.GetItemListInTrack("video", target_track) or []
        if existing_items:
            timeline.DeleteClips(existing_items, False)
    except Exception:
        pass

    print(f"Targeting Video Track {target_track}")

    # Iterate and create
    for i in range(len(chapters)):
        chapter = chapters[i]
        
        start_offset_frames = int(round(chapter["start_seconds"] * fps))
        in_frame = start_offset_frames
        if in_frame < 0:
            in_frame = 0

        # Determine duration
        if i + 1 < len(chapters):
            next_start_frames = int(round(chapters[i + 1]["start_seconds"] * fps))
            duration_frames = next_start_frames - in_frame
            if duration_frames < 1:
                print(f"Skipping '{chapter['title']}' (next chapter is not after this one).")
                continue
        else:
            # For the last chapter, extend to the end of the timeline if possible.
            if timeline_end_frame_offset and timeline_end_frame_offset > in_frame:
                duration_frames = (timeline_end_frame_offset - in_frame) + 1
            else:
                duration_frames = int(round(300 * fps))  # fallback 5 minutes

        out_frame = in_frame + duration_frames - 1

        tc_frames = start_tc_frames + start_offset_frames
        target_tc = _frames_to_tc(tc_frames, fps_int)

        print(f"Adding: '{chapter['title']}' at +{chapter['start_seconds']}s (tc={target_tc}) duration_frames={duration_frames}")

        try:
            timeline.SetMarkInOut(in_frame, out_frame, "all")
        except Exception:
            try:
                timeline.SetMarkInOut(in_frame, out_frame)
            except Exception:
                pass

        try:
            timeline.SetCurrentTimecode(target_tc)
        except Exception as e:
            print(f"Warning: could not set timecode to {target_tc} ({e}).")

        new_clip = _insert_text_plus(timeline)
        if not new_clip:
            print(f"Failed to create clip for {chapter['title']}")
            try:
                timeline.ClearMarkInOut("all")
            except Exception:
                timeline.ClearMarkInOut()
            continue

        if not _set_clip_text(
            new_clip,
            chapter["title"],
            timeline_width_px=timeline_width_px,
            timeline_height_px=timeline_height_px,
        ):
            print(f"Warning: inserted clip, but could not set Text+ to '{chapter['title']}'.")

        try:
            timeline.ClearMarkInOut("all")
        except Exception:
            timeline.ClearMarkInOut()

    # Restore marks
    try:
        timeline.ClearMarkInOut("all")
    except Exception:
        timeline.ClearMarkInOut()
    try:
        v = original_marks.get("video")
        a = original_marks.get("audio")
        if v and "in" in v and "out" in v:
            timeline.SetMarkInOut(int(v["in"]), int(v["out"]), "video")
        if a and "in" in a and "out" in a:
            timeline.SetMarkInOut(int(a["in"]), int(a["out"]), "audio")
    except Exception:
        pass

    # Restore track locks
    for idx, was_locked in original_track_locks.get("audio", {}).items():
        try:
            timeline.SetTrackLock("audio", int(idx), bool(was_locked))
        except Exception:
            pass

    print("\nSuccessfully added all chapters to the timeline.")

if __name__ == "__main__":
    create_chapters()
