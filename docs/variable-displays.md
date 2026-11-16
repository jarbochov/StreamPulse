# Reusable inventories, tables and badges

Build a display once in **Library → Display Library**, then place it in any Custom Overlay. Choose **Inventory**, **Table** or **Badge**. Each placement can follow different live data while sharing the same arrangement and appearance.

![Display Library with fictional saved designs](images/display-library.png)

![Inventory Builder using fictional equipment and players](images/inventory-builder.png)

**Variable Sets own the data.** Your equipment catalog contains reusable item names, images and optional upgrade levels. Each person's Tracker contains only that person's progress.

**The display owns the design.** Choose catalog items, put them in order, and organize them into named sections. Auto Grid packs items in that order. Fixed Slots keeps intentional gaps, so a missing item never moves another item into its place. Appearance controls are specific to those items, table cells or member badges.

**The overlay owns the placement.** Choose the saved design and whose tracker to follow, then position and resize it. Use the Custom Overlay Editor for overall opacity, outer borders, shadows and other placement effects, not the library. Text, borders and images scale together. Saving a shared design updates every placement; it does not reset anyone's progress.

## Two players, one design

1. In **Variables Studio → Sets**, create an Equipment catalog with Name and Image fields. Add your items and optional explicit upgrade labels/images.
2. Create People with an Equipment **Tracker** targeting that catalog. Add your players. Their progress maps are independent.
3. Optionally create Schedule with Player 1 and Player 2 **Linked entry** fields targeting People. Assign the players to an event and select that event in Schedule's first slot.
4. Open **Display Library**, create an Inventory design, choose Equipment, and add items. Reorder them, create sections, or choose Fixed Slots. Set columns, spacing and appearance; save.
5. In **Custom Overlay Editor → + Add → Saved Display**, choose your design. For the source, choose Schedule, Active entry, Player 1, and the Equipment tracker. Duplicate the element and choose Player 2 on the duplicate. Alternatively follow a fixed Person or occupied People slot directly.
6. Save the overlay and add its browser-source URL to OBS. Change progress in **Variable Set Operator → Tracker**, or use Companion's existing Tracker set/step/toggle/reset actions. Reassigning a Schedule role changes the displayed owner without changing People's live slots.

An unassigned role, missing catalog/design, incompatible tracker, or disabled Variable Sets module hides the production display instead of showing the wrong inventory. Whole catalog mode has no owner and shows the arranged items without progress filtering.

Show all items with unearned ones dimmed, or show earned items only. Auto Grid closes gaps in earned-only mode; Fixed Slots preserves the original cell positions. Fixed cells are zero-based, row-major within each section: cell 0 is the first position, cell 5 the sixth. Changing columns wraps those cell numbers onto the new grid without changing item order.

Preview owner and backdrop choices are local preferences, not shared design settings. Previewing a different player does not change anyone's progress or live selection.

## Tables for schedules and structured data

Create a **Table**, choose a Variable Set, then select and reorder its columns. A schedule might show Start, Event, Duration and Player 1's name. Linked Person fields read shared definitions directly: reassigning the role updates the row without copying a person's details into the schedule.

Choose column labels, proportions, alignment and presentation for text, images, colors or toggles. Arrange rows manually or sort by a field. In the overlay, choose all enabled entries, the active entry, occupied slots, grouped entries or explicitly ordered rows. A linked-entry list can supply a curated lineup. These are row selections, not inventory Trackers.

![Table Builder with a fictional expedition schedule](images/table-builder.png)

## Badge design belongs in the library

Choose **Badge** for reusable member cards and strips. Badge fields, images, zones, presets, typography and visual styling live in Display Library rather than an overlay dialog. Place a Saved Display and choose its live source in the overlay inspector; use **Edit display** to return to the designer.

The **Card Zone Blueprint** follows the selected badge layout and avatar visibility. Choose an editing field or click its pill, then click a zone to move it. On laptop screens the blueprint, selected field inspector and live preview use separate columns, so the map does not consume the field editor's height. **Strip** arranges multiple badges; **Appearance** styles the member cards, avatars and field defaults.

Existing badge/strip layers are migrated to reusable designs while their placement-specific sources and geometry remain with the overlay. Sharing one design between scenes no longer requires separately maintaining every copy's field layout.

![Badge Builder using fictional members](images/badge-display-builder.png)

## Persistence and transfer

Designs live in `data/variable-displays.json`; sources and placements live in the custom overlay; progress remains in Variable Sets. Full backups include all three and the uploaded assets. Selective overlay/preset share ZIPs reject Saved Display dependencies with a clear message: use a **full backup** when transferring these linked designs.

## Built to grow with your show

The Display Library separates reusable designs from live data and placement. Inventory, Table and Badge are focused workflows on that shared foundation, without crowding the overlay inspector.

Open **Docs → Display Library** and **API → Saved Displays** inside StreamPulse for complete setup instructions, request/response shapes, validation limits, placement examples and live-update events. Companion's existing Tracker actions operate progress without turning the deck into another design editor.
