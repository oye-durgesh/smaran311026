# Samran — Prototype Flow Build Prompt (New Page, Claude Design)

## Instruction to give Claude Design, as one prompt

```
Create a NEW page in this file called "Prototype Flow". Do not edit, move,
or delete anything on the existing static screens page — this new page is
additive only.

On "Prototype Flow", place a COPY (instance/duplicate, not a link back to
the original) of every screen listed below, arranged left-to-right, top-to-
bottom in the order given, with generous spacing (at least 200px) between
each frame so connection arrows are easy to read. Then wire up click
interactions between them exactly as specified in the flow map below, using
standard click-through prototyping (tap a hotspot on Screen A \u2192 navigate
to Screen B, with a simple instant or short-fade transition unless a
specific transition is called out).

Add a single green "START HERE" marker/flag on the first screen (Splash 1)
so the prototype has one clear entry point when presented or played.

Every screen keeps its exact existing visual design \u2014 this pass only adds
clickable hotspots and navigation arrows, no new visual elements except
where explicitly noted (e.g. the "Simulate reminder call" trigger).
```

---

## Full screen list (in build order)

1. Splash / Intro 1 (logo mark, animated entrance)
2. Intro 2 — What Sathi does
3. Intro 3 — Who it's for
4. Permission Explainer — Notifications
5. Permission Explainer — Microphone
6. Setup Screen 1 — You & Your Medicine
7. Setup Screen 2 — When & How Long (incl. Course Length + Doctor Appointment)
8. Setup Screen 3 — Voice & Confirm
9. Setup Complete (animated success)
10. Home Panel (default state)
11. Medicine Detail Panel (bottom sheet)
12. Add Reminder popup (bottom sheet)
13. Reminder Call — Ringing state
14. Reminder Call — Listening/Answered state
15. Home Panel — Missed Reminder banner variant
16. Adherence History
17. Family / Caregiver — empty state
18. Caregiver Invite — Share Link sheet
19. Reminder Call — Doctor Appointment variant

---

## Flow map — exact connections to wire

```
1. Splash 1
   \u2192 tap "Next"  \u2192 Screen 2
   \u2192 tap "Skip"  \u2192 Screen 4 (Permission: Notifications)

2. Intro 2
   \u2192 tap "Next"  \u2192 Screen 3
   \u2192 tap "Skip"  \u2192 Screen 4

3. Intro 3
   \u2192 tap "Get Started"  \u2192 Screen 4

4. Permission: Notifications
   \u2192 tap "Allow Notifications"  \u2192 Screen 5
   \u2192 tap "Not now"              \u2192 Screen 5   (same next step either way \u2014
       permission grant/deny doesn't branch the demo flow, just proceeds)

5. Permission: Microphone
   \u2192 tap "Allow Microphone"  \u2192 Screen 6
   \u2192 tap "Not now"           \u2192 Screen 6

6. Setup 1 — You & Your Medicine
   \u2192 tap "Continue"  \u2192 Screen 7
   \u2192 tap back-arrow  \u2192 Screen 5

7. Setup 2 — When & How Long
   \u2192 tap "Continue"  \u2192 Screen 8
   \u2192 tap back-arrow  \u2192 Screen 6

8. Setup 3 — Voice & Confirm
   \u2192 tap "Confirm & Save"  \u2192 Screen 9
   \u2192 tap any edit-pencil icon on the review card \u2192 back to Screen 6 or 7
       (whichever section that field belongs to \u2014 wire each pencil icon to
       its own source screen individually, not all to one)
   \u2192 tap back-arrow  \u2192 Screen 7

9. Setup Complete
   \u2192 tap "Go to Home"  \u2192 Screen 10

10. Home Panel (default state)
    \u2192 tap the "Metformin" medicine card       \u2192 Screen 11 (opens as overlay)
    \u2192 tap "+ Add reminder"                     \u2192 Screen 12 (opens as overlay)
    \u2192 tap "History" tab (bottom nav)           \u2192 Screen 16
    \u2192 tap "Family" tab (bottom nav)             \u2192 Screen 17
    \u2192 ADD a small non-visual "Simulate reminder call" trigger \u2014 a subtle
      button or the clock icon in the top stat chip \u2014 that jumps to Screen 13,
      purely so the call-screen sequence can be demonstrated without waiting
      for a real scheduled time
    \u2192 ADD a second small trigger (e.g. long-press or a secondary icon) that
      jumps to Screen 19, to demonstrate the doctor-appointment call variant
      separately from the medicine call

11. Medicine Detail Panel (sheet)
    \u2192 tap outside the sheet / swipe down  \u2192 back to Screen 10
    \u2192 tap "Edit"            \u2192 back to Screen 7 (time/frequency fields live there)
    \u2192 tap "Remove medicine" \u2192 back to Screen 10 (skip the confirm-dialog
        micro-state for this pass unless you want it as its own small overlay)

12. Add Reminder popup (sheet)
    \u2192 tap outside the sheet / swipe down  \u2192 back to Screen 10
    \u2192 tap "Medicine" card  \u2192 Screen 6 (hands off into the full setup flow)
    \u2192 tap "Water" card     \u2192 back to Screen 10 (placeholder \u2014 no dedicated
        water setup screen exists yet in this pass)
    \u2192 tap "Routine" card   \u2192 back to Screen 10 (same placeholder note)

13. Reminder Call — Ringing
    \u2192 tap "Answer"                        \u2192 Screen 14
    \u2192 tap "Not now"                       \u2192 Screen 15
    \u2192 tap "Remind me in 15 minutes" text  \u2192 Screen 10 (default state, not
        the missed variant, since this is an active postpone, not a miss)

14. Reminder Call — Listening/Answered
    \u2192 after a short delay OR tap anywhere on screen  \u2192 Screen 10 (default
        state, medicine card should now show as "Taken" \u2014 if the prototyping
        tool supports it, swap Screen 10's target instance to a "Taken" state
        variant here; otherwise this is a known limitation to note, see below)

15. Home Panel — Missed Reminder banner variant
    \u2192 tap "Mark as taken" on the banner  \u2192 Screen 10 (default state)
    \u2192 tap the Amlodipine card (shown Missed here)  \u2192 Screen 11
    \u2192 tap "History" / "Family" tabs  \u2192 same targets as Screen 10 (16 / 17)

16. Adherence History
    \u2192 tap "Home" tab (bottom nav)     \u2192 Screen 10
    \u2192 tap "Family" tab                \u2192 Screen 17

17. Family — empty state
    \u2192 tap "Home" tab                  \u2192 Screen 10
    \u2192 tap "History" tab               \u2192 Screen 16
    \u2192 tap "Invite a Family Member"    \u2192 Screen 18 (opens as overlay)

18. Caregiver Invite — Share Link sheet
    \u2192 tap outside the sheet / swipe down  \u2192 back to Screen 17
    \u2192 tap "Share Link"                     \u2192 back to Screen 17 (demo end
        point for this branch \u2014 no native share sheet to prototype)

19. Reminder Call — Doctor Appointment variant
    \u2192 tap "Answer"      \u2192 Screen 10
    \u2192 tap "Not now"     \u2192 Screen 10
```

---

## Notes on known limitations to flag back to whoever builds this

```
- Static-state limitation: tapping "Answer" on a medicine reminder call
  (Screen 13\u201214) can't dynamically flip that specific medicine card to
  "Taken" on Home unless the prototyping tool supports component state
  variants tied to prototype actions (e.g. Figma's "Set variant" action).
  If that's available, wire Screen 14's exit action to set Home's Metformin
  card to its "Taken" variant. If not, just route to the plain default
  Home (Screen 10) and note in the presentation that the real app would
  update this live.
- The three edit-pencil icons on the Setup 3 review card (Screen 8) each
  need their OWN individual hotspot and destination \u2014 don't wire all three
  to one generic "back" action, since the whole point of that interaction
  is jumping to the specific field, not just "somewhere earlier."
- Water and Routine reminder types route back to Home as placeholders in
  this pass, since no dedicated screens for those exist yet \u2014 this is
  expected, not a bug, until those screens are designed.
- Keep every hotspot at least the size of the actual tappable element in
  the static design (don't shrink tap targets just to make the prototype
  wiring easier to see) \u2014 this preserves the accessibility intent already
  built into the static screens.
```
