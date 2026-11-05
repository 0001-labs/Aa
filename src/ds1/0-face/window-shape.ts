// The shape of a window with a computer's chrome. A window is a thing people know the shape of: 16:10
// on a computer and, on a phone's width alone, 4:5. `ds-window` draws itself to these numbers, and the
// `window.shape` constraint measures every other frame around a computer's chrome against them.

/** The width of a window, over its height. */
export const WINDOW_RATIO = 16 / 10;
/** What a window stands at on a phone's width: what the phone has room for, and the tallest any window goes. */
export const PHONE_WINDOW_RATIO = 4 / 5;
/** At this page width and under, thirty squares, a page is on a phone. */
export const PHONE_WIDTH = 600;
/** The tallest a computer's window stands: a window taller than it is wide stops reading as one. */
export const TALLEST_WINDOW_RATIO = 1;

/** The narrowest width over height a window may have in a page this wide. */
export const windowRatioFloor = (pageWidth: number) => pageWidth <= PHONE_WIDTH ? PHONE_WINDOW_RATIO : TALLEST_WINDOW_RATIO;
