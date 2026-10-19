/** @jest-environment jsdom */
import Config from "../src/config";
import { getContentApp } from "../src/content/app";
import { addHotkeyListener } from "../src/content/hotkeyHandler";
import { getRuleRuntime, isRuleEngineEnabled } from "../src/content/skipRules/bridge";
import { contentState } from "../src/content/state";
import { ActionType, CategorySkipOption, ChannelIDStatus, SponsorTime } from "../src/types";
import { getChannelIDInfo, getVideo } from "../src/utils/video";

jest.mock("../src/config", () => ({
    __esModule: true,
    default: { config: {
        skipKeybind: { key: "Enter" },
        skipToHighlightKeybind: { key: "Enter", ctrl: true },
        closeSkipNoticeKeybind: { key: "Backspace" },
        startSponsorKeybind: { key: ";" },
        actuallySubmitKeybind: { key: "'", ctrl: true },
        previewKeybind: { key: ";", ctrl: true },
        submitKeybind: { key: "'" },
        categorySelections: [{ name: "jumpscare", option: 2 }],
        disableSkipping: false,
        forceChannelCheck: false,
    } },
}));
jest.mock("../src/config/config", () => ({
    keybindEquals: (a, b) => !!b && a?.key === b.key &&
        !!a?.ctrl === !!b.ctrl && !!a?.alt === !!b.alt && !!a?.shift === !!b.shift,
}));
jest.mock("../src/utils", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ biliBiliPlayerDanmakuInputBlur: jest.fn() })),
}));
jest.mock("../src/utils/video", () => ({ getVideo: jest.fn(), getFrameRate: jest.fn(), getChannelIDInfo: jest.fn() }));
jest.mock("../src/utils/cleanup", () => ({ addCleanupListener: jest.fn() }));
jest.mock("../src/content/app", () => ({ getContentApp: jest.fn() }));
jest.mock("../src/content/skipRules/bridge", () => ({ getRuleRuntime: jest.fn(), isRuleEngineEnabled: jest.fn() }));
jest.mock("../src/content/state", () => ({
    contentState: { sponsorTimes: [], channelWhitelisted: false, activeSkipKeybindElement: null },
}));

const segment = (overrides: Partial<SponsorTime> = {}): SponsorTime => ({
    UUID: "A", cid: "1", segment: [10, 20],
    category: "jumpscare", actionType: ActionType.Mute, source: undefined,
    ...overrides,
} as SponsorTime);
const execute = jest.fn();
const toggleSkip = jest.fn(() => false);
const isExcluded = jest.fn(() => false);
const video = { currentTime: 15 };
const fireSkip = () => {
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event;
};

beforeAll(() => addHotkeyListener());
beforeEach(() => {
    jest.clearAllMocks();
    video.currentTime = 15;
    Config.config.categorySelections = [{ name: "jumpscare", option: CategorySkipOption.AutoSkip }];
    Config.config.disableSkipping = false;
    Config.config.forceChannelCheck = false;
    contentState.channelWhitelisted = false;
    contentState.activeSkipKeybindElement = null;
    contentState.sponsorTimes = [segment()];
    (getVideo as jest.Mock).mockReturnValue(video);
    (getChannelIDInfo as jest.Mock).mockReturnValue({ status: ChannelIDStatus.Found });
    (getContentApp as jest.Mock).mockReturnValue({ commands: { execute }, ui: { getState: () => ({ skipButtonControlBar: null }) } });
    (getRuleRuntime as jest.Mock).mockReturnValue({ toggleSkip, isExcluded });
    (isRuleEngineEnabled as jest.Mock).mockReturnValue(false);
});

test.each(["legacy", "rules"])("the %s shortcut skips to the end even without a visible notice", mode => {
    (isRuleEngineEnabled as jest.Mock).mockReturnValue(mode === "rules");
    const e = fireSkip();
    expect(e.defaultPrevented).toBe(true);
    expect(execute).toHaveBeenCalledWith("skip/reskip", {
        segment: contentState.sponsorTimes[0], forceSeek: true,
    });
    expect(toggleSkip).not.toHaveBeenCalled();
});

test("the shortcut never skips a jumpscare excluded by the rules engine", () => {
    (isRuleEngineEnabled as jest.Mock).mockReturnValue(true);
    isExcluded.mockReturnValue(true);
    fireSkip();
    expect(execute).not.toHaveBeenCalled();
    expect(toggleSkip).toHaveBeenCalledTimes(1);
});

test.each([
    "category disabled", "global disable", "whitelisted", "channel fetching", "hidden segment", "outside segment", "other category",
])("the shortcut respects %s", reason => {
    if (reason === "category disabled") Config.config.categorySelections = [{ name: "jumpscare", option: CategorySkipOption.Disabled }];
    if (reason === "global disable") Config.config.disableSkipping = true;
    if (reason === "whitelisted") contentState.channelWhitelisted = true;
    if (reason === "channel fetching") {
        Config.config.forceChannelCheck = true;
        (getChannelIDInfo as jest.Mock).mockReturnValue({ status: ChannelIDStatus.Fetching });
    }
    if (reason === "hidden segment") contentState.sponsorTimes = [segment({ hidden: 3 })];
    if (reason === "outside segment") video.currentTime = 20;
    if (reason === "other category") contentState.sponsorTimes = [segment({ category: "sponsor" })];
    fireSkip();
    expect(execute).not.toHaveBeenCalled();
    expect(toggleSkip).toHaveBeenCalledTimes(1);
});

test("overlapping jumpscares skip to the latest end", () => {
    const later = segment({ UUID: "B", segment: [12, 30] });
    contentState.sponsorTimes.push(later);
    fireSkip();
    expect(execute).toHaveBeenCalledWith("skip/reskip", { segment: later, forceSeek: true });
});
