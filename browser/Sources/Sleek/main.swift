// Sleek, the browser. Run with no arguments it is the app; `--url <address>` opens that page;
// `--selftest <folder>` runs the checks in SelfTest.swift, writes pictures there, and quits.
import AppKit

MainActor.assumeIsolated {
  let app = NSApplication.shared
  app.delegate = App.shared
  app.setActivationPolicy(Res.selfTest != nil ? .accessory : .regular)
  app.run()
}
