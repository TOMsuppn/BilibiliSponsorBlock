import { ActionType, CategorySkipOption, SponsorTime } from "../types";

/** Find the active protective mute segment without relying on a visible skip notice. */
export function findActiveJumpscareSegment(
    segments: readonly SponsorTime[],
    currentTime: number | undefined,
    option: CategorySkipOption | undefined,
    isExcluded: (segment: SponsorTime) => boolean = () => false
): SponsorTime | undefined {
    if (currentTime === undefined || !Number.isFinite(currentTime) ||
        option === undefined || option === CategorySkipOption.Disabled) return undefined;

    let active: SponsorTime | undefined;
    for (const segment of segments) {
        const [start, end] = segment.segment;
        if (segment.category !== "jumpscare" || segment.actionType !== ActionType.Mute ||
            segment.hidden !== undefined || end === undefined ||
            currentTime < start || currentTime >= end || isExcluded(segment)) continue;
        // Overlapping jumpscares should not seek into another active jumpscare.
        if (!active || end > (active.segment[1] ?? 0)) active = segment;
    }
    return active;
}
