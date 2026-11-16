// Where you are, for a page you have allowed to know (a map, a weather page, a TV service checking that you are
// in its area).
//
// On the Mac the web engine does not find the place itself: the browser has to hand it over. This file does that.
// When a page you said yes to (Tab.swift asks you) wants the place, the engine tells this file to start; it asks
// the Mac (which asks you, once, whether Sleek may know where you are), and passes each place it is given on to
// the engine, until no page wants it any more. Nothing is asked of the Mac until a page you allowed asks.
//
// (This is a part of the engine Apple doesn't promise to keep. Without it, a page that asks is told the place
// can't be found, as it was before this file.)
import AppKit
import CoreLocation
import WebKit

@MainActor
final class Location: NSObject, CLLocationManagerDelegate {
  static let shared = Location()
  /// For the app's own checks: a place to hand over instead of asking the Mac (so no question appears on screen).
  var fixed: CLLocation?

  private typealias Ref = UnsafeRawPointer
  private struct Provider {      // the engine's "geolocation provider", version 1
    var version: Int32 = 1, clientInfo: UnsafeRawPointer? = nil
    var start: (@convention(c) (UnsafeRawPointer?, UnsafeRawPointer?) -> Void)?
    var stop: (@convention(c) (UnsafeRawPointer?, UnsafeRawPointer?) -> Void)?
    var accuracy: (@convention(c) (UnsafeRawPointer?, Bool, UnsafeRawPointer?) -> Void)?
  }
  private static func find<T>(_ name: String, _: T.Type) -> T? { dlsym(UnsafeMutableRawPointer(bitPattern: -2), name).map { unsafeBitCast($0, to: T.self) } }
  private let managerOf = find("WKContextGetGeolocationManager", (@convention(c) (Ref?) -> Ref?).self)
  private let setProvider = find("WKGeolocationManagerSetProvider", (@convention(c) (Ref?, UnsafeRawPointer?) -> Void).self)
  private let position = find("WKGeolocationPositionCreate", (@convention(c) (Double, Double, Double, Double) -> Ref?).self)
  private let changed = find("WKGeolocationManagerProviderDidChangePosition", (@convention(c) (Ref?, Ref?) -> Void).self)
  private let failed = find("WKGeolocationManagerProviderDidFailToDeterminePosition", (@convention(c) (Ref?) -> Void).self)
  private let release = find("WKRelease", (@convention(c) (Ref?) -> Void).self)
  /// Whether this Mac's engine has the part this file leans on. If not, pages are not asked about at all.
  var works: Bool { managerOf != nil && setProvider != nil && position != nil && changed != nil && failed != nil }

  private var wanting: [Ref] = []      // the engine's managers that have a page waiting for the place
  private var seen = Set<Ref>()
  private var mac: CLLocationManager?
  private var last: CLLocation?

  /// Tell the engine that the pages of this configuration get their place from here.
  func serve(_ c: WKWebViewConfiguration) {
    guard works, let m = managerOf?(UnsafeRawPointer(Unmanaged.passUnretained(c.processPool).toOpaque())), seen.insert(m).inserted else { return }
    var p = Provider()
    p.start = { m, _ in MainActor.assumeIsolated { Location.shared.start(m) } }
    p.stop = { m, _ in MainActor.assumeIsolated { Location.shared.stop(m) } }
    p.accuracy = { _, _, _ in }
    withUnsafePointer(to: &p) { setProvider?(m, UnsafeRawPointer($0)) }      // the engine keeps its own copy
  }
  private func start(_ m: Ref?) {
    guard let m = m else { return }
    if !wanting.contains(m) { wanting.append(m) }
    if let f = fixed { give(f); return }
    if mac == nil { let l = CLLocationManager(); l.delegate = self; l.desiredAccuracy = kCLLocationAccuracyHundredMeters; mac = l }
    guard let mac = mac else { return }
    switch mac.authorizationStatus {
    case .denied, .restricted: fail()
    case .notDetermined: mac.requestWhenInUseAuthorization()      // the Mac asks you; the answer arrives below
    default: if let l = last, Date().timeIntervalSince(l.timestamp) < 300 { give(l) }; mac.startUpdatingLocation()
    }
  }
  private func stop(_ m: Ref?) { wanting.removeAll { $0 == m }; if wanting.isEmpty { mac?.stopUpdatingLocation() } }
  private func give(_ l: CLLocation) {
    guard let p = position?(l.timestamp.timeIntervalSince1970, l.coordinate.latitude, l.coordinate.longitude, max(1, l.horizontalAccuracy)) else { return }
    for m in wanting { changed?(m, p) }
    release?(p)      // made for us to hand over; the engine keeps what it needs
  }
  private func fail() { for m in wanting { failed?(m) } }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      guard !self.wanting.isEmpty, let mac = self.mac else { return }
      switch mac.authorizationStatus { case .denied, .restricted: self.fail(); case .notDetermined: break; default: mac.startUpdatingLocation() }
    }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in if let l = locations.last { self.last = l; self.give(l) } }
  }
  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in if (error as? CLError)?.code != .locationUnknown { self.fail() } }      // "not known yet" is not a failure: the Mac keeps trying
  }
}
