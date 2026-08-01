/**
 * Press versus press-and-hold.
 *
 * The hardware's grammar has both, and they mean different things on the same
 * encoder — press the Perform dial for the mode list, hold it to lock the
 * mode. So a press cannot fire on the way down: it has to wait to find out
 * whether you are going to let go.
 *
 *   0ms     the press begins. Nothing happens yet.
 *   50ms    the ring appears. Late enough that an ordinary tap never flashes
 *           it, early enough to answer "is it doing something?"
 *   750ms   the ring is full and the hold fires. Releasing before this is a
 *           press; releasing after it does nothing more, because the hold
 *           already happened.
 *
 * Shared by the knobs and the keyboard so the two cannot drift apart, and
 * exported for the stylesheet's animation to stay in step with the timer.
 */

/** When the ring starts to show, in milliseconds after the press begins. */
export const HOLD_SHOW_MS = 50

/** When the ring is full and the hold fires. */
export const HOLD_MS = 750
