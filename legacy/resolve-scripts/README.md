# DaVinci Resolve Chapter Script Instructions

This script automates the creation of chapter titles in DaVinci Resolve.

## How to Install

1.  Open DaVinci Resolve.
2.  Go to the **Console** (Workspace -> Console) and click the **Py3** icon to ensure Python 3 is working.
3.  Place the `create_chapters.py` file in the Resolve script directory:
    -   **macOS**: `/Users/adam/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Comp/`
    -   *Or* simply run it via the Console (Script -> Run Script...).

## How to Use

1.  Open your project and the timeline you want to add chapters to.
2.  Go to `Workspace -> Scripts -> create_chapters`.
3.  The script will:
    -   Create a new video track.
    -   Add `Text+` clips at the specified timestamps.
    -   Set the text to the chapter title.
    -   Position the text below the center (matching your layout).

## Customizing Chapters

To change the chapters, simply edit the `CHAPTER_DATA` variable inside `create_chapters.py` with your new timestamps and titles.

```python
CHAPTERS_DATA = """
00:00 — Chapter 1: Your Title
01:45 — Chapter 2: Another Title
"""
```
