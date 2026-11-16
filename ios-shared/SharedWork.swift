// The Sleek browser, Sleek Docs and Sleek Slides share their work with the other Sleek apps on the iPhone through
// Work.swift (../browser/Sources/Sleek): this is how each of them turns that on. See Shared.swift.
import Foundation

extension Work {
  /// Share this app's work as `app`, holding `holds` ("tasks", "pages", "decks"). While the app checks itself, or when it
  /// was built without the App Group, its copy is kept in `fallback` alone, as before.
  func share(as app: String, holds: Set<String>, else fallback: URL) {
    guard Res.selfTest == nil, let me = Shared.place(app) else { folder = fallback; return }
    folder = me; peers = Shared.peers(of: app); shares = holds; soon = 1.5; settle = 3000; tell = Shared.tell
    Shared.listen { Task { @MainActor in await Work.shared.pull() } }
  }
  /// The app is being left: write what changed now, with time to finish (`wait` first lets an open page save itself).
  func leaving(wait: Double = 0) {
    Shared.whileLeaving { if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1e9)) }; await Work.shared.keepCopy(now: true) }
  }
}
