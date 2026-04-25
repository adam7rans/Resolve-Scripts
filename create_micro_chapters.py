#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Micro-Chapter Creator for DaVinci Resolve
Run from Workspace → Scripts → Create Micro Chapters

Creates a "Sub Titles" video track with one Text+ clip per subchapter,
visible until the next subchapter begins. Also places a labeled marker
at every subchapter boundary.

HOW TO EDIT YOUR CHAPTERS:
  Chapter lines:     "Chapter N: Title"
  Subchapter lines:  "1.1 | 00:00 | Subchapter Title"
  Blank lines are ignored.
"""

# ─────────────────────────────────────────────────────────────────────────────
# PASTE YOUR CHAPTER DATA HERE
# ─────────────────────────────────────────────────────────────────────────────
SUBCHAPTERS_DATA = """
Chapter 1: The Performance of the Self
1.1 | 00:00 | The Privacy of the Memo
1.2 | 02:16 | The Charisma Critique
1.3 | 04:46 | Subtlety and Ego

Chapter 2: The Mechanics of Modern Interaction
2.1 | 07:31 | Tribalism as a Default
2.2 | 10:21 | The Silence Taboo
2.3 | 13:11 | The Conversation Tennis Match

Chapter 3: Industry, Technology, and the Singularity
3.1 | 15:01 | Pumping Money vs. Pure Science
3.2 | 17:46 | Civilization's Blood
3.3 | 19:31 | The Inevitable Momentum

Chapter 4: The Human Touch in a Robotic Future
4.1 | 21:51 | The Empathy Gap
4.2 | 24:16 | The Angel Artist
4.3 | 26:51 | Closing the Uncanny Valley

Chapter 5: Economic Erasure and Universal Income
5.1 | 29:31 | The Death of the Knowledge Worker
5.2 | 32:01 | Beyond Capitalism
5.3 | 34:51 | Agential Solving

Chapter 6: The Ethics of Artificial Nature
6.1 | 37:46 | The Idiot Angel
6.2 | 41:16 | Self-Reflection in Code
6.3 | 44:31 | The Checkmate Scenario

Chapter 7: Post-Humanism and Physical Immortality
7.1 | 48:41 | Infrastructure Fragility
7.2 | 51:21 | The New Human Material
7.3 | 54:06 | Quantum Mastery

Chapter 8: The Metaphysical Exit
8.1 | 56:31 | The Gnostic Prison
8.2 | 58:46 | Harvesting Energy
8.3 | 59:56 | The Farmer's Restriction
"""
# ─────────────────────────────────────────────────────────────────────────────

import re

CHAPTER_TRACK_NAME = "Chapter Titles"
SUB_TRACK_NAME     = "Sub Titles"
MARKER_COLOR       = "Sky"

CHAPTER_CENTER     = {1: 0.5, 2: 0.88}
CHAPTER_TEXT_SIZE  = 0.052

SUB_CENTER         = {1: 0.5, 2: 0.66}
SUB_TEXT_SIZE      = 0.058

FONT_FAMILY        = "Ayuthaya"
FONT_STYLE         = "Regular"
TEXT_BOX_W_RATIO   = 0.85
TEXT_BOX_H_RATIO   = 0.18


# ── parsing ───────────────────────────────────────────────────────────────────

def _parse_time(t):
    parts = list(map(int, t.strip().split(":")))
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def _parse(raw):
    chapters = []
    current  = None
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.match(r"^Chapter\s+\d+", line, re.IGNORECASE):
            current = {"title": line, "subs": []}
            chapters.append(current)
        elif "|" in line and current is not None:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3:
                current["subs"].append({
                    "number":     parts[0],
                    "start_secs": _parse_time(parts[1]),
                    "title":      parts[2],
                })
    return chapters


def _split_chapter_title(full_title):
    m = re.match(r"^(Chapter\s+\d+):\s*(.+)$", full_title, re.IGNORECASE)
    if m:
        return m.group(1), m.group(2).strip()
    return "Chapter", full_title


# ── Resolve helpers ───────────────────────────────────────────────────────────

def _tc_to_frames(tc, fps):
    h, m, s, f = [int(x) for x in tc.split(":")]
    return (((h * 60) + m) * 60 + s) * fps + f


def _frames_to_tc(frames, fps):
    frames = max(0, frames)
    f = frames % fps
    s = (frames // fps) % 60
    m = (frames // fps // 60) % 60
    h =  frames // fps // 3600
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"


def _wrap(text, tw, th, size, max_lines=2):
    if not tw or not th:
        max_chars = 36
    else:
        try:
            font_px   = size * float(th)
            char_px   = max(1.0, font_px * 0.58)
            usable_px = float(tw) * TEXT_BOX_W_RATIO
            max_chars = max(20, min(60, int(usable_px / char_px)))
        except Exception:
            max_chars = 36
    words = text.split()
    if not words:
        return text
    lines, cur = [], words[0]
    for w in words[1:]:
        if len(cur) + 1 + len(w) <= max_chars:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w
            if len(lines) >= max_lines - 1:
                break
    lines.append(cur)
    return "\n".join(lines)


def _insert_text_plus(timeline):
    for fn, arg in (
        (getattr(timeline, "InsertFusionTitleIntoTimeline",    None), "Text+"),
        (getattr(timeline, "InsertFusionTitleIntoTimeline",    None), "Text Plus"),
        (getattr(timeline, "InsertFusionGeneratorIntoTimeline",None), "Text+"),
        (getattr(timeline, "InsertTitleIntoTimeline",          None), "Text+"),
        (getattr(timeline, "InsertTitleIntoTimeline",          None), "Text"),
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


def _set_text(clip, text, center, size, tw, th):
    try:
        comp  = clip.GetFusionCompByIndex(1)
        tools = comp.GetToolList() if comp else None
    except Exception:
        return False
    if not tools:
        return False
    wrapped = _wrap(text, tw, th, size)
    for tool in list(tools.values()):
        try:
            tool.SetInput("StyledText", wrapped, 0)
            tool.SetInput("Center", center, 0)
            tool.SetInput("Size", size, 0)
            for k in ("Font", "FontName", "Typeface"):
                try:
                    tool.SetInput(k, FONT_FAMILY, 0); break
                except Exception:
                    pass
            for k in ("Style", "FontStyle", "TypefaceStyle"):
                try:
                    tool.SetInput(k, FONT_STYLE, 0); break
                except Exception:
                    pass
            if tw and th:
                fw = int(round(float(tw) * TEXT_BOX_W_RATIO))
                fh = int(round(float(th) * TEXT_BOX_H_RATIO))
                for k, v in (("Width", fw), ("Height", fh),
                             ("FrameWidth", fw), ("FrameHeight", fh)):
                    try:
                        tool.SetInput(k, v, 0)
                    except Exception:
                        pass
            for k, v in (("HorizontalJustification", 2), ("HJustification", 2)):
                try:
                    tool.SetInput(k, v, 0)
                except Exception:
                    pass
            return True
        except Exception:
            continue
    return False


def _delete_tracks_named(timeline, name):
    try:
        count = int(timeline.GetTrackCount("video") or 0)
    except Exception:
        return 0
    deleted = 0
    for idx in range(count, 0, -1):
        try:
            if (timeline.GetTrackName("video", idx) or "").strip().lower() == name.lower():
                if timeline.DeleteTrack("video", idx):
                    deleted += 1
        except Exception:
            pass
    return deleted


def _add_named_track(timeline, name):
    try:
        timeline.AddTrack("video")
    except Exception:
        pass
    idx = int(timeline.GetTrackCount("video") or 1)
    try:
        timeline.SetTrackName("video", idx, name)
        timeline.SetTrackLock("video", idx, False)
    except Exception:
        pass
    return idx


def _place_clip(timeline, text, center, size, tw, th,
                in_frame, out_frame, start_tc_frames, fps_int):
    tc = _frames_to_tc(start_tc_frames + in_frame, fps_int)
    try:
        timeline.SetMarkInOut(in_frame, out_frame, "all")
    except Exception:
        try:
            timeline.SetMarkInOut(in_frame, out_frame)
        except Exception:
            pass
    try:
        timeline.SetCurrentTimecode(tc)
    except Exception:
        pass
    clip = _insert_text_plus(timeline)
    if clip:
        _set_text(clip, text, center, size, tw, th)
        return True
    return False


def _clear_marks(timeline):
    try:
        timeline.ClearMarkInOut("all")
    except Exception:
        try:
            timeline.ClearMarkInOut()
        except Exception:
            pass


# ── main ──────────────────────────────────────────────────────────────────────

def create_micro_chapters():
    r        = resolve  # noqa — injected by Resolve
    chapters = _parse(SUBCHAPTERS_DATA)

    if not chapters:
        print("No chapters parsed. Check SUBCHAPTERS_DATA format.")
        return

    total_subs = sum(len(c["subs"]) for c in chapters)
    print(f"Parsed {len(chapters)} chapters, {total_subs} subchapters.")

    project  = r.GetProjectManager().GetCurrentProject()
    timeline = project.GetCurrentTimeline() if project else None
    if not timeline:
        print("No active timeline.")
        return

    fps     = float(timeline.GetSetting("timelineFrameRate") or 24.0)
    fps_int = int(round(fps))
    start_tc        = timeline.GetStartTimecode() or "00:00:00:00"
    start_tc_frames = _tc_to_frames(start_tc, fps_int)
    tw = int(timeline.GetSetting("timelineResolutionWidth")  or 0) or None
    th = int(timeline.GetSetting("timelineResolutionHeight") or 0) or None
    print(f"Timeline: {start_tc}  {fps_int}fps  {tw}x{th}")

    try:
        tl_end = int(timeline.GetEndFrame() or 0) - (start_tc_frames or 0)
    except Exception:
        tl_end = 0
    if tl_end <= 0:
        tl_end = int(round(total_subs * 180 * fps_int))

    # Lock audio tracks
    audio_count = int(timeline.GetTrackCount("audio") or 0)
    orig_locks  = {}
    for idx in range(1, audio_count + 1):
        try:
            orig_locks[idx] = bool(timeline.GetIsTrackLocked("audio", idx))
            timeline.SetTrackLock("audio", idx, True)
        except Exception:
            orig_locks[idx] = False

    # Remove old named tracks and sky markers
    for name in (CHAPTER_TRACK_NAME, SUB_TRACK_NAME):
        deleted = _delete_tracks_named(timeline, name)
        if deleted:
            print(f"Removed {deleted} existing '{name}' track(s).")

    deleted_ok = False
    try:
        deleted_ok = bool(timeline.DeleteMarkersByColor(MARKER_COLOR))
        print(f"DeleteMarkersByColor('{MARKER_COLOR}'): {deleted_ok}")
    except Exception as e:
        print(f"DeleteMarkersByColor exception: {e}")

    if not deleted_ok:
        try:
            existing = timeline.GetMarkers() or {}
            sky_frames = [fid for fid, m in existing.items()
                          if m.get("color") == MARKER_COLOR]
            print(f"  Fallback: {len(sky_frames)} Sky markers at {sky_frames[:6]}")
            for fid in sky_frames:
                for ref in (fid, fid - start_tc_frames):
                    try:
                        if timeline.DeleteMarkerAtFrame(ref):
                            break
                    except Exception:
                        pass
        except Exception as e:
            print(f"  Fallback failed: {e}")


    orig_marks = timeline.GetMarkInOut() or {}
    all_subs   = [(ch, sub) for ch in chapters for sub in ch["subs"]]

    def _lock_all_video(tl):
        count = int(tl.GetTrackCount("video") or 0)
        locks = {}
        for idx in range(1, count + 1):
            try:
                locks[idx] = bool(tl.GetIsTrackLocked("video", idx))
                tl.SetTrackLock("video", idx, True)
            except Exception:
                locks[idx] = False
        return locks

    def _restore_video_locks(tl, locks):
        for idx, was in locks.items():
            try:
                tl.SetTrackLock("video", idx, bool(was))
            except Exception:
                pass

    # ── PASS 1: Chapter clips ─────────────────────────────────────────────────
    pre_ch_locks = _lock_all_video(timeline)
    chapter_track = _add_named_track(timeline, CHAPTER_TRACK_NAME)
    print(f"Chapter Titles → Track {chapter_track}  (all others locked)")

    for ci, ch in enumerate(chapters):
        if not ch["subs"]:
            continue
        in_frame = int(round(ch["subs"][0]["start_secs"] * fps_int))
        if ci + 1 < len(chapters) and chapters[ci + 1]["subs"]:
            out_frame = int(round(chapters[ci + 1]["subs"][0]["start_secs"] * fps_int)) - 1
        else:
            out_frame = tl_end - 1
        if out_frame <= in_frame:
            out_frame = in_frame + fps_int

        ch_num, ch_title = _split_chapter_title(ch["title"])
        label = f"{ch_num}\n{ch_title}"
        print(f"  Ch {ci+1}: {ch_num} — {ch_title}")

        ok = _place_clip(timeline, label,
                         CHAPTER_CENTER, CHAPTER_TEXT_SIZE,
                         tw, th, in_frame, out_frame,
                         start_tc_frames, fps_int)
        _clear_marks(timeline)
        if not ok:
            print(f"    Warning: could not insert chapter clip")

    _restore_video_locks(timeline, pre_ch_locks)
    try:
        timeline.SetTrackLock("video", chapter_track, True)
    except Exception:
        pass

    # ── PASS 2: Subchapter clips ──────────────────────────────────────────────
    pre_locks = _lock_all_video(timeline)
    sub_track = _add_named_track(timeline, SUB_TRACK_NAME)
    print(f"Sub Titles → Track {sub_track}  (all others locked)")

    for si, (ch, sub) in enumerate(all_subs):
        in_frame = int(round(sub["start_secs"] * fps_int))
        if si + 1 < len(all_subs):
            out_frame = int(round(all_subs[si + 1][1]["start_secs"] * fps_int)) - 1
        else:
            out_frame = tl_end - 1
        if out_frame <= in_frame:
            out_frame = in_frame + fps_int

        label = f"{sub['number']} — {sub['title']}"
        print(f"  [{si+1}/{len(all_subs)}] {label}")

        ok = _place_clip(timeline, label,
                         SUB_CENTER, SUB_TEXT_SIZE,
                         tw, th, in_frame, out_frame,
                         start_tc_frames, fps_int)
        _clear_marks(timeline)
        if not ok:
            print(f"    Warning: could not insert sub clip")

        for ref in (in_frame, start_tc_frames + in_frame):
            try:
                timeline.DeleteMarkerAtFrame(ref)
            except Exception:
                pass
        ok = timeline.AddMarker(in_frame, MARKER_COLOR, label, ch["title"], 1, "")
        if not ok:
            print(f"    Marker failed at frame {in_frame}")

    _restore_video_locks(timeline, pre_locks)
    try:
        timeline.SetTrackLock("video", chapter_track, False)
        timeline.SetTrackLock("video", sub_track, False)
    except Exception:
        pass

    # Restore marks and audio locks
    _clear_marks(timeline)
    try:
        v = orig_marks.get("video")
        a = orig_marks.get("audio")
        if v and "in" in v and "out" in v:
            timeline.SetMarkInOut(int(v["in"]), int(v["out"]), "video")
        if a and "in" in a and "out" in a:
            timeline.SetMarkInOut(int(a["in"]), int(a["out"]), "audio")
    except Exception:
        pass
    for idx, was_locked in orig_locks.items():
        try:
            timeline.SetTrackLock("audio", int(idx), bool(was_locked))
        except Exception:
            pass

    print(f"\nDone! {len(chapters)} chapter clips + {len(all_subs)} subchapter clips + {len(all_subs)} markers.")


create_micro_chapters()
